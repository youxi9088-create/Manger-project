import type { AgentSSEEvent } from "@openclaw/shared/types/agent.js";
export interface AttachmentInfo {
    name: string;
    type: string;
    size: number;
    base64: string;
}
export interface AgentMessage {
    role: "system" | "user" | "assistant" | "tool";
    content: string | Array<{
        type: "text" | "image_url";
        text?: string;
        image_url?: {
            url: string;
        };
    }>;
    tool_calls?: Array<{
        id: string;
        type: "function";
        function: {
            name: string;
            arguments: string;
        };
    }>;
    tool_call_id?: string;
    name?: string;
}
export interface OverrideExecutorArgs {
    toolCallId: string;
    toolName: string;
    params: Record<string, unknown>;
    messages: AgentMessage[];
}
export interface OverrideExecutorResult {
    handled: boolean;
    result?: unknown;
    error?: string;
}
export interface AgentLoopOptions {
    systemPrompt: string;
    model?: string;
    maxIterations?: number;
    excludeTools?: string[];
    onEvent?: (event: AgentSSEEvent) => void;
    overrideExecutor?: (args: OverrideExecutorArgs) => Promise<OverrideExecutorResult>;
    /** 用户消息附件列表（图片会转为多模态内容，文档会注入文本描述） */
    attachments?: AttachmentInfo[];
    /** 当前 loop 的唯一标识，用于权限确认 */
    loopId?: string;
}
export declare function runAgentLoop(initialMessages: AgentMessage[], options: AgentLoopOptions): Promise<string>;
//# sourceMappingURL=agent-loop.d.ts.map