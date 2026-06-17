// F:\个人\app\openclaw\packages\shared\types\agent.ts
// Agent 系统共享类型定义

/** 工具定义 */
export interface AgentToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
      default?: unknown;
    }>;
    required?: string[];
  };
}

/** Moonshot Function Calling 格式 */
export interface MoonshotTool {
  type: "function";
  function: AgentToolDefinition;
}

/** Agent 任务执行记录（对应 agent_tasks 表） */
export interface AgentTask {
  id: string;
  session_id: string | null;
  parent_message_id: string | null;
  description: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  agent_type: "main" | "exec";
  tool_calls: string | null;
  result: string | null;
  error: string | null;
  iterations: number; // 实际记录 tool call 次数
  created_at: string;
  completed_at: string | null;
}

/** SSE 事件类型（前后端共用） */
export type AgentSSEEvent =
  | { type: "init"; session_id: string }
  | { type: "thinking"; content: string }
  | { type: "text"; content: string }
  | { type: "tool_call"; id: string; name: string; params: Record<string, unknown> }
  | { type: "tool_result"; tool_call_id: string; name: string; result: unknown; error?: string; content?: string; isError?: boolean }
  | { type: "exec_start"; task_id: string; description: string }
  | { type: "exec_progress"; task_id: string; message: string }
  | { type: "exec_done"; task_id: string; result: unknown }
  | { type: "done"; duration_ms: number }
  | { type: "error"; message: string };

/** ExecAgent 返回结果 */
export interface ExecAgentResult {
  taskId: string;
  summary: string;
  status: "completed" | "failed";
}
