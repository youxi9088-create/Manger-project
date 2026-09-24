import { Router } from "express";
import dbInstance from "../services/db.js";
import { syncProjectStatus } from "../services/db.js";

const router = Router();

// GET /api/projects/:id/tasks - 获取项目下的所有开发任务
router.get("/api/projects/:id/tasks", (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.query;

    let sql = `
      SELECT dt.*, ra.project_id as req_project_id, ra.title as req_title
      FROM dev_tasks dt
      JOIN requirement_analyses ra ON dt.requirement_id = ra.id
      WHERE (ra.initiation_id = ? OR ra.project_id = ?)
    `;
    const params: any[] = [id, id];

    if (status && typeof status === "string") {
      sql += " AND dt.status = ?";
      params.push(status);
    }

    sql += " ORDER BY dt.sort_order ASC, dt.created_at ASC";

    const rows = dbInstance.prepare(sql).all(...params);
    res.json({ success: true, data: rows });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "获取任务列表失败" });
  }
});

// PATCH /api/projects/:id/tasks/:taskId - 更新任务状态/分配人
router.patch("/api/projects/:id/tasks/:taskId", (req, res) => {
  try {
    const { id, taskId } = req.params;
    const { status, assignee } = req.body || {};

    const existing = dbInstance.prepare("SELECT * FROM dev_tasks WHERE id = ?").get(taskId);
    if (!existing) {
      res.status(404).json({ error: "任务不存在" });
      return;
    }

    const sets: string[] = [];
    const values: any[] = [];

    if (status !== undefined) {
      sets.push("status = ?");
      values.push(status);
    }
    if (assignee !== undefined) {
      sets.push("assignee = ?");
      values.push(assignee);
    }

    if (sets.length === 0) {
      res.status(400).json({ error: "没有可更新的字段" });
      return;
    }

    const ts = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Shanghai" }).replace(" ", "T");
    sets.push("updated_at = ?");
    values.push(ts);
    values.push(taskId);

    dbInstance.prepare(`UPDATE dev_tasks SET ${sets.join(", ")} WHERE id = ?`).run(...values);

    // 异步触发项目状态同步
    setTimeout(() => {
      try {
        syncProjectStatus(id);
      } catch (e) {
        console.error("[project-tasks] 同步项目状态失败:", e);
      }
    }, 0);

    const row = dbInstance.prepare("SELECT * FROM dev_tasks WHERE id = ?").get(taskId);
    res.json({ success: true, data: row });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "更新任务失败" });
  }
});

export default router;
