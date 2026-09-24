// F:\youxi\app\openclaw\packages\server\src\services\requirement-service.ts
// 需求分析与开发任务业务逻辑封装，供路由和 Agent 工具复用
import dbInstance from "./db.js";
import { computeVersionRisk } from "./version-alert-service.js";
function nowStr() {
    return new Date().toLocaleString("sv-SE", { timeZone: "Asia/Shanghai" }).replace(" ", "T");
}
function generateId(prefix, table) {
    const d = new Date();
    const dateStr = d.toISOString().slice(0, 10).replace(/-/g, "");
    const pfx = `${prefix}-${dateStr}-`;
    const row = dbInstance
        .prepare(`SELECT id FROM ${table} WHERE id LIKE ? ORDER BY id DESC LIMIT 1`)
        .get(`${pfx}%`);
    const seq = row ? parseInt(row.id.split("-").pop() || "0", 10) + 1 : 1;
    return `${pfx}${String(seq).padStart(3, "0")}`;
}
export function computeRequirementStatus(req) {
    const tasks = dbInstance.prepare("SELECT status FROM dev_tasks WHERE requirement_id = ?").all(req.id);
    if (tasks.length > 0) {
        const allDone = tasks.every(t => t.status === "done");
        if (allDone)
            return "done";
        const hasActive = tasks.some(t => t.status === "in_progress" || t.status === "testing");
        if (hasActive)
            return "in_progress";
        return "tasked";
    }
    if (req.ai_analysis)
        return "analyzed";
    if (req.raw_input)
        return "draft";
    return "pending";
}
export function enrichRequirement(row) {
    return { ...row, computed_status: computeRequirementStatus(row) };
}
export function createRequirement(input) {
    const id = generateId("RA", "requirement_analyses");
    const ts = nowStr();
    dbInstance.prepare(`
    INSERT INTO requirement_analyses (id, initiation_id, title, input_type, raw_input, project_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, input.initiation_id ?? null, input.title ?? null, input.input_type ?? "text", input.raw_input ?? null, input.project_id ?? null, ts, ts);
    const row = dbInstance.prepare("SELECT * FROM requirement_analyses WHERE id = ?").get(id);
    return enrichRequirement(row);
}
const allowedRequirementUpdates = [
    "title", "initiation_id", "input_type", "raw_input", "ai_analysis",
    "status", "version_id", "from_goal_id", "project_id",
];
export function updateRequirement(id, input) {
    const existing = dbInstance.prepare("SELECT * FROM requirement_analyses WHERE id = ?").get(id);
    if (!existing)
        return null;
    const sets = [];
    const values = [];
    for (const f of allowedRequirementUpdates) {
        if (input[f] !== undefined) {
            sets.push(`${f} = ?`);
            values.push(input[f]);
        }
    }
    if (sets.length === 0)
        return null;
    sets.push("updated_at = ?");
    values.push(nowStr());
    values.push(id);
    dbInstance.prepare(`UPDATE requirement_analyses SET ${sets.join(", ")} WHERE id = ?`).run(...values);
    const row = dbInstance.prepare("SELECT * FROM requirement_analyses WHERE id = ?").get(id);
    return enrichRequirement(row);
}
export function deleteRequirement(id) {
    const result = dbInstance.prepare("DELETE FROM requirement_analyses WHERE id = ?").run(id);
    return result.changes > 0;
}
export function createDevTask(input) {
    const id = generateId("DT", "dev_tasks");
    const requirementId = String(input.requirement_id ?? "");
    const title = String(input.title ?? "");
    if (!requirementId || !title)
        throw new Error("requirement_id 和 title 必填");
    const ts = nowStr();
    dbInstance.prepare(`
    INSERT INTO dev_tasks (id, requirement_id, title, description, category, priority, status, assignee, estimated_hours, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'todo', ?, ?, ?, ?, ?)
  `).run(id, requirementId, title, input.description ?? null, input.category ?? "other", input.priority ?? "medium", input.assignee ?? null, input.estimated_hours ?? null, input.sort_order ?? 0, ts, ts);
    return dbInstance.prepare("SELECT * FROM dev_tasks WHERE id = ?").get(id);
}
const allowedDevTaskUpdates = [
    "title", "description", "category", "priority", "status", "assignee", "estimated_hours", "sort_order",
];
export function updateDevTask(id, input) {
    const existing = dbInstance.prepare("SELECT * FROM dev_tasks WHERE id = ?").get(id);
    if (!existing)
        return null;
    const sets = [];
    const values = [];
    for (const f of allowedDevTaskUpdates) {
        if (input[f] !== undefined) {
            sets.push(`${f} = ?`);
            values.push(input[f]);
        }
    }
    if (sets.length === 0)
        return null;
    sets.push("updated_at = ?");
    values.push(nowStr());
    values.push(id);
    dbInstance.prepare(`UPDATE dev_tasks SET ${sets.join(", ")} WHERE id = ?`).run(...values);
    // 同步 estimated_hours 到 work_cycles 并触发版本风险重算
    if (input.estimated_hours !== undefined) {
        dbInstance.prepare(`UPDATE work_cycles SET estimated_hours = ?, updated_at = ? WHERE task_id = ? AND status IN ('active', 'queued')`).run(input.estimated_hours, nowStr(), id);
        const task = dbInstance.prepare("SELECT requirement_id FROM dev_tasks WHERE id = ?").get(id);
        if (task?.requirement_id) {
            const reqRow = dbInstance.prepare("SELECT version_id FROM requirement_analyses WHERE id = ?").get(task.requirement_id);
            if (reqRow?.version_id) {
                try {
                    computeVersionRisk(reqRow.version_id);
                }
                catch { /* ignore */ }
            }
        }
    }
    return dbInstance.prepare("SELECT * FROM dev_tasks WHERE id = ?").get(id);
}
export function assignDevTask(taskId, employeeId) {
    return updateDevTask(taskId, { assignee: employeeId });
}
export function deleteDevTask(id) {
    const result = dbInstance.prepare("DELETE FROM dev_tasks WHERE id = ?").run(id);
    return result.changes > 0;
}
//# sourceMappingURL=requirement-service.js.map