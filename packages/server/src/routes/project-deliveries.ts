import { Router } from "express";
import dbInstance from "../services/db.js";

const router = Router();

// GET /api/projects/:id/deliveries - 获取项目关联的版本列表
router.get("/api/projects/:id/deliveries", (req, res) => {
  try {
    const { id } = req.params;
    const rows = dbInstance.prepare(
      `SELECT * FROM versions WHERE project_id = ? ORDER BY created_at DESC`
    ).all(id);
    res.json({ success: true, data: rows });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "获取版本列表失败" });
  }
});

// POST /api/projects/:id/deliveries - 为项目新建版本
router.post("/api/projects/:id/deliveries", (req, res) => {
  try {
    const { id } = req.params;
    const { name, expected_release_date, description, task_ids } = req.body || {};

    if (!name) {
      res.status(400).json({ error: "版本名称不能为空" });
      return;
    }

    // 生成版本 ID
    const vid = `VER-${Date.now()}`;
    const ts = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Shanghai" }).replace(" ", "T");

    dbInstance.prepare(
      `INSERT INTO versions (id, name, status, project_id, expected_release_date, description, task_ids, created_at, updated_at)
       VALUES (?, ?, 'pending_confirm', ?, ?, ?, ?, ?, ?)`
    ).run(
      vid,
      name,
      id,
      expected_release_date || null,
      description || null,
      task_ids ? JSON.stringify(task_ids) : "[]",
      ts,
      ts
    );

    const row = dbInstance.prepare("SELECT * FROM versions WHERE id = ?").get(vid);
    res.json({ success: true, data: row });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "创建版本失败" });
  }
});

// PATCH /api/projects/:id/deliveries/:versionId - 更新版本状态/checklist
router.patch("/api/projects/:id/deliveries/:versionId", (req, res) => {
  try {
    const { versionId } = req.params;
    const { status, checklist, risk_level } = req.body || {};

    const existing = dbInstance.prepare("SELECT * FROM versions WHERE id = ?").get(versionId);
    if (!existing) {
      res.status(404).json({ error: "版本不存在" });
      return;
    }

    const sets: string[] = [];
    const values: any[] = [];

    if (status !== undefined) {
      sets.push("status = ?");
      values.push(status);
    }
    if (risk_level !== undefined) {
      sets.push("risk_level = ?");
      values.push(risk_level);
    }
    // checklist 存储在 description 或单独字段？暂时用 agent_config 字段存储（ employees 表有，versions 没有）
    // 这里用 description 追加 checklist 信息，或暂时不处理 checklist 的独立存储

    if (sets.length === 0) {
      res.status(400).json({ error: "没有可更新的字段" });
      return;
    }

    const ts = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Shanghai" }).replace(" ", "T");
    sets.push("updated_at = ?");
    values.push(ts);
    values.push(versionId);

    dbInstance.prepare(`UPDATE versions SET ${sets.join(", ")} WHERE id = ?`).run(...values);

    const row = dbInstance.prepare("SELECT * FROM versions WHERE id = ?").get(versionId);
    res.json({ success: true, data: row });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "更新版本失败" });
  }
});

export default router;
