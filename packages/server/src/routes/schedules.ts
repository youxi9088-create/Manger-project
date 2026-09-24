import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import * as db from "../services/db.js";
import { syncAllProjectStatuses } from "../services/db.js";
import { runDailyUpdatePipeline, runKbSyncOnly, runProjectSyncOnly, getRecentUpdateLogs } from "../services/daily-update.js";
import cron from "node-cron";
import dayjs from "dayjs";

const router = Router();

const cronJobs = new Map<string, cron.ScheduledTask>();

// ============= 手动触发每日更新流水线 =============

router.post("/api/daily-update/run", async (req, res) => {
  try {
    const result = await runDailyUpdatePipeline();
    res.json({
      success: result.success,
      message: `每日更新流水线完成 (${result.durationMs}ms)`,
      data: result,
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "流水线执行失败" });
  }
});

router.get("/api/daily-update/logs", (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 7, 30);
    const logs = getRecentUpdateLogs(limit);
    res.json({ success: true, data: logs });
  } catch (error: any) {
    res.status(500).json({ error: error?.message });
  }
});

// ============= 定时任务 CRUD =============

router.get("/api/schedules", (req, res) => {
  try {
    const tasks = db.getAllScheduledTasks();
    res.json({ tasks });
  } catch (error: any) {
    res.status(500).json({ error: error?.message });
  }
});

router.post("/api/schedules", (req, res) => {
  try {
    const { name, type, config, cronExpression } = req.body;
    if (!name || !cronExpression) {
      return res.status(400).json({ error: "名称和Cron表达式不能为空" });
    }
    const now = new Date().toISOString();
    const task = db.createScheduledTask({
      id: uuidv4(),
      name,
      type: type || "project_sync",
      config: config ? JSON.stringify(config) : null,
      cron_expression: cronExpression,
      enabled: 1,
      last_run_at: null,
      next_run_at: null,
      last_status: null,
      created_at: now,
      updated_at: now,
    });
    // 如果启用，立即启动
    if (task.enabled) {
      startScheduledTask(task.id);
    }
    res.json({ task });
  } catch (error: any) {
    res.status(500).json({ error: error?.message });
  }
});

router.patch("/api/schedules/:taskId", (req, res) => {
  try {
    const { taskId } = req.params;
    const { name, type, config, cronExpression, enabled } = req.body;
    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (type !== undefined) updates.type = type;
    if (config !== undefined) updates.config = typeof config === "string" ? config : JSON.stringify(config);
    if (cronExpression !== undefined) updates.cron_expression = cronExpression;
    if (enabled !== undefined) updates.enabled = enabled ? 1 : 0;
    const success = db.updateScheduledTask(taskId, updates);
    if (!success) return res.status(404).json({ error: "定时任务不存在" });
    // 重启任务以应用变更
    stopScheduledTask(taskId);
    if (enabled !== false) {
      startScheduledTask(taskId);
    }
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error?.message });
  }
});

router.delete("/api/schedules/:taskId", (req, res) => {
  try {
    const { taskId } = req.params;
    stopScheduledTask(taskId);
    const success = db.deleteScheduledTask(taskId);
    if (!success) return res.status(404).json({ error: "定时任务不存在" });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error?.message });
  }
});

// ============= 手动触发任务 =============

router.post("/api/schedules/:taskId/run", async (req, res) => {
  try {
    const { taskId } = req.params;
    const task = db.getScheduledTask(taskId);
    if (!task) return res.status(404).json({ error: "定时任务不存在" });

    const runAt = new Date().toISOString();
    db.updateScheduledTask(taskId, { last_run_at: runAt });

    const result = await executeTaskByType(task);
    db.updateScheduledTask(taskId, {
      last_status: result.success ? "success" : "error",
      next_run_at: dayjs().add(1, "day").format("YYYY-MM-DDTHH:mm:ss"),
    });

    res.json({ success: result.success, message: result.message, details: result.details });
  } catch (error: any) {
    res.status(500).json({ error: error?.message });
  }
});

// ============= 通用任务执行器 =============

interface TaskExecutionResult {
  success: boolean;
  message: string;
  details?: any;
}

