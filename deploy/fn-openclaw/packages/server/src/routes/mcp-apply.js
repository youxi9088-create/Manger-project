// MCP API Key 自申请流程
// 外部用户提交申请 → 管理员审批 → 自动发放 Key
import { Router } from "express";
import dbInstance from "../services/db.js";
import { createApiKey } from "../services/mcp-auth.js";
import crypto from "crypto";
const router = Router();
// ============= 建表 =============
dbInstance.exec(`
  CREATE TABLE IF NOT EXISTS mcp_key_applications (
    id TEXT PRIMARY KEY,
    applicant_name TEXT NOT NULL,
    email TEXT NOT NULL,
    purpose TEXT,
    mode TEXT DEFAULT 'readonly' CHECK (mode IN ('full', 'readonly')),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    admin_note TEXT,
    issued_key_id TEXT,
    issued_key_value TEXT,
    reviewed_at TEXT,
    reviewed_by TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_mcp_apps_status ON mcp_key_applications(status);
  CREATE INDEX IF NOT EXISTS idx_mcp_apps_email ON mcp_key_applications(email);
`);
// ============= 工具函数 =============
function genAppId() {
    return 'app-' + Date.now().toString(36) + '-' + crypto.randomBytes(4).toString('hex');
}
function nowShanghai() {
    return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).replace(' ', 'T');
}
// 防刷：同一邮箱 60 秒内只能申请一次
function isRateLimited(email) {
    const recent = dbInstance.prepare(`
    SELECT created_at FROM mcp_key_applications
    WHERE email = ? ORDER BY created_at DESC LIMIT 1
  `).get(email);
    if (!recent)
        return false;
    const diff = Date.now() - new Date(recent.created_at).getTime();
    return diff < 60_000;
}
// 检查邮箱是否已有获批申请
function hasApprovedApp(email) {
    const row = dbInstance.prepare(`
    SELECT COUNT(*) as cnt FROM mcp_key_applications
    WHERE email = ? AND status = 'approved'
  `).get(email);
    return row.cnt > 0;
}
// ============= 路由 =============
/**
 * POST /api/mcp-keys/apply
 * 公开接口：外部用户提交 Key 申请
 */
router.post("/api/mcp-keys/apply", (req, res) => {
    const { applicant_name, email, purpose, mode } = req.body;
    // 参数校验
    if (!applicant_name || !applicant_name.trim()) {
        return res.status(400).json({ error: "请填写姓名" });
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: "请提供有效邮箱" });
    }
    // 防刷
    if (isRateLimited(email)) {
        return res.status(429).json({ error: "请求过于频繁，请 60 秒后重试" });
    }
    // 已有获批 Key 的邮箱不再批准新申请（但仍记录，由管理员决定）
    const alreadyApproved = hasApprovedApp(email);
    const id = genAppId();
    const safeMode = mode === 'full' ? 'full' : 'readonly';
    const safePurpose = (purpose || '').slice(0, 500);
    dbInstance.prepare(`
    INSERT INTO mcp_key_applications (id, applicant_name, email, purpose, mode, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'pending', ?)
  `).run(id, applicant_name.trim().slice(0, 100), email.toLowerCase().trim(), safePurpose, safeMode, nowShanghai());
    res.json({
        success: true,
        application_id: id,
        status: 'pending',
        message: alreadyApproved
            ? '您的邮箱已有获批记录，管理员将重新审核此次申请。'
            : '申请已提交，请等待管理员审批。审批通过后，密钥将发送至您的邮箱。',
    });
});
/**
 * GET /api/mcp-keys/applications
 * 管理端：获取申请列表
 */
router.get("/api/mcp-keys/applications", (_req, res) => {
    const { status } = _req.query;
    let rows;
    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
        rows = dbInstance.prepare(`
      SELECT * FROM mcp_key_applications WHERE status = ? ORDER BY created_at DESC
    `).all(status);
    }
    else {
        rows = dbInstance.prepare(`
      SELECT * FROM mcp_key_applications ORDER BY created_at DESC
    `).all();
    }
    // 脱敏已发放的 Key（只返回前缀+后缀）
    rows = rows.map(r => ({
        ...r,
        issued_key_value: r.issued_key_value
            ? r.issued_key_value.slice(0, 16) + '****' + r.issued_key_value.slice(-4)
            : null,
    }));
    res.json({ applications: rows });
});
/**
 * GET /api/mcp-keys/applications/:id
 * 管理端：获取单个申请详情
 */
