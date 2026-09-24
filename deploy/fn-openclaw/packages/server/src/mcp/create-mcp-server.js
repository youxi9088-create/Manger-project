// OpenClaw MCP Server：把已有的 Agent 工具注册表以 MCP 形式暴露给 Hermes
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ListToolsRequestSchema, CallToolRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { initAgentTools, getAllTools } from "../services/agent-tools.js";
// 默认开放全部工具（读写都包括）。
// 如果只想让 Hermes 读数据，可在启动服务器前设置 OPENCLAW_MCP_MODE=readonly
const MCP_MODE = process.env.OPENCLAW_MCP_MODE ?? "full";
const READONLY_MODE = MCP_MODE === "readonly";
const ALLOW_DELETE = process.env.OPENCLAW_MCP_ALLOW_DELETE === "1";
// 删除类工具默认不向 Hermes 暴露，防止误操作导致数据丢失。
// 如需开放，启动服务器时设置 OPENCLAW_MCP_ALLOW_DELETE=1。
const DELETE_TOOL_NAMES = new Set([
    "delete_requirement",
    "delete_dev_task",
    "delete_daily_plan_task",
]);
// 只读白名单（readonly 模式下使用）
const READONLY_TOOL_NAMES = new Set([
    "get_system_status",
    "get_project_by_id",
    "query_projects",
    "get_requirement_by_id",
    "query_requirements",
    "get_dev_task_by_id",
    "query_dev_tasks",
    "query_employees",
    "query_versions",
    "query_work_cycles",
    "query_chat_records",
    "query_reports",
]);
function toMcpTool(tool) {
    const { name, description, parameters } = tool.definition;
    return {
        name,
        description,
        inputSchema: parameters ?? { type: "object", properties: {} },
    };
}
export function createMcpServer() {
    initAgentTools();
    const allTools = getAllTools();
    const exposedTools = allTools.filter((t) => {
        const name = t.definition.name;
        if (DELETE_TOOL_NAMES.has(name) && !ALLOW_DELETE)
            return false;
        if (READONLY_MODE)
            return READONLY_TOOL_NAMES.has(name);
        return true;
    });
    const toolByName = new Map(exposedTools.map(t => [t.definition.name, t]));
    const server = new Server({ name: "openclaw", version: "1.0.0" }, { capabilities: { tools: {} } });
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: exposedTools.map(toMcpTool),
    }));
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;
        const tool = toolByName.get(name);
        if (!tool) {
            return {
                content: [{ type: "text", text: JSON.stringify({ error: `Unknown tool: ${name}` }) }],
                isError: true,
            };
        }
        try {
            console.log(`[MCP] ${name}(${JSON.stringify(args ?? {})})`);
            const result = await tool.execute((args ?? {}));
            return {
                content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            };
        }
        catch (error) {
            const message = error?.message ?? String(error);
            console.error(`[MCP] ${name} failed:`, message);
            return {
                content: [{ type: "text", text: JSON.stringify({ error: message }) }],
                isError: true,
            };
        }
    });
    return { server, tools: exposedTools };
}
//# sourceMappingURL=create-mcp-server.js.map