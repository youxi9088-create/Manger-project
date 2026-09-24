export interface SystemStatus {
    projects?: number;
    requirements?: number;
    dev_tasks?: number;
    active_tasks?: number;
    employees?: number;
    versions?: number;
}
export declare function buildMainAgentPrompt(status?: SystemStatus): string;
export declare function buildExecAgentPrompt(description: string, context?: string): string;
//# sourceMappingURL=agent-prompts.d.ts.map