// Agent 主路由：Web 对话入口已切换为 Hermes 编排

import { Router } from "express";
import dbInstance from "../services/db.js";
import { initAgentTools } from "../services/agent-tools.js";
import {
  prepareHermesSession,
  runHermesChat,
} from "../services/hermes-service.js";

initAgentTools();

const router = Router();

// ============= POST /api/agent/chat（Hermes 对话入口）============
router.post("/api/agent/chat", async (req, res) => {
  const { sessionId: _sessionId, message } = req.body as {
    sessionId?: string;
    message?: string;
  };

  if (!message?.trim()) {
    return res.status(400).json({ error: "消息不能为空" });
  }

  const startTime = Date.now();

  try {
    const { sessionId, historyMessages } = await prepareHermesSession({
      sessionId: _sessionId,
      message,
    });

    const result = await runHermesChat({
      sessionId,
      message,
      historyMessages,
    });

    res.json({
      success: true,
      session_id: result.sessionId,
      response: result.response,
      duration_ms: Date.now() - startTime,
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : "处理失败";
    console.error("[Hermes Agent] Error:", errMsg);
    res.status(500).json({ success: false, error: errMsg });
  }
});

// ============= GET 状态接口（保留兼容，数据可能为空）============
router.get("/api/agent/status", (_req, res) => {
  try {
    const tasks = dbInstance.prepare("SELECT COUNT(*) as total, status FROM agent_tasks GROUP BY status").all();
    res.json({ success: true, data: { tasks } });
  } catch (error: unknown) {
    res.status(500).json({ error: error instanceof Error ? error.message : "查询失败" });
  }
});

router.get("/api/agent/tasks", (_req, res) => {
  try {
    res.json({ success: true, data: dbInstance.prepare(
      "SELECT id, session_id, description, status, agent_type, iterations, created_at, completed_at FROM agent_tasks ORDER BY created_at DESC LIMIT 50"
    ).all() });
  } catch (error: unknown) {
    res.status(500).json({ error: error instanceof Error ? error.message : "查询失败" });
  }
});

router.get("/api/agent/runtime-status", (_req, res) => {
  try {
    const mainStats = dbInstance.prepare("SELECT COUNT(*) as total FROM sessions").get() as { total: number } | undefined;
    const mainLast = dbInstance.prepare("SELECT updated_at FROM sessions ORDER BY updated_at DESC LIMIT 1").get() as { updated_at: string } | undefined;
    const execRunning = dbInstance.prepare("SELECT id, description, created_at FROM agent_tasks WHERE status='running' ORDER BY created_at DESC LIMIT 1").get() as { id: string; description: string; created_at: string } | undefined;
    const execTotalRow = dbInstance.prepare("SELECT COUNT(*) as total FROM agent_tasks WHERE agent_type='exec'").get() as { total: number } | undefined;
    const execTotal = execTotalRow?.total || 0;
    const execOkRow = dbInstance.prepare("SELECT COUNT(*) as ok FROM agent_tasks WHERE agent_type='exec' AND status='completed'").get() as { ok: number } | undefined;
    const execOk = execOkRow?.ok || 0;
    const execLastDone = dbInstance.prepare("SELECT completed_at FROM agent_tasks WHERE status='completed' ORDER BY completed_at DESC LIMIT 1").get() as { completed_at: string } | undefined;

    res.json({
      success: true,
      data: {
        main: { status: "idle", total_chats: mainStats?.total || 0, last_active: mainLast?.updated_at || null },
        exec: {
          status: execRunning ? "running" : "idle",
          current_task: execRunning ? { id: execRunning.id, description: execRunning.description, started_at: execRunning.created_at } : null,
          total_tasks: execTotal,
          success_rate: execTotal > 0 ? Math.round((execOk / execTotal) * 1000) / 10 : 0,
          last_completed: execLastDone?.completed_at || null,
        },
      },
    });
  } catch (error: unknown) {
    res.status(500).json({ error: error instanceof Error ? error.message : "查询失败" });
  }
});

router.get("/api/agent/tasks/kanban", (_req, res) => {
  try {
    res.json({
      success: true, data: {
        running: dbInstance.prepare("SELECT id, description, agent_type, created_at, iterations FROM agent_tasks WHERE status='running' ORDER BY created_at DESC").all(),
        completed: dbInstance.prepare("SELECT id, description, agent_type, status, iterations, created_at, completed_at FROM agent_tasks WHERE status IN ('completed','failed') ORDER BY completed_at DESC LIMIT 20").all(),
        pending: dbInstance.prepare("SELECT id, description, agent_type, created_at FROM agent_tasks WHERE status='pending' ORDER BY created_at ASC").all(),
      },
    });
  } catch (error: unknown) {
    res.status(500).json({ error: error instanceof Error ? error.message : "查询失败" });
  }
});

export default router;
