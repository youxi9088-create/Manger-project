// F:\个人\app\openclaw\packages\server\src\services\agent-tools-write.ts
// 写操作工具：新建/更新记录，封装现有路由层相同的业务逻辑

import dbInstance from "./db.js";
import type { AgentTool } from "./agent-tools.js";

// ---------- 内部工具函数 ----------

function generateId(prefix: string, table: string): string {
  const d = new Date();
  const dateStr = d.toISOString().slice(0, 10).replace(/-/g, "");
  const pfx = `${prefix}-${dateStr}-`;
  const row = dbInstance
    .prepare(`SELECT id FROM ${table} WHERE id LIKE ? ORDER BY id DESC LIMIT 1`)
    .get(`${pfx}%`) as { id: string } | undefined;
  const seq = row ? parseInt(row.id.split("-").pop() || "0", 10) + 1 : 1;
  return `${pfx}${String(seq).padStart(3, "0")}`;
}

function nowStr(): string {
  return new Date().toLocaleString("sv-SE", { timeZone: "Asia/Shanghai" }).replace(" ", "T");
}

// ---------- 注册函数 ----------

export function registerWriteTools(register: (tool: AgentTool) => void): void {

  // ===== 新建项目立项 =====
  register({
    definition: {
      name: "create_project",
      description: "新建项目立项记录。type 可选 quick_validation（快速验证）或 pre_to_formal（预立项转正式）",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "项目名称" },
          type: { type: "string", description: "立项类型：quick_validation 或 pre_to_formal", enum: ["quick_validation", "pre_to_formal"] },
          description: { type: "string", description: "项目描述（可选）" },
          priority: { type: "string", description: "优先级：high/medium/low，默认 medium", enum: ["high", "medium", "low"] },
        },
        required: ["title", "type"],
      },
    },
    execute: async (params) => {
      const id = generateId("PI", "project_initiations");
      const ts = nowStr();
      dbInstance.prepare(`
        INSERT INTO project_initiations (id, title, type, description, priority, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
      `).run(id, params.title, params.type, params.description ?? null, params.priority ?? "medium", ts, ts);
      return dbInstance.prepare("SELECT * FROM project_initiations WHERE id = ?").get(id);
    },
  });

  // ===== 新建需求分析 =====
  register({
    definition: {
      name: "create_requirement",
      description: "新建需求分析记录，关联已有立项",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "需求标题" },
          initiation_id: { type: "string", description: "关联立项 ID，如 PI-20240101-001" },
          raw_input: { type: "string", description: "需求原始描述内容" },
        },
        required: ["title"],
      },
    },
    execute: async (params) => {
      const id = generateId("RA", "requirement_analyses");
      const ts = nowStr();
      dbInstance.prepare(`
        INSERT INTO requirement_analyses (id, initiation_id, title, input_type, raw_input, status, created_at, updated_at)
        VALUES (?, ?, ?, 'text', ?, 'draft', ?, ?)
      `).run(id, params.initiation_id ?? null, params.title, params.raw_input ?? null, ts, ts);
      return dbInstance.prepare("SELECT * FROM requirement_analyses WHERE id = ?").get(id);
    },
  });

  // ===== 更新需求状态 =====
  register({
    definition: {
      name: "update_requirement_status",
      description: "更新需求分析的状态。status 可选：draft/analyzed/tasked/in_progress/done。注意：状态通常由系统根据需求内容和关联任务自动计算，仅在手动干预时使用此工具",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "需求 ID，如 RA-20240101-001" },
          status: { type: "string", description: "新状态：draft/analyzed/tasked/in_progress/done", enum: ["draft", "analyzed", "tasked", "in_progress", "done"] },
        },
        required: ["id", "status"],
      },
    },
    execute: async (params) => {
      const result = dbInstance.prepare(
        "UPDATE requirement_analyses SET status = ?, updated_at = ? WHERE id = ?"
      ).run(params.status, nowStr(), params.id);
      if (result.changes === 0) return { error: "需求不存在或未变更" };
      return dbInstance.prepare("SELECT id, title, status FROM requirement_analyses WHERE id = ?").get(params.id);
    },
  });

  // ===== 新建开发任务 =====
  register({
    definition: {
      name: "create_dev_task",
      description: "新建开发任务，关联已有需求",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "任务标题" },
          requirement_id: { type: "string", description: "关联需求 ID，如 RA-20240101-001" },
          description: { type: "string", description: "任务详情描述（可选）" },
          assignee_id: { type: "string", description: "负责人员工 ID（可选）" },
          priority: { type: "string", description: "优先级：high/medium/low，默认 medium", enum: ["high", "medium", "low"] },
        },
        required: ["title", "requirement_id"],
      },
    },
    execute: async (params) => {
      const id = generateId("DT", "dev_tasks");
      const ts = nowStr();
      dbInstance.prepare(`
        INSERT INTO dev_tasks (id, requirement_id, title, description, assignee_id, priority, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'todo', ?, ?)
      `).run(id, params.requirement_id, params.title, params.description ?? null, params.assignee_id ?? null, params.priority ?? "medium", ts, ts);
      return dbInstance.prepare("SELECT * FROM dev_tasks WHERE id = ?").get(id);
    },
  });

  // ===== 派发工单给员工 =====
  register({
    definition: {
      name: "assign_employee",
      description: "将开发任务分配给指定员工（更新 dev_tasks 的 assignee_id）",
      parameters: {
        type: "object",
        properties: {
          task_id: { type: "string", description: "开发任务 ID，如 DT-20240101-001" },
          employee_id: { type: "string", description: "员工 ID，如 EMP-20240101-001" },
        },
        required: ["task_id", "employee_id"],
      },
    },
    execute: async (params) => {
      const result = dbInstance.prepare(
        "UPDATE dev_tasks SET assignee_id = ?, updated_at = ? WHERE id = ?"
      ).run(params.employee_id, nowStr(), params.task_id);
      if (result.changes === 0) return { error: "任务不存在" };
      return { success: true, task_id: params.task_id, assigned_to: params.employee_id };
    },
  });
}
