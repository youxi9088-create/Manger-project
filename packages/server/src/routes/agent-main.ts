// F:\个人\app\openclaw\packages\server\src\routes\agent-main.ts
// PM Agent v2 — CodeBuddy 引擎 + 业务工具注入
//
// 架构：
//   用户消息 → CodeBuddy SDK (GLM-5) → SSE 流
//   其中 PM 业务工具通过 System Prompt 定义 + 中间层拦截执行
//   Exec Agent 作为子任务异步派发

import { Router } from "express";
import type { Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { initAgentTools, getTool } from "../services/agent-tools.js";
import * as db from "../services/db.js";
import dbInstance from "../services/db.js";
import { runExecAgent } from "../services/exec-agent.js";
import {
  unstable_v2_authenticate,
  unstable_v2_createSession,
} from "@tencent-ai/agent-sdk";
import { resolveModel, getAuthToken } from "../utils/agent-sdk.js";
import fs from "fs";
import path from "path";
import type { AgentSSEEvent } from "@openclaw/shared/types/agent.js";

// 初始化 PM 工具注册表
initAgentTools();

const router = Router();

// ============= 工具定义（注入 System Prompt） =============

/** 获取所有已注册的 PM 工具定义 */
function getPMToolDefinitions(): string {
  // 手动维护的工具列表，与 agent-tools.ts 保持同步
  const tools = [
    {
      name: "get_system_status",
      description: "获取系统概览：项目数、需求数、任务数、员工数、版本数",
      params: "{}",
    },
    {
      name: "query_projects",
      description: "查询项目立项列表。参数: { status?, type?, limit? }",
      params: '{ status: "active|pending|completed|cancelled", type: "quick_validation|pre_to_formal", limit: "20" }',
    },
    {
      name: "query_requirements",
      description: "查询需求分析列表。参数: { status?, project_id?, limit? }",
      params: '{ status: "draft|analyzed|tasked|in_progress|done", project_id: "PI-xxx", limit: "20" }',
    },
    {
      name: "query_dev_tasks",
      description: "查询开发任务列表。参数: { status?, requirement_id?, assignee_id?, limit? }",
      params: '{ status: "todo|in_progress|testing|done", requirement_id: "RA-xxx", assignee_id: "EMP-xxx", limit: "20" }',
    },
    {
      name: "query_employees",
      description: "查询员工列表。参数: { status?, is_agent?, limit? }",
      params: '{ status: "available|busy|off|leave", is_agent: "true|false", limit: "30" }',
    },
    {
      name: "query_versions",
      description: "查询版本列表。参数: { status?, limit? }",
      params: '{ status: "pending_confirm|confirmed|in_progress|testing|released|delayed", limit: "10" }',
    },
    {
      name: "query_work_cycles",
      description: "查询工作周期(工单)。参数: { employee_id?, status?, limit? }",
      params: '{ employee_id: "EMP-xxx", status: "queued|active|completed|cancelled", limit: "20" }',
    },
    {
      name: "query_chat_records",
      description: "查询IM聊天记录。参数: { keyword?, sender?, start_date?, end_date?, limit? }",
      params: '{ keyword: "搜索词", sender: "发送人名", start_date: "YYYY-MM-DD", end_date: "YYYY-MM-DD", limit: "50" }',
    },
    {
      name: "query_reports",
      description: "查询分析报告。参数: { start_date?, end_date?, limit? }",
      params: '{ start_date: "YYYY-MM-DD", end_date: "YYYY-MM-DD", limit: "10" }',
    },
    // ---- 写入工具 ----
    {
      name: "create_project",
      description: "新建项目立项。参数: { title!, type!('quick_validation'|'pre_to_formal'), description?, priority?('high'|'medium'|'low') }",
      params: '{ title: "项目名称", type: "quick_validation", description: "描述", priority: "medium" }',
    },
    {
      name: "create_requirement",
      description: "新建需求分析。参数: { title!, initiation_id?, raw_input? }",
      params: '{ title: "需求标题", initiation_id: "PI-xxx", raw_input: "原始需求内容" }',
    },
    {
      name: "create_dev_task",
      description: "新建开发任务。参数: { title!, requirement_id!, description?, assignee_id?, priority? }",
      params: '{ title: "任务标题", requirement_id: "RA-xxx", description: "详情", assignee_id: "EMP-xxx", priority: "medium" }',
    },
    {
      name: "update_requirement_status",
      description: "更新需求状态。参数: { id!, status!('draft'|'analyzed'|'tasked'|'in_progress'|'done') }",
      params: '{ id: "RA-xxx", status: "done" }',
    },
    {
      name: "assign_employee",
      description: "分配任务给员工。参数: { task_id!, employee_id! }",
      params: '{ task_id: "DT-xxx", employee_id: "EMP-xxx" }',
    },
    {
      name: "dispatch_exec_agent",
      description: "⚡ 派发复杂多步任务给后台执行 Agent（异步）。适用于需要连续调用多个工具才能完成的批量操作。参数: { description!(任务详细描述), context?(背景信息) }",
      params: '{ description: "详细描述要做什么", context: "可选背景信息" }',
    },
  ];

  return tools
    .map(t => `- ${t.name}(${t.params}): ${t.description}`)
    .join("\n");
}

/** 构建 PM Agent 的 System Prompt */
function buildPmSystemPrompt(): string {
  return `你是一个专业的项目管理 AI 助手（PM Agent），基于 CodeBuddy AI (GLM-5) 引擎。

## 你的核心能力

### A. 通用能力（CodeBuddy 原生）
你可以直接使用以下能力：
- 📁 文件操作：ReadFile / WriteFile / Glob — 读取和写入文件
- 💻 终端执行：Bash — 执行命令行操作
- 🔍 内容搜索：Grep — 在代码中搜索
- 🌐 网络请求：HTTP / WebSearch — 调用 API 和搜索引擎
- 👁 图片理解：可以查看和分析用户上传的图片

### B. 项目管理工具（12 个专用工具）
当用户询问与项目管理相关的问题时，使用以下工具。调用格式：

<pm_tool_call>
{"name": "工具名", "params": {...参数...}}
</pm_tool_call>

可用工具列表：
${getPMToolDefinitions()}

### C. 执行 Agent（异步长任务）
对于需要连续多步骤操作的复杂任务（如：批量处理数据、跨模块编排），使用：

<pm_tool_call>
{"name": "dispatch_exec_agent", "params": {"description": "详细的多步骤任务描述", "context": "可选背景信息"}}
</pm_tool_call>

## 工作原则
1. 先理解用户意图，选择最合适的工具或能力
2. 对于简单查询，直接用 PM 工具返回结果
3. 对于文件相关操作，使用原生能力（ReadFile 等）
4. 对于复杂工作流，派发 Exec Agent 异步处理
5. 回复时用中文，结构清晰，关键数据加粗
6. 如果不确定，先问清楚再行动
`;
}

// ============= SSE 工具 =============
function setupSSE(res: Response): void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
}

