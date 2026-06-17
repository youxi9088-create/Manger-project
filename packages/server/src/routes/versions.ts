import { Router } from "express";
import dbInstance from "../services/db.js";
import { computeVersionRisk } from "../services/version-alert-service.js";

const router = Router();

function generateVersionId(): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `V-${dateStr}-`;
  const row = dbInstance
    .prepare(`SELECT id FROM versions WHERE id LIKE ? ORDER BY id DESC LIMIT 1`)
    .get(`${prefix}%`) as { id: string } | undefined;
  if (row) {
    const lastNum = parseInt(row.id.split("-").pop() || "0", 10);
    return `${prefix}${String(lastNum + 1).padStart(2, "0")}`;
  }
  return `${prefix}01`;
}

function generateRequirementId(): string {
  const d = new Date();
  const dateStr = d.toISOString().slice(0, 10).replace(/-/g, '');
  const pfx = `RA-${dateStr}-`;
  const row = dbInstance.prepare(
    `SELECT id FROM requirement_analyses WHERE id LIKE ? ORDER BY id DESC LIMIT 1`
  ).get(`${pfx}%`) as { id: string } | undefined;
  let seq = 1;
  if (row) { seq = parseInt(row.id.split('-').pop() || '0', 10) + 1; }
  return `${pfx}${String(seq).padStart(3, '0')}`;
}

function goalUid(): string {
  return `g-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function nowStr(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).replace(' ', 'T');
}

// ============= 版本 CRUD =============

// GET /api/versions - 版本列表（自动刷新预警）
router.get("/api/versions", (_req, res) => {
  try {
    const rows = dbInstance.prepare(`SELECT * FROM versions ORDER BY created_at DESC`).all() as Array<{ id: string }>;
    // 为每个版本计算最新预警（不阻塞：静默失败）
    for (const v of rows) {
      try { computeVersionRisk(v.id); } catch { /* ignore */ }
    }
    // 重新查一次拿到更新后的预警数据
    const refreshed = dbInstance.prepare(`SELECT * FROM versions ORDER BY created_at DESC`).all();
    res.json({ success: true, data: refreshed });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "查询失败";
    res.status(500).json({ error: message });
  }
});

// GET /api/versions/:id - 版本详情（含预警、目标、关联需求）
router.get("/api/versions/:id", (req, res) => {
  try {
    try { computeVersionRisk(req.params.id); } catch { /* ignore */ }
    const ver = dbInstance.prepare("SELECT * FROM versions WHERE id = ?").get(req.params.id);
    if (!ver) return res.status(404).json({ error: "版本不存在" });
    // 关联的需求
    const requirements = dbInstance.prepare(
      "SELECT * FROM requirement_analyses WHERE version_id = ? ORDER BY created_at DESC"
    ).all(req.params.id);
    res.json({ success: true, data: { version: ver, requirements } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "查询失败";
    res.status(500).json({ error: message });
  }
});

// POST /api/versions - 创建版本（支持 goals 初始化）
router.post("/api/versions", (req, res) => {
  try {
    const { name, risk_level, expected_release_date, description, participants, task_ids, goals, project_id } = req.body;
    if (!name) return res.status(400).json({ error: "名称不能为空" });

    const id = generateVersionId();

    // goals 支持两种输入：字符串数组（简单目标）或对象数组
    let goalsJson = '[]';
    if (Array.isArray(goals)) {
      const normalized = goals.map((g) => {
        if (typeof g === 'string') {
          return { id: goalUid(), title: g, description: '', requirement_id: null, created_at: nowStr() };
        }
        return {
          id: g.id || goalUid(),
          title: g.title || '',
          description: g.description || '',
          requirement_id: g.requirement_id || null,
          created_at: g.created_at || nowStr(),
        };
      }).filter((g) => g.title.trim());
      goalsJson = JSON.stringify(normalized);
    } else if (typeof goals === 'string') {
      goalsJson = goals;
    }

    dbInstance.prepare(`
      INSERT INTO versions (id, name, status, risk_level, participants, expected_release_date, description, task_ids, goals, project_id)
      VALUES (?, ?, 'pending_confirm', ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, name,
      risk_level || "medium",
      participants || "[]",
      expected_release_date || null,
      description || null,
      task_ids || "[]",
      goalsJson,
      project_id || null,
    );

    try { computeVersionRisk(id); } catch { /* ignore */ }
    const created = dbInstance.prepare("SELECT * FROM versions WHERE id = ?").get(id);
    res.status(201).json({ success: true, data: created });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "创建失败";
    res.status(500).json({ error: message });
  }
});

