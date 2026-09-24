import type { AgentToolDefinition, MoonshotTool } from "@openclaw/shared/types/agent.js";
export interface AgentTool {
    definition: AgentToolDefinition;
    /** 是否需要用户二次确认（删除、批量修改、状态流转等） */
    requireConfirm?: boolean;
    execute: (params: Record<string, unknown>) => Promise<unknown>;
}
export declare function registerTool(tool: AgentTool): void;
export declare function getTool(name: string): AgentTool | undefined;
export declare function getAllTools(exclude?: string[]): AgentTool[];
export declare function getToolsForMoonshot(exclude?: string[]): MoonshotTool[];
export declare function initAgentTools(): void;
//# sourceMappingURL=agent-tools.d.ts.map