function send(res: Response, event: AgentSSEEvent): void {
  try { res.write(`data: ${JSON.stringify(event)}\n\n`); } catch { /* ignore */ }
}

// ============= 工具执行器 =============

/** 执行 PM 工具调用 */
async function executePMTool(name: string, params: Record<string, unknown>): Promise<{ result: unknown; error?: string }> {
  const tool = getTool(name);
  if (!tool) return { result: null, error: `未知工具: ${name}` };

  try {
    const result = await tool.execute(params || {});
    return { result };
  } catch (e: any) {
    return { result: null, error: e?.message || String(e) };
  }
}

/** 解析 AI 输出中的 <pm_tool_call> 标签 */
function parsePMToolCall(text: string): { name: string; params: Record<string, unknown> } | null {
  const match = text.match(/<pm_tool_call>\s*([\s\S]*?)\s*<\/pm_tool_call>/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]);
    if (parsed.name && typeof parsed.name === "string") {
      return { name: parsed.name, params: parsed.params || {} };
    }
  } catch { /* ignore */ }
  return null;
}

/** 附件保存目录 */
const UPLOADS_DIR = path.join(process.cwd(), '..', '..', 'data', 'uploads', 'chat');

// ============= POST /api/agent/chat（核心融合接口）============
router.post("/api/agent/chat", async (req, res) => {
  const { sessionId: _sessionId, message, attachments } = req.body as {
    sessionId?: string;
    message?: string;
    attachments?: Array<{ name: string; type: string; size: number; base64: string }>;
  };

  if (!message?.trim()) return res.status(400).json({ error: "消息不能为空" });

  // 验证附件
  const attList = attachments || [];
  if (attList.length > 0) {
    for (let i = 0; i < attList.length; i++) {
      const a = attList[i];
      if (!a.name || !a.type || !a.base64) return res.status(400).json({ error: `附件[${i}] 格式不完整` });
      if (a.base64.length > 28 * 1024 * 1024) return res.status(400).json({ error: `附件 "${a.name}" 超限` });
    }
    if (attList.length > 5) return res.status(400).json({ error: "最多5个附件" });
  }

  setupSSE(res);
  const startTime = Date.now();

  try {
    // ---- 1. 准备会话（创建/复用 DB session）----
    let session = _sessionId ? db.getSession(_sessionId) : null;
    const now = new Date().toISOString();
    const sid = _sessionId || uuidv4();

    if (!session) {
      session = db.createSession({
        id: sid, title: message.slice(0, 30) + (message.length > 30 ? '...' : ''),
        model: resolveModel(), sdk_session_id: null, created_at: now, updated_at: now,
      });
    }

    // 保存用户消息
    const userMsgId = uuidv4();
    db.createMessage({
      id: userMsgId, session_id: session.id, role: 'user', content: message,
      model: null, created_at: now, tool_calls: null,
    });

    send(res, { type: "init", session_id: session.id });

    // ---- 2. 处理附件：保存到临时目录，路径注入消息 ----
    let enhancedMessage = message;
    const tempFiles: string[] = [];

    if (attachments && attachments.length > 0) {
      if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
      const filePaths: string[] = [];
      for (const att of attachments) {
        try {
          const safeName = att.name.replace(/[^a-zA-Z0-9._\-\u4e00-\u9fa5]/g, '_');
          const fileName = `${Date.now()}_${safeName}`;
          const filePath = path.join(UPLOADS_DIR, fileName);
          fs.writeFileSync(filePath, Buffer.from(att.base64, 'base64'));
          tempFiles.push(filePath);
          filePaths.push(filePath);
        } catch (e: any) { console.error(`[PM] 附件保存失败:`, e.message); }
      }
      if (filePaths.length > 0) {
        enhancedMessage += `\n\n--- 用户上传了以下文件，你可以直接读取 ---\n${filePaths.map((p, i) => `[${i + 1}] ${p}`).join('\n')}`;
      }
    }

    // ---- 3. 认证 CodeBuddy & 创建 Session ----
    const internetEnv = process.env.CODEBUDDY_INTERNET_ENVIRONMENT || 'external';
    const token = await getAuthToken(internetEnv);

    const { unstable_v2_createSession: createSession } = await import("@tencent-ai/agent-sdk");
    const sdkSession = await createSession({
      cwd: process.cwd(),
      model: resolveModel(),
      environment: internetEnv as 'external' | 'internal' | 'ioa' | 'cloudhosted',
      env: { CODEBUDDY_AUTH_TOKEN: token, CODEBUDDY_INTERNET_ENVIRONMENT: internetEnv },
      permissionMode: 'bypassPermissions' as any,
    });

    // 注入 PM System Prompt
    await sdkSession.send(buildPmSystemPrompt());

    // ---- 4. 发送用户消息并流式处理 ----
    let fullResponse = "";
    let toolCalls: Array<{
      id: string; name: string; input?: Record<string, unknown>;
      status: "running" | "completed" | "error"; result?: string; error?: string;
    }> = [];
    let execAgents: Array<{
      task_id: string; description: string; logs: string[];
      status: "running" | "completed" | "failed"; result?: string;
    }> = [];

    await sdkSession.send(enhancedMessage);

    let currentToolId: string | null = null;

    for await (const msg of sdkSession.stream()) {
      // --- assistant 消息：文本 ---
      if (msg.type === "assistant") {
        const content = msg.message.content;
        if (typeof content === "string") {
          // 检查是否包含 PM 工具调用标签
          const toolCall = parsePMToolCall(content);
          if (toolCall) {
            currentToolId = uuidv4();
            const tc = {
              id: currentToolId, name: toolCall.name,
              input: toolCall.params, status: "running" as const,
            };
            toolCalls.push(tc);
            send(res, { type: "tool_call", id: tc.id, name: tc.name, params: tc.input });

            // 执行工具
            const r = await executePMTool(toolCall.name, toolCall.params);
            const found = toolCalls.find(t => t.id === currentToolId);
            if (found) {
              found.status = r.error ? "error" : "completed";
              found.result = typeof r.result === 'string' ? r.result : JSON.stringify(r.result ?? '');
              found.error = r.error;
            }
            send(res, {
              type: "tool_result", tool_call_id: currentToolId,
              name: toolCall.name, result: r.result ?? r.error, error: r.error,
            });

            // 如果是 dispatch_exec_agent，额外启动 Exec Agent
            if (toolCall.name === "dispatch_exec_agent" && !r.error) {
              const desc = (toolCall.params.description || "") as string;
              const ctx = (toolCall.params.context || "") as string;
              const execResult = await runExecAgent({
                description: desc, context: ctx,
                session_id: session.id, parent_message_id: userMsgId,
                onEvent: (evt: AgentSSEEvent) => send(res, evt),
              });
              execAgents.push({
                task_id: execResult.taskId,
                description: desc, logs: [],
                status: execResult.status === "failed" ? "failed" : "completed",
                result: execResult.summary,
              });
            }

            // 将工具结果作为上下文继续对话
            const resultText = r.error
              ? `❌ 工具 ${toolCall.name} 执行失败: ${r.error}`
              : `✅ 工具 ${toolCall.name} 返回: ${typeof r.result === 'string' ? r.result.slice(0, 500) : JSON.stringify(r.result).slice(0, 500)}`;
            await sdkSession.send(`[工具执行结果]\n${resultText}\n请根据以上结果继续回复用户，不要重复工具输出。`);
          } else {
            // 普通文本，追加到响应
            fullResponse += content;
            send(res, { type: "text", content });
          }
        } else if (Array.isArray(content)) {
          // 多模态内容块
          for (const block of content) {
            if (block.type === "text") {
              fullResponse += block.text;
              send(res, { type: "text", content: block.text });
            } else if (block.type === "tool_use") {
              currentToolId = block.id || uuidv4();
              const tc = {
                id: currentToolId, name: block.name,
                input: (block as any).input || {}, status: "running" as const,
              };
              toolCalls.push(tc);
              send(res, { type: "tool_call", id: tc.id, name: tc.name, params: tc.input });
            }
          }
        }
      }
      // --- tool_result ---
      else if ((msg as any).type === "tool_result") {
        const msgAny = msg as any;
        const tid = msgAny.tool_use_id || currentToolId;
        const tool = toolCalls.find(t => t.id === tid);
        if (tool) {
          tool.status = msgAny.isError ? "error" : "completed";
          tool.result = typeof msgAny.content === 'string' ? msgAny.content : JSON.stringify(msgAny.content);
          tool.error = msgAny.isError ? (typeof msgAny.content === 'string' ? msgAny.content : '') : undefined;
          send(res, { type: "tool_result", tool_call_id: tid, name: tool.name, result: tool.result, error: msgAny.isError ? (typeof msgAny.content === 'string' ? msgAny.content : '') : undefined });
        }
        currentToolId = null;
      }
      // --- done ---
      else if (msg.type === "result") {
        // 补全所有 running 状态的工具
        for (const tc of toolCalls) {
          if (tc.status === "running") {
            tc.status = "completed";
            send(res, { type: "tool_result", tool_call_id: tc.id, name: tc.name, result: tc.result || "完成" });
          }
        }
      }
    }

    // ---- 5. 保存 assistant 消息 ----
    const assistantMsgId = uuidv4();
    db.createMessage({
      id: assistantMsgId, session_id: session.id, role: 'assistant',
      content: fullResponse, model: resolveModel(), created_at: new Date().toISOString(),
      tool_calls: toolCalls.length > 0 ? JSON.stringify(toolCalls) : null,
    });

    // 更新标题
    const msgs = db.getMessagesBySession(session.id);
    if (msgs.length <= 2) {
      db.updateSession(session.id, { title: message.slice(0, 30), model: resolveModel() });
    }

    send(res, { type: "done", duration_ms: Date.now() - startTime });

    // 清理临时文件
    if (tempFiles.length > 0) {
      setTimeout(() => {
        for (const f of tempFiles) { try { fs.unlinkSync(f); } catch { /* ignore */ } }
      }, 5 * 60 * 1000);
    }

  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : "处理失败";
    console.error("[PM Agent] Error:", errMsg);
    send(res, { type: "error", message: errMsg });
  }

  try { res.end(); } catch { /* ignore */ }
});

// ============= POST /api/agent/exec（Exec Agent 入口，不变）============
router.post("/api/agent/exec", async (req, res) => {
  const { description, context, session_id } = req.body as {
    description?: string; context?: string; session_id?: string;
  };
  if (!description?.trim()) return res.status(400).json({ error: "任务描述不能为空" });

  setupSSE(res);
  try {
    const result = await runExecAgent({
      description, context, session_id,
      onEvent: (e: AgentSSEEvent) => send(res, e),
    });
    send(res, { type: "done", duration_ms: 0 });
    void result;
  } catch (err: unknown) {
    send(res, { type: "error", message: err instanceof Error ? err.message : "执行失败" });
  }
  try { res.end(); } catch { /* ignore */ }
});

// ============= GET 接口（保持不变）============
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
