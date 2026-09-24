import { Router } from "express";
import dbInstance from "../services/db.js";
const router = Router();
// ============= 工具函数 =============
function generateWorkCycleId() {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
    const prefix = `WC-${dateStr}-`;
    const row = dbInstance
        .prepare(`SELECT id FROM work_cycles WHERE id LIKE ? ORDER BY id DESC LIMIT 1`)
        .get(`${prefix}%`);
    if (row) {
        const lastNum = parseInt(row.id.split("-").pop() || "0", 10);
        return `${prefix}${String(lastNum + 1).padStart(3, "0")}`;
    }
    return `${prefix}001`;
}
function completeActiveCycle(employeeId) {
    const activeCycle = dbInstance.prepare(`SELECT id FROM work_cycles WHERE employee_id = ? AND status = 'active' ORDER BY start_time DESC LIMIT 1`).get(employeeId);
    if (activeCycle) {
        dbInstance.prepare(`UPDATE work_cycles SET status = 'completed', end_time = datetime('now','localtime'), progress = 100, updated_at = datetime('now','localtime') WHERE id = ?`).run(activeCycle.id);
    }
}
// ============= GET /api/work-cycles =============
router.get("/api/work-cycles", (req, res) => {
    try {
        const { employee_id, status, active_only } = req.query;
        const conditions = [];
        const params = [];
        if (employee_id && typeof employee_id === "string") {
            conditions.push("wc.employee_id = ?");
            params.push(employee_id);
        }
        if (status && typeof status === "string") {
            conditions.push("wc.status = ?");
            params.push(status);
        }
        if (active_only === "true") {
            conditions.push("wc.status = 'active'");
        }
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
        const countStmt = dbInstance.prepare(`SELECT COUNT(*) as total FROM work_cycles wc ${whereClause}`);
        const { total } = countStmt.get(...params);
        const stmt = dbInstance.prepare(`SELECT wc.*, COALESCE(dt.estimated_hours, wc.estimated_hours) as estimated_hours
       FROM work_cycles wc
       LEFT JOIN dev_tasks dt ON wc.task_id = dt.id
       ${whereClause}
       ORDER BY wc.start_time DESC`);
        const data = stmt.all(...params);
        res.json({ success: true, data, total });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "查询失败";
        res.status(500).json({ error: message });
    }
});
// ============= POST /api/work-cycles =============
router.post("/api/work-cycles", (req, res) => {
    try {
        const { employee_id, task_id, task_title, estimated_hours } = req.body;
        if (!employee_id)
            return res.status(400).json({ error: "employee_id 不能为空" });
        // 验证员工存在
        const employee = dbInstance.prepare("SELECT id, status FROM employees WHERE id = ?").get(employee_id);
        if (!employee)
            return res.status(404).json({ error: "员工不存在" });
        const id = generateWorkCycleId();
        const now = new Date().toISOString();
        dbInstance.prepare(`INSERT INTO work_cycles (id, employee_id, task_id, task_title, start_time, estimated_hours, status, progress, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'active', 0, ?, ?)`).run(id, employee_id, task_id || null, task_title || null, now, estimated_hours || null, now, now);
        // 更新员工状态为 busy
        dbInstance.prepare("UPDATE employees SET status = 'busy', updated_at = datetime('now','localtime') WHERE id = ?")
            .run(employee_id);
        const created = dbInstance.prepare("SELECT * FROM work_cycles WHERE id = ?").get(id);
        res.status(201).json({ success: true, data: created });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "创建失败";
        res.status(500).json({ error: message });
    }
});
// ============= PATCH /api/work-cycles/:id =============
router.patch("/api/work-cycles/:id", (req, res) => {
    try {
        const existing = dbInstance.prepare("SELECT * FROM work_cycles WHERE id = ?").get(req.params.id);
        if (!existing)
            return res.status(404).json({ error: "工作周期不存在" });
        const allowedFields = ["progress", "estimated_hours", "task_title", "start_time", "end_time", "status"];
        const sets = [];
        const params = [];
        for (const f of allowedFields) {
            if (req.body[f] !== undefined) {
                sets.push(`${f} = ?`);
                params.push(req.body[f]);
            }
        }
        if (sets.length === 0)
            return res.status(400).json({ error: "没有可更新的字段" });
        sets.push("updated_at = datetime('now','localtime')");
        params.push(req.params.id);
        dbInstance.prepare(`UPDATE work_cycles SET ${sets.join(", ")} WHERE id = ?`).run(...params);
        // 如果状态改为 completed，自动设置 end_time 并将员工改回 available
        if (req.body.status === "completed") {
            const record = existing;
            if (!record.end_time) {
                dbInstance.prepare(`UPDATE work_cycles SET end_time = datetime('now','localtime') WHERE id = ?`).run(req.params.id);
            }
            dbInstance.prepare(`UPDATE employees SET status = 'available', updated_at = datetime('now','localtime') WHERE id = ?`).run(record.employee_id);
        }
        const updated = dbInstance.prepare("SELECT * FROM work_cycles WHERE id = ?").get(req.params.id);
        res.json({ success: true, data: updated });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "更新失败";
        res.status(500).json({ error: message });
    }
});
// ============= POST /api/work-cycles/:id/complete =============
router.post("/api/work-cycles/:id/complete", (req, res) => {
    try {
        const cycle = dbInstance.prepare("SELECT * FROM work_cycles WHERE id = ?").get(req.params.id);
        if (!cycle)
            return res.status(404).json({ error: "工作周期不存在" });
        if (cycle.status !== "active")
            return res.status(400).json({ error: "只能结束进行中的工作周期" });
        dbInstance.prepare(`UPDATE work_cycles SET status = 'completed', end_time = datetime('now','localtime'), progress = 100, updated_at = datetime('now','localtime') WHERE id = ?`).run(req.params.id);
        // 员工状态回退为 available
        dbInstance.prepare("UPDATE employees SET status = 'available', updated_at = datetime('now','localtime') WHERE id = ?").run(cycle.employee_id);
        const completed = dbInstance.prepare("SELECT * FROM work_cycles WHERE id = ?").get(req.params.id);
        res.json({ success: true, data: completed });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "操作失败";
        res.status(500).json({ error: message });
    }
});
// ============= GET /api/work-cycles/active =============
router.get("/api/work-cycles/active", (_req, res) => {
    try {
        const rows = dbInstance.prepare(`
      SELECT wc.*, e.name as employee_name, e.avatar_url as employee_avatar_url, e.rank as employee_rank,
             COALESCE(dt.estimated_hours, wc.estimated_hours) as estimated_hours
      FROM work_cycles wc
      JOIN employees e ON wc.employee_id = e.id
      LEFT JOIN dev_tasks dt ON wc.task_id = dt.id
      WHERE wc.status = 'active'
      ORDER BY wc.start_time DESC
    `).all();
        res.json({ success: true, data: rows });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "查询失败";
        res.status(500).json({ error: message });
    }
});
// ============= POST /api/employees/:id/start-work =============
router.post("/api/employees/:id/start-work", (req, res) => {
    try {
        const { id: employeeId } = req.params;
        const { task_id, task_title, estimated_hours } = req.body;
        const employee = dbInstance.prepare("SELECT id, status FROM employees WHERE id = ?").get(employeeId);
        if (!employee)
            return res.status(404).json({ error: "员工不存在" });
        // 检查该员工是否已有 active 的工作周期
        const activeCycle = dbInstance.prepare(`SELECT id FROM work_cycles WHERE employee_id = ? AND status = 'active' ORDER BY start_time DESC LIMIT 1`).get(employeeId);
        const cycleId = generateWorkCycleId();
        const now = new Date().toISOString();
        if (activeCycle) {
            // 已有 active 任务 → 新任务进入排队（queued）
            dbInstance.prepare(`INSERT INTO work_cycles (id, employee_id, task_id, task_title, start_time, estimated_hours, status, progress, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'queued', 0, ?, ?)`).run(cycleId, employeeId, task_id || null, task_title || null, now, estimated_hours || null, now, now);
            const created = dbInstance.prepare("SELECT * FROM work_cycles WHERE id = ?").get(cycleId);
            return res.status(201).json({ success: true, data: created, queued: true, message: "员工当前忙碌，任务已加入排队" });
        }
        // 没有活跃任务 → 直接开始（active）
        dbInstance.prepare(`INSERT INTO work_cycles (id, employee_id, task_id, task_title, start_time, estimated_hours, status, progress, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'active', 0, ?, ?)`).run(cycleId, employeeId, task_id || null, task_title || null, now, estimated_hours || null, now, now);
        // 员工设为 busy
        dbInstance.prepare("UPDATE employees SET status = 'busy', updated_at = datetime('now','localtime') WHERE id = ?")
            .run(employeeId);
        const created = dbInstance.prepare("SELECT * FROM work_cycles WHERE id = ?").get(cycleId);
        res.status(201).json({ success: true, data: created, queued: false });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "开始工作失败";
        res.status(500).json({ error: message });
    }
});
// ============= POST /api/employees/:id/complete-work =============
router.post("/api/employees/:id/complete-work", (req, res) => {
    try {
        const { id: employeeId } = req.params;
        const employee = dbInstance.prepare("SELECT id FROM employees WHERE id = ?").get(employeeId);
        if (!employee)
            return res.status(404).json({ error: "员工不存在" });
        // 完成最新的 active work_cycle
        const activeCycle = dbInstance.prepare(`SELECT id FROM work_cycles WHERE employee_id = ? AND status = 'active' ORDER BY start_time DESC LIMIT 1`).get(employeeId);
        if (activeCycle) {
            dbInstance.prepare(`UPDATE work_cycles SET status = 'completed', end_time = datetime('now','localtime'), progress = 100, updated_at = datetime('now','localtime') WHERE id = ?`).run(activeCycle.id);
        }
        // 检查是否有排队的任务（queued），按创建时间取最早的一个
        const nextQueued = dbInstance.prepare(`SELECT id, task_id, task_title, estimated_hours FROM work_cycles WHERE employee_id = ? AND status = 'queued' ORDER BY created_at ASC LIMIT 1`).get(employeeId);
        let autoStarted = null;
        if (nextQueued) {
            // 自动启动排队中的下一个任务
            const now = new Date().toISOString();
            dbInstance.prepare(`UPDATE work_cycles SET status = 'active', start_time = ?, updated_at = ? WHERE id = ?`).run(now, now, nextQueued.id);
            // 员工保持 busy
            dbInstance.prepare("UPDATE employees SET status = 'busy', updated_at = datetime('now','localtime') WHERE id = ?").run(employeeId);
            autoStarted = dbInstance.prepare("SELECT * FROM work_cycles WHERE id = ?").get(nextQueued.id);
        }
        else {
            // 没有排队任务 → 员工回到可用状态
            dbInstance.prepare("UPDATE employees SET status = 'available', updated_at = datetime('now','localtime') WHERE id = ?").run(employeeId);
        }
        res.json({
            success: true,
            data: activeCycle
                ? dbInstance.prepare("SELECT * FROM work_cycles WHERE id = ?").get(activeCycle.id)
                : null,
            autoStarted,
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "结束工作失败";
        res.status(500).json({ error: message });
    }
});
// ============= DELETE /api/work-cycles/:id =============
router.delete("/api/work-cycles/:id", (req, res) => {
    try {
        const existing = dbInstance.prepare("SELECT * FROM work_cycles WHERE id = ?").get(req.params.id);
        if (!existing)
            return res.status(404).json({ error: "工作周期不存在" });
        const record = existing;
        // 如果是 active 状态，删除时需要将员工状态回退为 available
        if (record.status === "active") {
            dbInstance.prepare("UPDATE employees SET status = 'available', updated_at = datetime('now','localtime') WHERE id = ?").run(record.employee_id);
        }
        dbInstance.prepare("DELETE FROM work_cycles WHERE id = ?").run(req.params.id);
        res.json({ success: true });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "删除失败";
        res.status(500).json({ error: message });
    }
});
export default router;
//# sourceMappingURL=work-cycles.js.map