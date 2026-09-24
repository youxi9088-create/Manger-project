// F:\youxi\app\openclaw\packages\server\src\services\agent-tools-write.ts
// 写操作工具：新建/更新记录，通过业务 service 函数复用路由层逻辑

import type { AgentTool } from "./agent-tools.js";
import {
  createProjectInitiation,
  updateProjectInitiation,
  transitionProjectPhase,
  updateProject as updateProjectFields,
  addProjectMember,
  syncProjectStatus,
} from "./project-service.js";
import {
  createRequirement,
  updateRequirement,
  deleteRequirement,
  createDevTask,
  updateDevTask,
  assignDevTask,
  deleteDevTask,
} from "./requirement-service.js";
import { upsertDailyPlanWrapper, updateDailyPlanTaskWrapper, deleteDailyPlanTaskWrapper } from "./daily-plan-service.js";

// ---------- 注册函数 ----------

export function registerWriteTools(register: (tool: AgentTool) => void): void {

  // ===== 新建项目立项 =====
  register({
    definition: {
      name: "create_project",
      description: "新建项目立项记录，创建后状态为 draft（草稿）。type 可选 quick_validation（快速验证）或 pre_to_formal（预立项转正式）",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "项目名称" },
          type: { type: "string", description: "立项类型：quick_validation 或 pre_to_formal", enum: ["quick_validation", "pre_to_formal"] },
          description: { type: "string", description: "项目描述（可选），会写入 raw_requirement" },
        },
        required: ["title", "type"],
      },
    },
    execute: async (params) => {
      return createProjectInitiation({
        title: params.title,
        type: params.type,
        raw_requirement: params.description ?? null,
      });
    },
  });

  // ===== 更新项目立项 =====
  register({
    definition: {
      name: "update_project",
      description: "更新项目立项的基本信息（如标题、负责人、截止日期、风险等级等）",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "立项 ID，如 PI-20240623-001" },
          title: { type: "string", description: "项目名称" },
          project_leader: { type: "string", description: "项目负责人" },
          deadline: { type: "string", description: "截止日期，格式 YYYY-MM-DD" },
          risk_level: { type: "string", description: "风险等级：low/medium/high", enum: ["low", "medium", "high"] },
          status: { type: "string", description: "状态：draft/pending/approved/executing/archived 等" },
        },
        required: ["id"],
      },
    },
    execute: async (params) => {
      const result = updateProjectInitiation(params.id as string, {
        title: params.title,
        project_leader: params.project_leader,
        deadline: params.deadline,
        risk_level: params.risk_level,
        status: params.status,
      });
      if (!result) return { error: "项目不存在或无变更" };
      return result;
    },
  });

  // ===== 项目阶段流转 =====
  register({
    definition: {
      name: "transition_project_phase",
      description: "推进项目阶段。action 可选：submit（提交）、approve（审批通过）、start_execution（开始执行）、archive（归档）等",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "立项 ID" },
          action: { type: "string", description: "流转动作：submit/approve/start_planning/lock_plan/start_execution/submit_delivery/start_review/accept/reject/archive" },
          reason: { type: "string", description: "流转原因（可选）" },
        },
        required: ["id", "action"],
      },
    },
    requireConfirm: true,
    execute: async (params) => {
      const result = transitionProjectPhase(params.id as string, params.action as string, params.reason as string | undefined);
      if (!result.success) return { error: result.error };
      return result;
    },
  });

  // ===== 添加项目成员 =====
  register({
    definition: {
      name: "add_project_member",
      description: "为项目添加成员",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "string", description: "立项 ID" },
          employee_id: { type: "string", description: "员工 ID" },
          role: { type: "string", description: "角色：owner/leader/member/reviewer，默认 member", enum: ["owner", "leader", "member", "reviewer"] },
        },
        required: ["project_id", "employee_id"],
      },
    },
    execute: async (params) => {
      const member = addProjectMember(params.project_id as string, params.employee_id as string, (params.role as string) || "member");
      if (!member) return { error: "添加成员失败，可能已存在" };
      return member;
    },
  });

  // ===== 同步项目状态 =====
  register({
    definition: {
      name: "sync_project_status",
      description: "根据项目下的需求和任务自动重新计算项目阶段与进度",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "立项 ID" },
        },
        required: ["id"],
      },
    },
    execute: async (params) => {
      const result = syncProjectStatus(params.id as string);
      if (!result) return { error: "项目不存在或同步失败" };
      return result;
    },
  });

  // ===== 新建需求分析 =====
  register({
    definition: {
      name: "create_requirement",
      description: "新建需求分析记录，关联已有立项或项目",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "需求标题" },
          initiation_id: { type: "string", description: "关联立项 ID，如 PI-20240623-001" },
          project_id: { type: "string", description: "关联项目 ID（与 initiation_id 二选一或同时）" },
          raw_input: { type: "string", description: "需求原始描述内容" },
        },
        required: ["title"],
      },
    },
    execute: async (params) => {
      return createRequirement({
        title: params.title,
        initiation_id: params.initiation_id,
        project_id: params.project_id,
        raw_input: params.raw_input,
      });
    },
  });

  // ===== 更新需求 =====
  register({
    definition: {
      name: "update_requirement",
      description: "更新需求分析的内容、状态或关联信息",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "需求 ID，如 RA-20240623-001" },
          title: { type: "string", description: "需求标题" },
          raw_input: { type: "string", description: "原始需求描述" },
          status: { type: "string", description: "状态：draft/analyzed/tasked/in_progress/done", enum: ["draft", "analyzed", "tasked", "in_progress", "done"] },
        },
        required: ["id"],
      },
    },
    execute: async (params) => {
      const result = updateRequirement(params.id as string, {
        title: params.title,
        raw_input: params.raw_input,
        status: params.status,
      });
      if (!result) return { error: "需求不存在或无变更" };
      return result;
    },
  });

  // ===== 删除需求 =====
  register({
    definition: {
      name: "delete_requirement",
      description: "删除需求分析记录（会级联删除关联的开发任务）",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "需求 ID" },
        },
        required: ["id"],
      },
    },
    requireConfirm: true,
    execute: async (params) => {
      const ok = deleteRequirement(params.id as string);
      if (!ok) return { error: "需求不存在" };
      return { success: true, id: params.id };
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
          requirement_id: { type: "string", description: "关联需求 ID，如 RA-20240623-001" },
          description: { type: "string", description: "任务详情描述（可选）" },
          assignee: { type: "string", description: "负责人员工 ID（可选）" },
          priority: { type: "string", description: "优先级：high/medium/low，默认 medium", enum: ["high", "medium", "low"] },
          category: { type: "string", description: "任务分类：frontend/backend/design/interaction/rendering/test/other", enum: ["frontend", "backend", "design", "interaction", "rendering", "test", "other"] },
          estimated_hours: { type: "number", description: "预估工时（可选）" },
        },
        required: ["title", "requirement_id"],
      },
    },
    execute: async (params) => {
      return createDevTask({
        title: params.title,
        requirement_id: params.requirement_id,
        description: params.description,
        assignee: params.assignee,
        priority: params.priority,
        category: params.category,
        estimated_hours: params.estimated_hours,
      });
    },
  });

  // ===== 更新开发任务 =====
  register({
    definition: {
      name: "update_dev_task",
      description: "更新开发任务的状态、负责人、优先级或预估工时",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "开发任务 ID，如 DT-20240623-001" },
          status: { type: "string", description: "任务状态：todo/in_progress/testing/done", enum: ["todo", "in_progress", "testing", "done"] },
          assignee: { type: "string", description: "负责人员工 ID" },
          priority: { type: "string", description: "优先级：high/medium/low", enum: ["high", "medium", "low"] },
          estimated_hours: { type: "number", description: "预估工时" },
          title: { type: "string", description: "任务标题" },
        },
        required: ["id"],
      },
    },
    execute: async (params) => {
      const result = updateDevTask(params.id as string, {
        status: params.status,
        assignee: params.assignee,
        priority: params.priority,
        estimated_hours: params.estimated_hours,
        title: params.title,
      });
      if (!result) return { error: "任务不存在或无变更" };
      return result;
    },
  });

  // ===== 分配任务给员工 =====
  register({
    definition: {
      name: "assign_employee",
      description: "将开发任务分配给指定员工（更新 dev_tasks 的 assignee）",
      parameters: {
        type: "object",
        properties: {
          task_id: { type: "string", description: "开发任务 ID，如 DT-20240623-001" },
          employee_id: { type: "string", description: "员工 ID，如 EMP-20240623-001" },
        },
        required: ["task_id", "employee_id"],
      },
    },
    execute: async (params) => {
      const result = assignDevTask(params.task_id as string, params.employee_id as string);
      if (!result) return { error: "任务不存在" };
      return { success: true, task_id: params.task_id, assigned_to: params.employee_id };
    },
  });

  // ===== 删除开发任务 =====
  register({
    definition: {
      name: "delete_dev_task",
      description: "删除开发任务",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "开发任务 ID" },
        },
        required: ["id"],
      },
    },
    requireConfirm: true,
    execute: async (params) => {
      const ok = deleteDevTask(params.id as string);
      if (!ok) return { error: "任务不存在" };
      return { success: true, id: params.id };
    },
  });

  // ===== 更新每日计划 =====
  register({
    definition: {
      name: "upsert_daily_plan",
      description: "创建或覆盖某日的每日计划（包含目标与任务列表）。日期格式 YYYY-MM-DD",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "日期，如 2024-06-23" },
          goal_text: { type: "string", description: "今日目标" },
          tasks: {
            type: "array",
            description: "任务列表，每项包含 title, status, priority, assignee, estimate_minutes, notes",
            items: { type: "object", properties: {} },
          },
        },
        required: ["date", "tasks"],
      },
    },
    execute: async (params) => {
      const date = String(params.date);
      const goalText = String(params.goal_text || "");
      const tasks = Array.isArray(params.tasks) ? params.tasks : [];
      return upsertDailyPlanWrapper(date, goalText, tasks as any[]);
    },
  });

  // ===== 更新每日计划任务 =====
  register({
    definition: {
      name: "update_daily_plan_task",
      description: "更新每日计划中的单个任务状态或内容",
      parameters: {
        type: "object",
        properties: {
          task_id: { type: "string", description: "任务 ID" },
          title: { type: "string", description: "任务标题" },
          status: { type: "string", description: "状态：todo/in_progress/completed/abandoned" },
          priority: { type: "string", description: "优先级：high/medium/low" },
          assignee: { type: "string", description: "负责人" },
          estimate_minutes: { type: "number", description: "预估分钟数" },
        },
        required: ["task_id"],
      },
    },
    execute: async (params) => {
      const ok = updateDailyPlanTaskWrapper(params.task_id as string, {
        title: params.title as string | undefined,
        status: params.status as any,
        priority: params.priority as any,
        assignee: params.assignee as string | undefined,
        estimate_minutes: typeof params.estimate_minutes === "number" ? params.estimate_minutes : undefined,
      });
      if (!ok) return { error: "任务不存在或无变更" };
      return { success: true, task_id: params.task_id };
    },
  });

  // ===== 删除每日计划任务 =====
  register({
    definition: {
      name: "delete_daily_plan_task",
      description: "删除每日计划中的单个任务",
      parameters: {
        type: "object",
        properties: {
          task_id: { type: "string", description: "任务 ID" },
        },
        required: ["task_id"],
      },
    },
    requireConfirm: true,
    execute: async (params) => {
      const ok = deleteDailyPlanTaskWrapper(params.task_id as string);
      if (!ok) return { error: "任务不存在" };
      return { success: true, task_id: params.task_id };
    },
  });
}
