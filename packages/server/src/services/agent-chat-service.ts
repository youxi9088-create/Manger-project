// F:\个人\app\openclaw\packages\server\src\services\agent-chat-service.ts
// 主 Agent 聊天核心逻辑（路由层薄，业务逻辑在这里）

import { v4 as uuidv4 } from "uuid";
import * as db from "./db.js";
import { runAgentLoop, type AgentMessage, type AttachmentInfo } from "./agent-loop.js";
import { buildMainAgentPrompt, type SystemStatus } from "./agent-prompts.js";
import { getTool } from "./agent-tools.js";
import { runExecAgent } from "./exec-agent.js";
import type { AgentSSEEvent } from "@openclaw/shared/types/agent.js";

export interface PreparedSession {
  sessionId: string;
  userMessageId: string;
  historyMessages: AgentMessage[];
  systemStatus: SystemStatus | undefined;
}

export interface ChatResult {
  fullResponse: string;
  toolCallsRecord: Array<{ id: string; name: string; params: unknown; result: unknown; error?: string }>;
  duration_ms: number;
}

/** 准备会话：查找或创建 session，保存用户消息，取近期历史 */
export async function prepareAgentSession(params: {
  sessionId?: string;
  message: string;
  attachments?: AttachmentInfo[];
}): Promise<PreparedSession> {
  const { sessionId, message, attachments } = params;
  const now = new Date().toISOString();

  let session = sessionId ? db.getSession(sessionId) : null;
  if (!session) {
    session = db.createSession({
      id: sessionId || uuidv4(),
      title: message.slice(0, 30) + (message.length > 30 ? "..." : ""),
      model: "moonshot-v1-128k",
      sdk_session_id: null,
      created_at: now,
      updated_at: now,
    });
  }

  const userMessageId = uuidv4();

  // 将附件信息序列化到消息内容中（用于历史记录展示）
  let messageContent = message;
  if (attachments && attachments.length > 0) {
    const attachmentInfo = attachments.map(a =>
      `[附件: ${a.name} (${(a.size / 1024).toFixed(1)}KB, ${a.type})]`
    ).join(" ");
    messageContent = `${message}\n\n${attachmentInfo}`;
  }

  db.createMessage({
    id: userMessageId,
    session_id: session.id,
    role: "user",
    content: messageContent,
    model: null,
    created_at: now,
    tool_calls: null,
  });

  // 获取系统状态（用于 prompt 注入）
  let systemStatus: SystemStatus | undefined;
  try {
    const statusTool = getTool("get_system_status");
    if (statusTool) {
      systemStatus = (await statusTool.execute({})) as SystemStatus;
    }
  } catch { /* 查询失败不阻断 */ }

  // 取近期历史（最多 20 条），排除刚插入的用户消息
  const history = db.getMessagesBySession(session.id).slice(-20);
  const historyMessages: AgentMessage[] = history
    .filter(m => m.id !== userMessageId)
    .map(m => ({ role: m.role as "user" | "assistant", content: m.content }));

  return {
    sessionId: session.id,
    userMessageId,
    historyMessages,
    systemStatus,
  };
}

/** 运行主 Agent 对话（含 dispatch_exec_agent 真调度） */
export async function runMainAgentChat(params: {
  sessionId: string;
  userMessageId: string;
  message: string;
  historyMessages: AgentMessage[];
  systemStatus: SystemStatus | undefined;
  attachments?: AttachmentInfo[];
  onEvent: (event: AgentSSEEvent) => void;
}): Promise<ChatResult> {
  const { sessionId, userMessageId, message, historyMessages, systemStatus, attachments, onEvent } = params;
  const startTime = Date.now();

  const messages: AgentMessage[] = [
    ...historyMessages,
    { role: "user", content: message },
  ];

  const toolCallsRecord: Array<{ id: string; name: string; params: unknown; result: unknown; error?: string }> = [];

  const fullResponse = await runAgentLoop(messages, {
    systemPrompt: buildMainAgentPrompt(systemStatus),
    model: "moonshot-v1-128k",
    maxIterations: 10,
    attachments,
    loopId: sessionId,
    onEvent: (event) => {
      onEvent(event);
      if (event.type === "tool_call") {
        toolCallsRecord.push({ id: event.id, name: event.name, params: event.params, result: null });
      }
      if (event.type === "tool_result") {
        const record = toolCallsRecord.find(r => r.id === event.tool_call_id);
        if (record) { record.result = event.result; record.error = event.error; }
      }
    },
    overrideExecutor: async ({ toolCallId, toolName, params }) => {
      if (toolName !== "dispatch_exec_agent") return { handled: false };

      const description = typeof params.description === "string" ? params.description : "";
      const context = typeof params.context === "string" ? params.context : undefined;

      if (!description) {
        return { handled: true, error: "dispatch_exec_agent 缺少 description 参数" };
      }

      try {
        const result = await runExecAgent({
          description,
          context,
          session_id: sessionId,
          parent_message_id: userMessageId,
          onEvent,
        });
        return {
          handled: true,
          result: { dispatched: true, task_id: result.taskId, summary: result.summary },
        };
      } catch (err: unknown) {
        return {
          handled: true,
          error: err instanceof Error ? err.message : "执行 Agent 调度失败",
        };
      }
    },
  });

  // 保存 assistant 消息
  db.createMessage({
    id: uuidv4(),
    session_id: sessionId,
    role: "assistant",
    content: fullResponse,
    model: "moonshot-v1-128k",
    created_at: new Date().toISOString(),
    tool_calls: toolCallsRecord.length > 0 ? JSON.stringify(toolCallsRecord) : null,
  });

  return { fullResponse, toolCallsRecord, duration_ms: Date.now() - startTime };
}
