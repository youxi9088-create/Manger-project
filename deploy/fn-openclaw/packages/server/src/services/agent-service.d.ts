export interface AgentRoleTemplate {
    role_id: string;
    display_name: string;
    description: string;
    capabilities: string[];
    system_prompt: string;
    tools: string[];
    model?: string;
}
/** 预置角色模板库（映射真实运行的 2 个 Agent） */
export declare const AGENT_ROLE_TEMPLATES: Record<string, AgentRoleTemplate>;
export interface EmployeeAgentConfig {
    agent_type: string | null;
    agent_prompt: string | null;
    agent_tools: string[];
    agent_config: Record<string, unknown>;
}
/**
 * 获取员工的 Agent 配置
 */
export declare function getEmployeeAgentConfig(employeeId: string): EmployeeAgentConfig | null;
/**
 * 判断员工是否已启用 Agent 模式
 */
export declare function isAgentEmployee(employeeId: string): boolean;
/**
 * 获取所有预置角色模板列表
 */
export declare function getRoleTemplates(): AgentRoleTemplate[];
/**
 * 获取单个角色模板
 */
export declare function getRoleTemplate(roleId: string): AgentRoleTemplate | null;
/**
 * 为员工配置/更新 Agent 属性
 */
export declare function configureEmployeeAsAgent(employeeId: string, roleId: string, customPrompt?: string, extraTools?: string[]): boolean;
/**
 * 移除员工的 Agent 模式
 */
export declare function removeAgentFromEmployee(employeeId: string): void;
//# sourceMappingURL=agent-service.d.ts.map