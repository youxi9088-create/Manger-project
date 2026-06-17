// F:\个人\app\openclaw\packages\server\src\services\agent-tools.ts
// Agent 工具注册表：管理所有可调用工具

import { registerQueryTools } from "./agent-tools-query.js";
import { registerWriteTools } from "./agent-tools-write.js";
import type { AgentToolDefinition, MoonshotTool } from "@openclaw/shared/types/agent.js";

export interface AgentTool {
  definition: AgentToolDefinition;
  execute: (params: Record<string, unknown>) => Promise<unknown>;
}

const toolRegistry = new Map<string, AgentTool>();

export function registerTool(tool: AgentTool): void {
  toolRegistry.set(tool.definition.name, tool);
}

export function getTool(name: string): AgentTool | undefined {
  return toolRegistry.get(name);
}

export function getAllTools(exclude: string[] = []): AgentTool[] {
  return Array.from(toolRegistry.values()).filter(t => !exclude.includes(t.definition.name));
}

export function getToolsForMoonshot(exclude: string[] = []): MoonshotTool[] {
  return getAllTools(exclude).map(t => ({
    type: "function" as const,
    function: t.definition,
  }));
}

let initialized = false;

export function initAgentTools(): void {
  if (initialized) return;
  initialized = true;
  registerQueryTools(registerTool);
  registerWriteTools(registerTool);
}
