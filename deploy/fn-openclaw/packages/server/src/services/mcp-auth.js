// MCP API Key 认证服务
// 简单方案：SQLite 存 Key，SSE 连接时校验 Authorization header
import dbInstance from "./db.js";
import crypto from "crypto";
// ============= 建表 =============
dbInstance.exec(`
  CREATE TABLE IF NOT EXISTS mcp_api_keys (
    id TEXT PRIMARY KEY,
    key_value TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
    mode TEXT DEFAULT 'full' CHECK (mode IN ('full', 'readonly')),
    last_used_at TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_mcp_keys_value ON mcp_api_keys(key_value);
`);
// ============= 工具函数 =============
function generateKey() {
    return 'sk-openclaw-' + crypto.randomBytes(24).toString('hex');
}
function generateId() {
    return 'key-' + Date.now().toString(36) + '-' + crypto.randomBytes(4).toString('hex');
}
// ============= 操作 =============
/** 创建新 Key */
export function createApiKey(name, mode = 'full') {
    const id = generateId();
    const keyValue = generateKey();
    const now = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).replace(' ', 'T');
    dbInstance.prepare(`
    INSERT INTO mcp_api_keys (id, key_value, name, status, mode, created_at)
    VALUES (?, ?, ?, 'active', ?, ?)
  `).run(id, keyValue, name, mode, now);
    return {
        id,
        key_value: keyValue,
        name,
        status: 'active',
        mode,
        last_used_at: null,
        created_at: now,
    };
}
/** 获取所有 Key */
export function getAllApiKeys() {
    return dbInstance.prepare('SELECT * FROM mcp_api_keys ORDER BY created_at DESC').all();
}
/** 验证 Key，返回 Key 信息或 null */
export function verifyApiKey(keyValue) {
    if (!keyValue)
        return null;
    const key = dbInstance.prepare(`
    SELECT * FROM mcp_api_keys WHERE key_value = ? AND status = 'active'
  `).get(keyValue);
    if (!key)
        return null;
    // 更新最后使用时间
    const now = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).replace(' ', 'T');
    dbInstance.prepare('UPDATE mcp_api_keys SET last_used_at = ? WHERE id = ?').run(now, key.id);
    return key;
}
/** 吊销 Key */
export function revokeApiKey(id) {
    const result = dbInstance.prepare(`
    UPDATE mcp_api_keys SET status = 'revoked' WHERE id = ?
  `).run(id);
    return result.changes > 0;
}
/** 删除 Key */
export function deleteApiKey(id) {
    const result = dbInstance.prepare('DELETE FROM mcp_api_keys WHERE id = ?').run(id);
    return result.changes > 0;
}
/** 从 Authorization header 提取 key */
export function extractApiKey(authHeader) {
    if (!authHeader)
        return null;
    // 支持 "Bearer sk-openclaw-xxx" 和直接 "sk-openclaw-xxx"
    if (authHeader.startsWith('Bearer ')) {
        return authHeader.slice(7).trim();
    }
    return authHeader.trim();
}
//# sourceMappingURL=mcp-auth.js.map