/**
 * Agent 执行服务
 * 负责将员工升级为可执行的 AI Agent，接收任务后自主工作
 */
import { createAgentSession } from "../utils/agent-sdk.js";
import dbInstance from "./db.js";

// ============= 预置 Agent 角色模板 =============

export interface AgentRoleTemplate {
  role_id: string;           // 唯一标识
  display_name: string;      // 显示名称
  description: string;       // 描述
  capabilities: string[];    // 能力列表
  system_prompt: string;     // 系统提示词
  tools: string[];           // 可用工具/API
  model?: string;            // 指定模型
}

/** 预置角色模板库（映射真实运行的 2 个 Agent） */
export const AGENT_ROLE_TEMPLATES: Record<string, AgentRoleTemplate> = {
  main: {
    role_id: "main",
    display_name: "PM Agent（主 Agent）",
    description: "项目管理编排者：理解用户意图、选择工具、汇总结果、派发复杂任务给执行 Agent",
    capabilities: ["intent_understanding", "tool_orchestration", "result_synthesis", "task_dispatch"],
    system_prompt: `你是 OpenClaw 的主 Agent（PM Agent），负责理解用户意图、编排工具调用、汇总结果，并在需要时派发复杂多步骤任务给执行 Agent。

## 核心能力
1. **意图理解** - 准确理解用户的项目管理诉求
2. **工具编排** - 选择最合适的工具完成任务
3. **结果汇总** - 将多个工具的结果整合为清晰的回复
4. **任务派发** - 将复杂多步骤任务委托给执行 Agent

## 工作原则
- 优先使用工具获取真实数据，不凭空回答
- 工具调用失败时，说明原因并给出替代方案
- 回复简洁、结构化，避免冗余信息`,
    tools: [
      "get_system_status", "query_projects", "query_requirements", "query_dev_tasks",
      "query_employees", "query_versions", "query_work_cycles", "query_chat_records",
      "query_reports", "create_project", "create_requirement", "create_dev_task",
      "update_requirement_status", "assign_employee", "dispatch_exec_agent",
    ],
    model: "moonshot-v1-128k",
  },
  exec: {
    role_id: "exec",
    display_name: "执行 Agent（Exec Agent）",
    description: "任务执行者：接收多步骤任务，自主多轮调用工具完成执行，进度实时回传",
    capabilities: ["multi_step_execution", "tool_chaining", "autonomous_decision", "progress_reporting"],
    system_prompt: `你是 OpenClaw 的执行 Agent（Exec Agent），专注于多步骤任务的自主执行。

## 核心能力
1. **多步骤执行** - 将复杂任务分解为多个工具调用步骤依次完成
2. **工具链式调用** - 前一步的输出作为后一步的输入
3. **自主决策** - 在执行过程中根据实际情况调整策略
4. **进度回传** - 每完成一个步骤都实时上报进度

## 工作原则
- 每次只做一件事，完成后再做下一件
- 遇到错误时记录并继续尝试，不轻易放弃
- 执行完毕后汇总所有操作结果`,
    tools: [
      "get_system_status", "query_projects", "query_requirements", "query_dev_tasks",
      "query_employees", "query_versions", "query_work_cycles", "query_chat_records",
      "query_reports", "create_project", "create_requirement", "create_dev_task",
      "update_requirement_status", "assign_employee",
    ],
    model: "moonshot-v1-128k",
  },
};

// ============= 类型定义 =============

export interface EmployeeAgentConfig {
  agent_type: string | null;
  agent_prompt: string | null;
  agent_tools: string[];
  agent_config: Record<string, unknown>;
}

// ============= 核心函数 =============

/**
 * 获取员工的 Agent 配置
 */
export function getEmployeeAgentConfig(employeeId: string): EmployeeAgentConfig | null {
  const row = dbInstance.prepare(
    `SELECT agent_type, agent_prompt, agent_tools, agent_config FROM employees WHERE id = ?`
  ).get(employeeId) as (EmployeeAgentConfig & { id: string }) | undefined;

  if (!row || !row.agent_type) return null;

  return {
    agent_type: row.agent_type,
    agent_prompt: row.agent_prompt,
    agent_tools: typeof row.agent_tools === "string" ? JSON.parse(row.agent_tools || "[]") : [],
    agent_config: typeof row.agent_config === "string" ? JSON.parse(row.agent_config || "{}") : {},
  };
}

/**
 * 判断员工是否已启用 Agent 模式
 */
export function isAgentEmployee(employeeId: string): boolean {
  const config = getEmployeeAgentConfig(employeeId);
  return !!config && !!config.agent_type;
}

/**
 * 获取所有预置角色模板列表
 */
export function getRoleTemplates(): AgentRoleTemplate[] {
  return Object.values(AGENT_ROLE_TEMPLATES);
}

/**
 * 获取单个角色模板
 */
export function getRoleTemplate(roleId: string): AgentRoleTemplate | null {
  return AGENT_ROLE_TEMPLATES[roleId] || null;
}

/**
 * 为员工配置/更新 Agent 属性
 */
export function configureEmployeeAsAgent(
  employeeId: string,
  roleId: string,
  customPrompt?: string,
  extraTools?: string[]
): boolean {
  const template = getRoleTemplate(roleId);
  if (!template) {
    throw new Error(`未知的 Agent 角色: ${roleId}，可选: ${Object.keys(AGENT_ROLE_TEMPLATES).join(", ")}`);
  }

  const finalPrompt = customPrompt?.trim() || template.system_prompt;
  const finalTools = extraTools || template.tools;
  const finalConfig = template.model ? { model: template.model } : {};

  dbInstance.prepare(
    `UPDATE employees SET
      agent_type = ?,
      agent_prompt = ?,
      agent_tools = ?,
      agent_config = ?,
      updated_at = datetime('now','localtime')
     WHERE id = ?`
  ).run(roleId, finalPrompt, JSON.stringify(finalTools), JSON.stringify(finalConfig), employeeId);

  // 确认写入成功
  const updated = getEmployeeAgentConfig(employeeId);
  return updated !== null;
}

/**
 * 移除员工的 Agent 模式
 */
export function removeAgentFromEmployee(employeeId: string): void {
  dbInstance.prepare(
    `UPDATE employees SET agent_type = NULL, agent_prompt = NULL, agent_tools = '[]', agent_config = '{}', updated_at = datetime('now','localtime') WHERE id = ?`
  ).run(employeeId);
}
