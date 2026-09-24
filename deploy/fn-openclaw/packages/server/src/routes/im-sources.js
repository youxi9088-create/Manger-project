import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import * as db from "../services/db.js";
const router = Router();
// ============= IM 数据源管理 =============
router.get("/api/im/sources", (req, res) => {
    try {
        const sources = db.getAllImSources();
        res.json({ sources });
    }
    catch (error) {
        res.status(500).json({ error: error?.message });
    }
});
router.post("/api/im/sources", (req, res) => {
    try {
        const { name, type, config } = req.body;
        if (!name || !type)
            return res.status(400).json({ error: "名称和类型不能为空" });
        const now = new Date().toISOString();
        const source = db.createImSource({
            id: uuidv4(), name, type,
            config: JSON.stringify(config || {}),
            enabled: 1, last_sync_at: null,
            created_at: now, updated_at: now
        });
        res.json({ source });
    }
    catch (error) {
        res.status(500).json({ error: error?.message });
    }
});
router.put("/api/im/sources/:id", (req, res) => {
    try {
        const { id } = req.params;
        const { name, type, config, enabled } = req.body;
        const updates = {};
        if (name !== undefined)
            updates.name = name;
        if (type !== undefined)
            updates.type = type;
        if (config !== undefined)
            updates.config = JSON.stringify(config);
        if (enabled !== undefined)
            updates.enabled = enabled ? 1 : 0;
        const success = db.updateImSource(id, updates);
        if (!success)
            return res.status(404).json({ error: "数据源不存在" });
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: error?.message });
    }
});
router.delete("/api/im/sources/:id", (req, res) => {
    try {
        const { id } = req.params;
        const success = db.deleteImSource(id);
        if (!success)
            return res.status(404).json({ error: "数据源不存在" });
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: error?.message });
    }
});
// ============= 数据源会话管理 =============
router.get("/api/im/sources/:id/conversations", (req, res) => {
    try {
        const { id } = req.params;
        const conversations = db.getConversationsBySource(id);
        res.json({ conversations });
    }
    catch (error) {
        res.status(500).json({ error: error?.message });
    }
});
router.post("/api/im/sources/:id/conversations", (req, res) => {
    try {
        const { id } = req.params;
        const { convId, name } = req.body;
        if (!convId)
            return res.status(400).json({ error: "会话 ID 不能为空" });
        const conversation = db.addConversationToSource(id, convId, name);
        if (!conversation)
            return res.status(400).json({ error: "会话已存在或添加失败" });
        res.json({ conversation });
    }
    catch (error) {
        res.status(500).json({ error: error?.message });
    }
});
router.delete("/api/im/sources/:id/conversations/:convId", (req, res) => {
    try {
        const { id, convId } = req.params;
        const success = db.removeConversationFromSource(id, convId);
        if (!success)
            return res.status(404).json({ error: "会话不存在" });
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: error?.message });
    }
});
export default router;
//# sourceMappingURL=im-sources.js.map