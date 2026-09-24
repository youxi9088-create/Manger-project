import { Router } from "express";
import dbInstance from "../services/db.js";
import { enrichRequirement } from "../services/requirement-service.js";
const router = Router();
// GET /api/projects/:id/requirements - 获取项目关联的需求列表
router.get("/api/projects/:id/requirements", (req, res) => {
    try {
        const { id } = req.params;
        const rows = dbInstance.prepare(`SELECT * FROM requirement_analyses 
       WHERE initiation_id = ? OR project_id = ? 
       ORDER BY created_at DESC`).all(id, id);
        res.json({ success: true, data: rows.map(enrichRequirement) });
    }
    catch (error) {
        res.status(500).json({ error: error?.message || "获取需求列表失败" });
    }
});
// POST /api/projects/:id/requirements - 为项目新建需求
router.post("/api/projects/:id/requirements", (req, res) => {
    try {
        const { id } = req.params;
        const { title, raw_input } = req.body || {};
        if (!title) {
            res.status(400).json({ error: "需求标题不能为空" });
            return;
        }
        // 检查项目是否存在
        const project = dbInstance.prepare("SELECT * FROM project_initiations WHERE id = ?").get(id);
        if (!project) {
            res.status(404).json({ error: "项目不存在" });
            return;
        }
        // 生成 RA-ID
        const d = new Date();
        const dateStr = d.toISOString().slice(0, 10).replace(/-/g, "");
        const pfx = `RA-${dateStr}-`;
        const lastRow = dbInstance.prepare(`SELECT id FROM requirement_analyses WHERE id LIKE ? ORDER BY id DESC LIMIT 1`).get(`${pfx}%`);
        let seq = 1;
        if (lastRow) {
            seq = parseInt(lastRow.id.split("-").pop() || "0", 10) + 1;
        }
        const reqId = `${pfx}${String(seq).padStart(3, "0")}`;
        const ts = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Shanghai" }).replace(" ", "T");
        // 同时写入 initiation_id（如项目ID符合PI格式）和 project_id
        dbInstance.prepare(`INSERT INTO requirement_analyses (id, initiation_id, project_id, title, input_type, raw_input, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'text', ?, 'draft', ?, ?)`).run(reqId, id, id, title, raw_input || null, ts, ts);
        const row = dbInstance.prepare("SELECT * FROM requirement_analyses WHERE id = ?").get(reqId);
        res.json({ success: true, data: enrichRequirement(row) });
    }
    catch (error) {
        res.status(500).json({ error: error?.message || "创建需求失败" });
    }
});
export default router;
//# sourceMappingURL=project-requirements.js.map