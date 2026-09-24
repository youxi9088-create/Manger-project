import { getDailyPlan } from "./db.js";
import type { DbDailyPlanTask } from "./db.js";
export { getDailyPlan };
export declare function upsertDailyPlanWrapper(date: string, goalText: string, tasks: Omit<DbDailyPlanTask, "plan_date" | "created_at" | "updated_at">[]): {
    plan: Record<string, unknown> | null;
    tasks: DbDailyPlanTask[];
};
export declare function updateDailyPlanTaskWrapper(taskId: string, updates: Partial<Pick<DbDailyPlanTask, "title" | "status" | "priority" | "assignee" | "estimate_minutes" | "notes" | "completed_at" | "expected_completion_at">>): boolean;
export declare function deleteDailyPlanTaskWrapper(taskId: string): boolean;
//# sourceMappingURL=daily-plan-service.d.ts.map