router.get("/api/mcp-keys/applications/:id", (req, res) => {
    const row = dbInstance.prepare(`
    SELECT * FROM mcp_key_applications WHERE id = ?
  `).get(req.params.id);
    if (!row)
        return res.status(404).json({ error: "申请不存在" });
    // 脱敏
    if (row.issued_key_value) {
        row.issued_key_value = row.issued_key_value.slice(0, 16) + '****' + row.issued_key_value.slice(-4);
    }
    res.json({ application: row });
});
/**
 * GET /api/mcp-keys/apply/status?email=xxx
 * 公开接口：用户通过邮箱查询自己的申请状态
 */
router.get("/api/mcp-keys/apply/status", (req, res) => {
    const { email } = req.query;
    if (!email)
        return res.status(400).json({ error: "请提供邮箱" });
    const rows = dbInstance.prepare(`
    SELECT id, applicant_name, email, mode, status, admin_note, issued_key_id, created_at, reviewed_at
    FROM mcp_key_applications
    WHERE email = ? ORDER BY created_at DESC
  `).all(email);
    res.json({ applications: rows });
});
/**
 * POST /api/mcp-keys/applications/:id/approve
 * 管理端：批准申请 → 自动创建 Key
 */
router.post("/api/mcp-keys/applications/:id/approve", (req, res) => {
    const { admin_note, reviewed_by } = req.body;
    const app = dbInstance.prepare(`
    SELECT * FROM mcp_key_applications WHERE id = ? AND status = 'pending'
  `).get(req.params.id);
    if (!app)
        return res.status(404).json({ error: "申请不存在或已处理" });
    // 创建 Key
    const keyName = `${app.applicant_name} (${app.mode === 'full' ? '全量' : '只读'})`;
    const newKey = createApiKey(keyName, app.mode);
    // 更新申请记录
    dbInstance.prepare(`
    UPDATE mcp_key_applications
    SET status = 'approved', admin_note = ?, issued_key_id = ?, issued_key_value = ?,
        reviewed_at = ?, reviewed_by = ?
    WHERE id = ?
  `).run(admin_note || null, newKey.id, newKey.key_value, nowShanghai(), reviewed_by || 'admin', app.id);
    res.json({
        success: true,
        message: '申请已批准，Key 已自动创建',
        key: {
            id: newKey.id,
            key_value: newKey.key_value,
            name: newKey.name,
            mode: newKey.mode,
        },
    });
});
/**
 * POST /api/mcp-keys/applications/:id/reject
 * 管理端：拒绝申请
 */
router.post("/api/mcp-keys/applications/:id/reject", (req, res) => {
    const { admin_note, reviewed_by } = req.body;
    const app = dbInstance.prepare(`
    SELECT * FROM mcp_key_applications WHERE id = ? AND status = 'pending'
  `).get(req.params.id);
    if (!app)
        return res.status(404).json({ error: "申请不存在或已处理" });
    dbInstance.prepare(`
    UPDATE mcp_key_applications
    SET status = 'rejected', admin_note = ?, reviewed_at = ?, reviewed_by = ?
    WHERE id = ?
  `).run(admin_note || null, nowShanghai(), reviewed_by || 'admin', app.id);
    res.json({ success: true, message: '申请已拒绝' });
});
/**
 * GET /api/mcp-keys/applications/stats/summary
 * 管理端：申请统计
 */
router.get("/api/mcp-keys/applications/stats/summary", (_req, res) => {
    const pending = dbInstance.prepare(`SELECT COUNT(*) as c FROM mcp_key_applications WHERE status='pending'`).get();
    const approved = dbInstance.prepare(`SELECT COUNT(*) as c FROM mcp_key_applications WHERE status='approved'`).get();
    const rejected = dbInstance.prepare(`SELECT COUNT(*) as c FROM mcp_key_applications WHERE status='rejected'`).get();
    const total = dbInstance.prepare(`SELECT COUNT(*) as c FROM mcp_key_applications`).get();
    res.json({
        pending: pending.c,
        approved: approved.c,
        rejected: rejected.c,
        total: total.c,
    });
});
export default router;
//# sourceMappingURL=mcp-apply.js.map