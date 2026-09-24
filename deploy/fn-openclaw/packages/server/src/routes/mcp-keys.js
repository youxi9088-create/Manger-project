// MCP API Key 认证路由
// 提供 Key 的创建/查看/吊销/删除管理接口
import { Router } from "express";
import { createApiKey, getAllApiKeys, revokeApiKey, deleteApiKey } from "../services/mcp-auth.js";
const router = Router();
// 创建新 Key
router.post("/api/mcp-keys", (req, res) => {
    const { name, mode } = req.body;
    if (!name) {
        return res.status(400).json({ error: "请提供 key 名称" });
    }
    const key = createApiKey(name, mode === 'readonly' ? 'readonly' : 'full');
    res.json({ success: true, key });
});
// 获取所有 Key（不返回完整 key_value，只返回前缀+后缀）
router.get("/api/mcp-keys", (_req, res) => {
    const keys = getAllApiKeys();
    res.json({
        keys: keys.map(k => ({
            ...k,
            key_value: k.key_value.slice(0, 16) + '****' + k.key_value.slice(-4),
        }))
    });
});
// 吊销 Key
router.patch("/api/mcp-keys/:id/revoke", (req, res) => {
    const ok = revokeApiKey(req.params.id);
    if (!ok)
        return res.status(404).json({ error: "Key 不存在" });
    res.json({ success: true });
});
// 删除 Key
router.delete("/api/mcp-keys/:id", (req, res) => {
    const ok = deleteApiKey(req.params.id);
    if (!ok)
        return res.status(404).json({ error: "Key 不存在" });
    res.json({ success: true });
});
export default router;
//# sourceMappingURL=mcp-keys.js.map