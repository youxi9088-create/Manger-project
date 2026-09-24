// F:\youxi\app\openclaw\packages\server\src\services\agent-tools.ts
// Agent 工具注册表：管理所有可调用工具
import { registerQueryTools } from "./agent-tools-query.js";
import { registerWriteTools } from "./agent-tools-write.js";
const toolRegistry = new Map();
export function registerTool(tool) {
    toolRegistry.set(tool.definition.name, tool);
}
export function getTool(name) {
    return toolRegistry.get(name);
}
export function getAllTools(exclude = []) {
    return Array.from(toolRegistry.values()).filter(t => !exclude.includes(t.definition.name));
}
export function getToolsForMoonshot(exclude = []) {
    return getAllTools(exclude).map(t => ({
        type: "function",
        function: t.definition,
    }));
}
let initialized = false;
export function initAgentTools() {
    if (initialized)
        return;
    initialized = true;
    registerQueryTools(registerTool);
    registerWriteTools(registerTool);
}
//# sourceMappingURL=agent-tools.js.map