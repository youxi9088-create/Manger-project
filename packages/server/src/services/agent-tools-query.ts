// F:\个人\app\openclaw\packages\server\src\services\agent-tools-query.ts
// 只读查询工具，封装常用的数据查询操作

import dbInstance from "./db.js";
import { enrichRequirement } from "./requirement-service.js";
import type { AgentTool } from "./agent-tools.js";

export function registerQueryTools(register: (tool: AgentTool) => void): void {

  // ===== 系统状态 =====
  register({
    definition: {
      name: "get_system_status",
      description: "获取系统概览数据：项目数、需求数、开发任务数、员工数、版本数",
      parameters: { type: "object", properties: {}, required: [] },
    },
    execute: async () => {
      const counts = {
        projects: (dbInstance.prepare("SELECT COUNT(*) as n FROM project_initiations").get() as { n: number }).n,
        requirements: (dbInstance.prepare("SELECT COUNT(*) as n FROM requirement_analyses").get() as { n: number }).n,
        dev_tasks: (dbInstance.prepare("SELECT COUNT(*) as n FROM dev_tasks").get() as { n: number }).n,
        employees: (dbInstance.prepare("SELECT COUNT(*) as n FROM employees").get() as { n: number }).n,
        versions: (dbInstance.prepare("SELECT COUNT(*) as n FROM versions").get() as { n: number }).n,
        active_tasks: (dbInstance.prepare("SELECT COUNT(*) as n FROM dev_tasks WHERE status != 'done'").get() as { n: number }).n,
      };
      return counts;
    },
  });

  // ===== 项目立项 =====
  register({
    definition: {
      name: "get_project_by_id",
      description: "根据立项 ID 获取项目详情。ID 格式如 PI-20240624-001",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "立项 ID" },
        },
        required: ["id"],
      },
    },
    execute: async (params) => {
      const row = dbInstance.prepare("SELECT * FROM project_initiations WHERE id = ?").get(params.id as string);
      return row || { error: "项目不存在" };
    },
  });

  register({
    definition: {
      name: "query_projects",
      description: "查询项目立项列表，支持按状态/类型/标题关键词筛选。status 可选：active/pending/completed/cancelled",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", description: "立项状态，可选值：active, pending, completed, cancelled" },
          type: { type: "string", description: "立项类型，可选值：quick_validation, pre_to_formal" },
          title: { type: "string", description: "标题关键词（模糊匹配）" },
          limit: { type: "string", description: "最多返回条数，默认 20" },
        },
      },
    },
    execute: async (params) => {
      let sql = "SELECT * FROM project_initiations WHERE 1=1";
      const args: string[] = [];
      if (params.status) { sql += " AND status = ?"; args.push(params.status as string); }
      if (params.type) { sql += " AND type = ?"; args.push(params.type as string); }
      if (params.title) { sql += " AND title LIKE ?"; args.push(`%${params.title}%`); }
      sql += " ORDER BY created_at DESC LIMIT ?";
      args.push(String(params.limit ?? 20));
      return dbInstance.prepare(sql).all(...args);
    },
  });

  // ===== 需求分析 =====
  register({
    definition: {
      name: "get_requirement_by_id",
      description: "根据需求 ID 获取需求详情。ID 格式如 RA-20240624-001",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "需求 ID" },
        },
        required: ["id"],
      },
    },
    execute: async (params) => {
      const row = dbInstance.prepare("SELECT * FROM requirement_analyses WHERE id = ?").get(params.id as string) as Parameters<typeof enrichRequirement>[0];
      return row ? enrichRequirement(row) : { error: "需求不存在" };
    },
  });

  register({
    definition: {
      name: "query_requirements",
      description: "查询需求分析列表，支持按状态/立项 ID 筛选。status 可选：draft/analyzed/tasked/in_progress/done（注意：返回数据中的 computed_status 字段为系统自动计算的实际状态）",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", description: "需求状态" },
          project_id: { type: "string", description: "关联立项 ID，如 PI-20240101-001" },
          limit: { type: "string", description: "最多返回条数，默认 20" },
        },
      },
    },
    execute: async (params) => {
      let sql = "SELECT * FROM requirement_analyses WHERE 1=1";
      const args: string[] = [];
      if (params.status) { sql += " AND status = ?"; args.push(params.status as string); }
      if (params.project_id) { sql += " AND project_id = ?"; args.push(params.project_id as string); }
      sql += " ORDER BY created_at DESC LIMIT ?";
      args.push(String(params.limit ?? 20));
      return dbInstance.prepare(sql).all(...args);
    },
  });

  // ===== 开发任务 =====
  register({
    definition: {
      name: "get_dev_task_by_id",
      description: "根据任务 ID 获取开发任务详情。ID 格式如 DT-20240624-001",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "开发任务 ID" },
        },
        required: ["id"],
      },
    },
    execute: async (params) => {
      const row = dbInstance.prepare("SELECT * FROM dev_tasks WHERE id = ?").get(params.id as string);
      return row || { error: "任务不存在" };
    },
  });

  register({
    definition: {
      name: "query_dev_tasks",
      description: "查询开发任务列表，支持按状态/需求 ID/负责人筛选",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", description: "任务状态：todo/in_progress/testing/done" },
          requirement_id: { type: "string", description: "关联需求 ID" },
          assignee_id: { type: "string", description: "负责人员工 ID" },
          limit: { type: "string", description: "最多返回条数，默认 20" },
        },
      },
    },
    execute: async (params) => {
      let sql = "SELECT * FROM dev_tasks WHERE 1=1";
      const args: string[] = [];
      if (params.status) { sql += " AND status = ?"; args.push(params.status as string); }
      if (params.requirement_id) { sql += " AND requirement_id = ?"; args.push(params.requirement_id as string); }
      if (params.assignee_id) { sql += " AND assignee_id = ?"; args.push(params.assignee_id as string); }
      sql += " ORDER BY created_at DESC LIMIT ?";
      args.push(String(params.limit ?? 20));
      return dbInstance.prepare(sql).all(...args);
    },
  });

  // ===== 员工 =====
  register({
    definition: {
      name: "query_employees",
      description: "查询员工列表，支持按状态/名称/是否为 Agent 筛选",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", description: "员工状态：available/busy/off/leave" },
          name: { type: "string", description: "员工姓名（模糊匹配）" },
          is_agent: { type: "string", description: "是否为 Agent，传 'true' 仅返回 Agent 员工" },
          limit: { type: "string", description: "最多返回条数，默认 30" },
        },
      },
    },
    execute: async (params) => {
      let sql = "SELECT id, name, rank, skills, status, power_level, agent_type FROM employees WHERE 1=1";
      const args: string[] = [];
      if (params.status) { sql += " AND status = ?"; args.push(params.status as string); }
      if (params.name) { sql += " AND name LIKE ?"; args.push(`%${params.name}%`); }
      if (params.is_agent === "true") { sql += " AND agent_type IS NOT NULL"; }
      sql += " ORDER BY created_at DESC LIMIT ?";
      args.push(String(params.limit ?? 30));
      return dbInstance.prepare(sql).all(...args);
    },
  });

  // ===== 版本 =====
  register({
    definition: {
      name: "query_versions",
      description: "查询版本列表，支持按状态筛选。status 可选：pending_confirm/confirmed/in_progress/testing/ready_release/released/delayed",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", description: "版本状态" },
          limit: { type: "string", description: "最多返回条数，默认 10" },
        },
      },
    },
    execute: async (params) => {
      let sql = "SELECT * FROM versions WHERE 1=1";
      const args: string[] = [];
      if (params.status) { sql += " AND status = ?"; args.push(params.status as string); }
      sql += " ORDER BY created_at DESC LIMIT ?";
      args.push(String(params.limit ?? 10));
      return dbInstance.prepare(sql).all(...args);
    },
  });

  // ===== 工作周期 =====
  register({
    definition: {
      name: "query_work_cycles",
      description: "查询员工工作周期（派发的工单），支持按员工 ID/状态筛选",
      parameters: {
        type: "object",
        properties: {
          employee_id: { type: "string", description: "员工 ID" },
          status: { type: "string", description: "工单状态：queued/active/completed/cancelled" },
          limit: { type: "string", description: "最多返回条数，默认 20" },
        },
      },
    },
    execute: async (params) => {
      let sql = "SELECT * FROM work_cycles WHERE 1=1";
      const args: string[] = [];
      if (params.employee_id) { sql += " AND employee_id = ?"; args.push(params.employee_id as string); }
      if (params.status) { sql += " AND status = ?"; args.push(params.status as string); }
      sql += " ORDER BY created_at DESC LIMIT ?";
      args.push(String(params.limit ?? 20));
      return dbInstance.prepare(sql).all(...args);
    },
  });

  // ===== IM 聊天记录 =====
  register({
    definition: {
      name: "query_chat_records",
      description: "查询 IM 聊天记录，支持按关键词/发送人/时间范围筛选",
      parameters: {
        type: "object",
        properties: {
          keyword: { type: "string", description: "搜索关键词（模糊匹配消息内容）" },
          sender: { type: "string", description: "发送人名称（模糊匹配）" },
          start_date: { type: "string", description: "起始日期，格式 YYYY-MM-DD" },
          end_date: { type: "string", description: "结束日期，格式 YYYY-MM-DD" },
          limit: { type: "string", description: "最多返回条数，默认 50" },
        },
      },
    },
    execute: async (params) => {
      let sql = "SELECT id, sender_name, content, timestamp, message_type FROM im_chat_records WHERE 1=1";
      const args: string[] = [];
      if (params.keyword) { sql += " AND content LIKE ?"; args.push(`%${params.keyword}%`); }
      if (params.sender) { sql += " AND sender_name LIKE ?"; args.push(`%${params.sender}%`); }
      if (params.start_date) { sql += " AND timestamp >= ?"; args.push(`${params.start_date}T00:00:00`); }
      if (params.end_date) { sql += " AND timestamp <= ?"; args.push(`${params.end_date}T23:59:59`); }
      sql += " ORDER BY timestamp DESC LIMIT ?";
      args.push(String(params.limit ?? 50));
      return dbInstance.prepare(sql).all(...args);
    },
  });

  // ===== 分析报告 =====
  register({
    definition: {
      name: "query_reports",
      description: "查询 IM 聊天分析报告列表，支持按日期范围筛选",
      parameters: {
        type: "object",
        properties: {
          start_date: { type: "string", description: "起始日期，格式 YYYY-MM-DD" },
          end_date: { type: "string", description: "结束日期，格式 YYYY-MM-DD" },
          limit: { type: "string", description: "最多返回条数，默认 10" },
        },
      },
    },
    execute: async (params) => {
      let sql = "SELECT id, report_date, summary, created_at FROM analysis_reports WHERE 1=1";
      const args: string[] = [];
      if (params.start_date) { sql += " AND report_date >= ?"; args.push(params.start_date as string); }
      if (params.end_date) { sql += " AND report_date <= ?"; args.push(params.end_date as string); }
      sql += " ORDER BY report_date DESC LIMIT ?";
      args.push(String(params.limit ?? 10));
      return dbInstance.prepare(sql).all(...args);
    },
  });
}
