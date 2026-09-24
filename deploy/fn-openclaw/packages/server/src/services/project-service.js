// F:\youxi\app\openclaw\packages\server\src\services\project-service.ts
// 项目立项/项目相关业务逻辑封装，供路由和 Agent 工具复用
import dbInstance from "./db.js";
import { getProjectById, updateProjectPhase, updateProject, addProjectMember, syncProjectStatus, } from "./db.js";
function nowStr() {
    return new Date().toLocaleString("sv-SE", { timeZone: "Asia/Shanghai" }).replace(" ", "T");
}
function generateInitiationId() {
    const d = new Date();
    const dateStr = d.toISOString().slice(0, 10).replace(/-/g, "");
    const prefix = `PI-${dateStr}-`;
    const row = dbInstance
        .prepare(`SELECT id FROM project_initiations WHERE id LIKE ? ORDER BY id DESC LIMIT 1`)
        .get(`${prefix}%`);
    const seq = row ? parseInt(row.id.split("-").pop() || "0", 10) + 1 : 1;
    return `${prefix}${String(seq).padStart(3, "0")}`;
}
const allowedCreateFields = [
    "type", "title", "applicant", "project_leader", "department",
    "project_type", "demand_source", "demand_date", "from_pool",
    "raw_requirement", "ai_generated_content",
];
export function createProjectInitiation(input) {
    const id = generateInitiationId();
    const ts = nowStr();
    const values = {
        id,
        type: input.type || "quick_validation",
        status: "draft",
        title: input.title ?? null,
        applicant: input.applicant ?? null,
        project_leader: input.project_leader ?? null,
        department: input.department ?? null,
        project_type: input.project_type ?? null,
        demand_source: input.demand_source ?? null,
        demand_date: input.demand_date ?? null,
        from_pool: typeof input.from_pool === "number" ? input.from_pool : 0,
        raw_requirement: input.raw_requirement ?? null,
        ai_generated_content: input.ai_generated_content ?? null,
        created_at: ts,
        updated_at: ts,
    };
    dbInstance.prepare(`
    INSERT INTO project_initiations
      (id, type, status, title, applicant, project_leader, department, project_type, demand_source, demand_date, from_pool, raw_requirement, ai_generated_content, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(values.id, values.type, values.status, values.title, values.applicant, values.project_leader, values.department, values.project_type, values.demand_source, values.demand_date, values.from_pool, values.raw_requirement, values.ai_generated_content, values.created_at, values.updated_at);
    return dbInstance.prepare("SELECT * FROM project_initiations WHERE id = ?").get(id);
}
const allowedUpdateFields = [
    "title", "applicant", "project_leader", "department", "project_type",
    "demand_source", "demand_date", "from_pool", "raw_requirement",
    "ai_generated_content", "status",
    "deadline", "start_date", "team_size_required", "team_size_current",
    "risk_level", "risk_reason", "external_project_id", "vp", "knowledge_base_path",
];
export function updateProjectInitiation(id, input) {
    const existing = dbInstance.prepare("SELECT * FROM project_initiations WHERE id = ?").get(id);
    if (!existing)
        return null;
    const sets = [];
    const values = [];
    for (const field of allowedUpdateFields) {
        if (input[field] !== undefined) {
            sets.push(`${field} = ?`);
            values.push(input[field]);
        }
    }
    if (sets.length === 0)
        return null;
    sets.push("updated_at = ?");
    values.push(nowStr());
    values.push(id);
    dbInstance.prepare(`UPDATE project_initiations SET ${sets.join(", ")} WHERE id = ?`).run(...values);
    return dbInstance.prepare("SELECT * FROM project_initiations WHERE id = ?").get(id);
}
export function submitProjectInitiation(id) {
    const existing = dbInstance.prepare("SELECT * FROM project_initiations WHERE id = ?").get(id);
    if (!existing)
        return null;
    if (existing.status !== "draft") {
        throw new Error(`当前状态为 ${existing.status}，只有草稿状态可以提交`);
    }
    dbInstance.prepare("UPDATE project_initiations SET status = 'pending', updated_at = ? WHERE id = ?").run(nowStr(), id);
    return dbInstance.prepare("SELECT * FROM project_initiations WHERE id = ?").get(id);
}
export function deleteProjectInitiation(id) {
    const result = dbInstance.prepare("DELETE FROM project_initiations WHERE id = ?").run(id);
    return result.changes > 0;
}
export function transitionProjectPhase(id, action, reason, triggeredBy) {
    const actionToPhase = {
        submit: "submitted",
        approve: "approved",
        start_planning: "planning",
        lock_plan: "plan_locked",
        start_execution: "executing",
        submit_delivery: "delivering",
        start_review: "reviewing",
        accept: "accepted",
        reject: "rejected",
        archive: "archived",
    };
    const targetPhase = actionToPhase[action];
    if (!targetPhase)
        return { success: false, error: "无效的操作类型" };
    const ok = updateProjectPhase(id, targetPhase, triggeredBy, reason);
    if (!ok)
        return { success: false, error: "项目不存在或状态未变更" };
    return { success: true, newPhase: targetPhase };
}
export { getProjectById, updateProject, addProjectMember, syncProjectStatus };
//# sourceMappingURL=project-service.js.map