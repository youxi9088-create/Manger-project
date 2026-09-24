// F:\youxi\app\openclaw\packages\server\src\services\daily-plan-service.ts
// 每日计划业务逻辑封装，供路由和 Agent 工具复用
import { getDailyPlan, upsertDailyPlan, updateDailyPlanTask, deleteDailyPlanTask } from "./db.js";
export { getDailyPlan };
export function upsertDailyPlanWrapper(date, goalText, tasks) {
    const result = upsertDailyPlan(date, goalText, tasks);
    return { plan: result.plan, tasks: result.tasks };
}
export function updateDailyPlanTaskWrapper(taskId, updates) {
    return updateDailyPlanTask(taskId, updates);
}
export function deleteDailyPlanTaskWrapper(taskId) {
    return deleteDailyPlanTask(taskId);
}
//# sourceMappingURL=daily-plan-service.js.map