// PATCH /api/versions/:id - 更新版本
router.patch("/api/versions/:id", (req, res) => {
  try {
    const existing = dbInstance.prepare("SELECT * FROM versions WHERE id = ?").get(req.params.id);
    if (!existing) return res.status(404).json({ error: "版本不存在" });

    const allowedFields = ["name", "status", "participants", "expected_release_date", "description", "task_ids", "goals", "project_id"];
    const sets: string[] = [];
    const params: unknown[] = [];

    for (const f of allowedFields) {
      if (req.body[f] !== undefined) {
        let val = req.body[f];
        // goals 如果是数组，自动 JSON.stringify
        if (f === 'goals' && Array.isArray(val)) {
          val = JSON.stringify(val);
        }
        sets.push(`${f} = ?`);
        params.push(val);
      }
    }

    if (sets.length === 0) return res.status(400).json({ error: "没有可更新的字段" });

    sets.push("updated_at = datetime('now','localtime')");
    params.push(req.params.id);

    dbInstance.prepare(`UPDATE versions SET ${sets.join(", ")} WHERE id = ?`).run(...params);

    try { computeVersionRisk(req.params.id); } catch { /* ignore */ }
    const updated = dbInstance.prepare("SELECT * FROM versions WHERE id = ?").get(req.params.id);
    res.json({ success: true, data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "更新失败";
    res.status(500).json({ error: message });
  }
});

// DELETE /api/versions/:id - 删除版本
router.delete("/api/versions/:id", (req, res) => {
  try {
    // 先解除关联的需求（version_id 设为 null，不删需求）
    dbInstance.prepare("UPDATE requirement_analyses SET version_id = NULL, from_goal_id = NULL WHERE version_id = ?").run(req.params.id);
    const result = dbInstance.prepare("DELETE FROM versions WHERE id = ?").run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: "版本不存在" });
    res.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "删除失败";
    res.status(500).json({ error: message });
  }
});

// ============= 版本目标（goals）管理 =============

// POST /api/versions/:id/goals - 添加目标
router.post("/api/versions/:id/goals", (req, res) => {
  try {
    const { title, description } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: "目标标题不能为空" });

    const ver = dbInstance.prepare("SELECT goals FROM versions WHERE id = ?").get(req.params.id) as { goals: string } | undefined;
    if (!ver) return res.status(404).json({ error: "版本不存在" });

    const goals = JSON.parse(ver.goals || '[]');
    const newGoal = {
      id: goalUid(),
      title: title.trim(),
      description: description || '',
      requirement_id: null,
      created_at: nowStr(),
    };
    goals.push(newGoal);
    dbInstance.prepare("UPDATE versions SET goals = ?, updated_at = datetime('now','localtime') WHERE id = ?")
      .run(JSON.stringify(goals), req.params.id);

    try { computeVersionRisk(req.params.id); } catch { /* ignore */ }
    res.status(201).json({ success: true, data: newGoal, goals });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "添加目标失败";
    res.status(500).json({ error: message });
  }
});

