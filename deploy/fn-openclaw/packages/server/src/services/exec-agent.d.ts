import type { AgentSSEEvent, ExecAgentResult } from "@openclaw/shared/types/agent.js";
export interface ExecAgentOptions {
    description: string;
    context?: string;
    session_id?: string;
    parent_message_id?: string;
    onEvent?: (event: AgentSSEEvent) => void;
}
export declare function runExecAgent(options: ExecAgentOptions): Promise<ExecAgentResult>;
//# sourceMappingURL=exec-agent.d.ts.map