async function executeTaskByType(task: db.DbScheduledTask): Promise<TaskExecutionResult> {
  const type = task.type || "project_sync";
  console.log(`[Cron] 执行任务: ${task.name} (type=${type})`);

  try {
    switch (type) {
      case "daily_pipeline": {
        const result = await runDailyUpdatePipeline();
        return {
          success: result.success,
          message: `每日更新流水线完成 (${result.durationMs}ms)`,
          details: result,
        };
      }

      case "feishu_pull": {
        const { runDailyUpdatePipeline } = await import("../services/daily-update.js");
        const result = await runDailyUpdatePipeline();
        return {
          success: result.steps.feishuPull.success,
          message: result.steps.feishuPull.message,
          details: result.steps.feishuPull.details,
        };
      }

      case "kb_sync": {
        const result = runKbSyncOnly();
        return result;
      }

      case "project_sync":
      default: {
        const results = syncAllProjectStatuses();
        const updated = results.filter((r) => r.result?.updated);
        return {
          success: true,
          message: `项目同步完成: ${updated.length}/${results.length} 个项目已更新`,
          details: updated.map((r) => r.projectId),
        };
      }
    }
  } catch (error: any) {
    console.error(`[Cron] 任务执行失败: ${task.name}`, error);
    return {
      success: false,
      message: `执行失败: ${error.message}`,
      details: error.message,
    };
  }
}

// ============= 定时任务管理 =============

function startScheduledTask(taskId: string) {
  stopScheduledTask(taskId);
  const task = db.getScheduledTask(taskId);
  if (!task || !task.enabled) return;

  try {
    const job = cron.schedule(task.cron_expression, async () => {
      const runAt = new Date().toISOString();
      db.updateScheduledTask(taskId, { last_run_at: runAt });
      try {
        const result = await executeTaskByType(task);
        db.updateScheduledTask(taskId, {
          last_status: result.success ? "success" : "error",
          next_run_at: dayjs().add(1, "day").format("YYYY-MM-DDTHH:mm:ss"),
        });
      } catch (error: any) {
        db.updateScheduledTask(taskId, { last_status: "error" });
        console.error(`[Cron] 任务执行失败: ${task.name}`, error);
      }
    });
    cronJobs.set(taskId, job);
    console.log(`[Cron] 已启动定时任务: ${task.name} (${task.type}) (${task.cron_expression})`);
  } catch (error: any) {
    console.error(`[Cron] 启动任务失败: ${task.name}`, error);
  }
}

function stopScheduledTask(taskId: string) {
  const job = cronJobs.get(taskId);
  if (job) {
    job.stop();
    cronJobs.delete(taskId);
  }
}

export function initScheduledTasks() {
  // 先停止所有旧任务，防止 tsx watch 重载后同一任务被重复注册
  cron.getTasks().forEach((job) => job.stop());
  cron.getTasks().clear();
  cronJobs.clear();

  const tasks = db.getAllScheduledTasks();
  const seenNames = new Set<string>();
  for (const task of tasks) {
    if (seenNames.has(task.name)) continue;
    seenNames.add(task.name);
    if (task.enabled) startScheduledTask(task.id);
  }
  console.log(`[Cron] 初始化完成，已启动 ${cronJobs.size} 个定时任务`);
}

export function ensureDefaultScheduledTask() {
  const tasks = db.getAllScheduledTasks();
  const now = new Date().toISOString();
  let created = false;

  // 1. 每日工作分析
  const hasWorkTask = tasks.some((t) => t.name.includes("每日工作分析"));
  if (!hasWorkTask) {
    db.createScheduledTask({
      id: uuidv4(),
      name: "每日工作分析（每天 18:00）",
      type: "project_sync",
      config: null,
      cron_expression: "0 18 * * *",
      enabled: 1,
      last_run_at: null,
      next_run_at: null,
      last_status: null,
      created_at: now,
      updated_at: now,
    });
    console.log("[Init] 已创建默认定时任务：每日工作分析（每天 18:00）");
    created = true;
  }

  // 2. 项目状态同步
  const hasSyncTask = tasks.some((t) => t.name.includes("项目状态同步"));
  if (!hasSyncTask) {
    db.createScheduledTask({
      id: uuidv4(),
      name: "项目状态同步（每天 9:00 / 18:00）",
      type: "project_sync",
      config: null,
      cron_expression: "0 9,18 * * *",
      enabled: 1,
      last_run_at: null,
      next_run_at: null,
      last_status: null,
      created_at: now,
      updated_at: now,
    });
    console.log("[Init] 已创建默认定时任务：项目状态同步（每天 9:00 / 18:00）");
    created = true;
  }

  // 3. 每日更新流水线（新增）
  const hasDailyPipeline = tasks.some((t) => t.name.includes("每日更新流水线"));
  if (!hasDailyPipeline) {
    db.createScheduledTask({
      id: uuidv4(),
      name: "每日更新流水线（每天 09:00）",
      type: "daily_pipeline",
      config: JSON.stringify({ steps: ["feishu_pull", "kb_sync", "project_sync"] }),
      cron_expression: "0 9 * * *",
      enabled: 1,
      last_run_at: null,
      next_run_at: null,
      last_status: null,
      created_at: now,
      updated_at: now,
    });
    console.log("[Init] 已创建默认定时任务：每日更新流水线（每天 09:00）");
    created = true;
  }

  if (created) {
    initScheduledTasks();
  }
}

export default router;
