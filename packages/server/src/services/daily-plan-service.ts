// F:\youxi\app\openclaw\packages\server\src\services\daily-plan-service.ts
// 每日计划业务逻辑封装，供路由和 Agent 工具复用

import { getDailyPlan, upsertDailyPlan, updateDailyPlanTask, deleteDailyPlanTask } from "./db.js";
import type { DbDailyPlanTask } from "./db.js";

export { getDailyPlan };

export function upsertDailyPlanWrapper(
  date: string,
  goalText: string,
  tasks: Omit<DbDailyPlanTask, "plan_date" | "created_at" | "updated_at">[]
): { plan: Record<string, unknown> | null; tasks: DbDailyPlanTask[] } {
  const result = upsertDailyPlan(date, goalText, tasks);
  return { plan: result.plan as Record<string, unknown> | null, tasks: result.tasks };
}

export function updateDailyPlanTaskWrapper(
  taskId: string,
  updates: Partial<Pick<DbDailyPlanTask, "title" | "status" | "priority" | "assignee" | "estimate_minutes" | "notes" | "completed_at" | "expected_completion_at">>
): boolean {
  return updateDailyPlanTask(taskId, updates);
}

export function deleteDailyPlanTaskWrapper(taskId: string): boolean {
  return deleteDailyPlanTask(taskId);
}
