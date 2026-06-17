import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import * as db from "../services/db.js";
import { syncAllProjectStatuses } from "../services/db.js";
import cron from "node-cron";
import dayjs from "dayjs";

const router = Router();

const cronJobs = new Map<string, cron.ScheduledTask>();

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
    const { name, cronExpression } = req.body;
    if (!name || !cronExpression) {
      return res.status(400).json({ error: '名称和Cron表达式不能为空' });
    }
    const now = new Date().toISOString();
    const task = db.createScheduledTask({
      id: uuidv4(), name, cron_expression: cronExpression,
      enabled: 1, last_run_at: null, next_run_at: null,
      last_status: null, created_at: now, updated_at: now,
    });
    res.json({ task });
  } catch (error: any) {
    res.status(500).json({ error: error?.message });
  }
});

router.patch("/api/schedules/:taskId", (req, res) => {
  try {
    const { taskId } = req.params;
    const { name, cronExpression, enabled } = req.body;
    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (cronExpression !== undefined) updates.cron_expression = cronExpression;
    if (enabled !== undefined) updates.enabled = enabled ? 1 : 0;
    const success = db.updateScheduledTask(taskId, updates);
    if (!success) return res.status(404).json({ error: "定时任务不存在" });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error?.message });
  }
});

router.delete("/api/schedules/:taskId", (req, res) => {
  try {
    const { taskId } = req.params;
    const success = db.deleteScheduledTask(taskId);
    if (!success) return res.status(404).json({ error: "定时任务不存在" });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error?.message });
  }
});

// ============= 定时任务管理 =============

function startScheduledTask(taskId: string) {
  stopScheduledTask(taskId);
  const task = db.getScheduledTask(taskId);
  if (!task || !task.enabled) return;

  try {
    const job = cron.schedule(task.cron_expression, async () => {
      console.log(`[Cron] 执行任务: ${task.name}`);
      const runAt = new Date().toISOString();
      db.updateScheduledTask(taskId, { last_run_at: runAt });
      try {
        // 项目状态同步任务
        if (task.name.includes('项目') || task.name.includes('同步') || task.name.includes('sync')) {
          const results = syncAllProjectStatuses();
          const updated = results.filter(r => r.result.updated);
          console.log(`[Cron] 项目同步完成: ${updated.length}/${results.length} 个项目已更新`);
        }
        db.updateScheduledTask(taskId, { last_status: 'success', next_run_at: dayjs().add(1, 'day').format('YYYY-MM-DDTHH:mm:ss') });
      } catch (error: any) {
        db.updateScheduledTask(taskId, { last_status: 'error' });
        console.error(`[Cron] 任务执行失败: ${task.name}`, error);
      }
    });
    cronJobs.set(taskId, job);
    console.log(`[Cron] 已启动定时任务: ${task.name} (${task.cron_expression})`);
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
  const tasks = db.getAllScheduledTasks();
  for (const task of tasks) {
    if (task.enabled) startScheduledTask(task.id);
  }
  console.log(`[Cron] 初始化完成，已启动 ${cronJobs.size} 个定时任务`);
}

export function ensureDefaultScheduledTask() {
  const tasks = db.getAllScheduledTasks();
  const now = new Date().toISOString();
  let created = false;
  if (tasks.length === 0) {
    db.createScheduledTask({
      id: uuidv4(), name: '每日工作分析（每天 18:00）',
      cron_expression: '0 18 * * *', enabled: 1,
      last_run_at: null, next_run_at: null, last_status: null,
      created_at: now, updated_at: now,
    });
    console.log('[Init] 已创建默认定时任务：每日工作分析（每天 18:00）');
    created = true;
  }
  // 确保有项目状态同步任务（每天 9:00 和 18:00）
  const hasSyncTask = tasks.some(t => t.name.includes('项目同步'));
  if (!hasSyncTask) {
    db.createScheduledTask({
      id: uuidv4(), name: '项目状态同步（每天 9:00 / 18:00）',
      cron_expression: '0 9,18 * * *', enabled: 1,
      last_run_at: null, next_run_at: null, last_status: null,
      created_at: now, updated_at: now,
    });
    console.log('[Init] 已创建默认定时任务：项目状态同步（每天 9:00 / 18:00）');
    created = true;
  }
  if (created) {
    initScheduledTasks();
  }
}

export default router;