// PATCH /api/versions/:id/goals/:goalId - 更新目标
router.patch("/api/versions/:id/goals/:goalId", (req, res) => {
  try {
    const ver = dbInstance.prepare("SELECT goals FROM versions WHERE id = ?").get(req.params.id) as { goals: string } | undefined;
    if (!ver) return res.status(404).json({ error: "版本不存在" });

    const goals = JSON.parse(ver.goals || '[]');
    const idx = goals.findIndex((g: { id: string }) => g.id === req.params.goalId);
    if (idx < 0) return res.status(404).json({ error: "目标不存在" });

    const { title, description } = req.body;
    if (title !== undefined) goals[idx].title = title;
    if (description !== undefined) goals[idx].description = description;

    dbInstance.prepare("UPDATE versions SET goals = ?, updated_at = datetime('now','localtime') WHERE id = ?")
      .run(JSON.stringify(goals), req.params.id);

    res.json({ success: true, data: goals[idx] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "更新目标失败";
    res.status(500).json({ error: message });
  }
});

// DELETE /api/versions/:id/goals/:goalId - 删除目标
router.delete("/api/versions/:id/goals/:goalId", (req, res) => {
  try {
    const ver = dbInstance.prepare("SELECT goals FROM versions WHERE id = ?").get(req.params.id) as { goals: string } | undefined;
    if (!ver) return res.status(404).json({ error: "版本不存在" });

    const goals = JSON.parse(ver.goals || '[]');
    const goal = goals.find((g: { id: string }) => g.id === req.params.goalId);
    if (!goal) return res.status(404).json({ error: "目标不存在" });

    // 如果目标已经关联需求，解除需求的 from_goal_id，不删需求
    if (goal.requirement_id) {
      dbInstance.prepare("UPDATE requirement_analyses SET from_goal_id = NULL WHERE id = ?").run(goal.requirement_id);
    }

    const newGoals = goals.filter((g: { id: string }) => g.id !== req.params.goalId);
    dbInstance.prepare("UPDATE versions SET goals = ?, updated_at = datetime('now','localtime') WHERE id = ?")
      .run(JSON.stringify(newGoals), req.params.id);

    try { computeVersionRisk(req.params.id); } catch { /* ignore */ }
    res.json({ success: true, goals: newGoals });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "删除目标失败";
    res.status(500).json({ error: message });
  }
});

// POST /api/versions/:id/goals/:goalId/convert - ⭐ 目标转需求
router.post("/api/versions/:id/goals/:goalId/convert", (req, res) => {
  try {
    const ver = dbInstance.prepare("SELECT * FROM versions WHERE id = ?").get(req.params.id) as { id: string; goals: string; project_id: string | null } | undefined;
    if (!ver) return res.status(404).json({ error: "版本不存在" });

    const goals = JSON.parse(ver.goals || '[]');
    const goalIdx = goals.findIndex((g: { id: string }) => g.id === req.params.goalId);
    if (goalIdx < 0) return res.status(404).json({ error: "目标不存在" });

    const goal = goals[goalIdx];
    if (goal.requirement_id) {
      // 已转化过，检查需求还存在吗
      const exists = dbInstance.prepare("SELECT id FROM requirement_analyses WHERE id = ?").get(goal.requirement_id);
      if (exists) {
        return res.status(409).json({ error: "该目标已转化为需求", requirement_id: goal.requirement_id });
      }
      // 需求被删了，清掉 goal 上的无效 requirement_id，继续创建新的
      goal.requirement_id = null;
    }

    // 创建需求
    const reqId = generateRequirementId();
    const ts = nowStr();
    const rawInput = goal.description
      ? `${goal.title}\n\n${goal.description}`
      : goal.title;

    dbInstance.prepare(`
      INSERT INTO requirement_analyses (id, title, input_type, raw_input, version_id, from_goal_id, project_id, status, created_at, updated_at)
      VALUES (?, ?, 'text', ?, ?, ?, ?, 'draft', ?, ?)
    `).run(reqId, goal.title, rawInput, req.params.id, goal.id, ver.project_id || null, ts, ts);

    // 回填 goal.requirement_id
    goals[goalIdx].requirement_id = reqId;
    dbInstance.prepare("UPDATE versions SET goals = ?, updated_at = datetime('now','localtime') WHERE id = ?")
      .run(JSON.stringify(goals), req.params.id);

    try { computeVersionRisk(req.params.id); } catch { /* ignore */ }

    const requirement = dbInstance.prepare("SELECT * FROM requirement_analyses WHERE id = ?").get(reqId);
    res.status(201).json({ success: true, requirement, goal: goals[goalIdx] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "转换失败";
    res.status(500).json({ error: message });
  }
});

// GET /api/versions/:id/requirements - 查询版本下的需求
router.get("/api/versions/:id/requirements", (req, res) => {
  try {
    const rows = dbInstance.prepare(
      "SELECT * FROM requirement_analyses WHERE version_id = ? ORDER BY created_at DESC"
    ).all(req.params.id);
    res.json({ success: true, data: rows });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "查询失败";
    res.status(500).json({ error: message });
  }
});

// POST /api/versions/:id/recompute-risk - 手动触发重算预警
router.post("/api/versions/:id/recompute-risk", (req, res) => {
  try {
    const result = computeVersionRisk(req.params.id);
    if (!result) return res.status(404).json({ error: "版本不存在" });
    // 从数据库重新查完整记录，确保 risk_reasons 是 JSON 字符串格式（含 strategies/stats）
    const updated = dbInstance.prepare("SELECT * FROM versions WHERE id = ?").get(req.params.id);
    res.json({ success: true, data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "重算失败";
    res.status(500).json({ error: message });
  }
});

export default router;
