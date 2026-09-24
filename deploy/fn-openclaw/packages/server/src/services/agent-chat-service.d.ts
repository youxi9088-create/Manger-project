import { type AgentMessage, type AttachmentInfo } from "./agent-loop.js";
import { type SystemStatus } from "./agent-prompts.js";
import type { AgentSSEEvent } from "@openclaw/shared/types/agent.js";
export interface PreparedSession {
    sessionId: string;
    userMessageId: string;
    historyMessages: AgentMessage[];
    systemStatus: SystemStatus | undefined;
}
export interface ChatResult {
    fullResponse: string;
    toolCallsRecord: Array<{
        id: string;
        name: string;
        params: unknown;
        result: unknown;
        error?: string;
    }>;
    duration_ms: number;
}
/** 准备会话：查找或创建 session，保存用户消息，取近期历史 */
export declare function prepareAgentSession(params: {
    sessionId?: string;
    message: string;
    attachments?: AttachmentInfo[];
}): Promise<PreparedSession>;
/** 运行主 Agent 对话（含 dispatch_exec_agent 真调度） */
export declare function runMainAgentChat(params: {
    sessionId: string;
    userMessageId: string;
    message: string;
    historyMessages: AgentMessage[];
    systemStatus: SystemStatus | undefined;
    attachments?: AttachmentInfo[];
    onEvent: (event: AgentSSEEvent) => void;
}): Promise<ChatResult>;
//# sourceMappingURL=agent-chat-service.d.ts.map