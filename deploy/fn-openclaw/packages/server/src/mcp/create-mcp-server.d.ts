import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { type AgentTool } from "../services/agent-tools.js";
export declare function createMcpServer(): {
    server: Server<{
        method: string;
        params?: {
            [x: string]: unknown;
            _meta?: {
                [x: string]: unknown;
                progressToken?: string | number | undefined;
                "io.modelcontextprotocol/related-task"?: {
                    taskId: string;
                } | undefined;
            } | undefined;
        } | undefined;
    }, {
        method: string;
        params?: {
            [x: string]: unknown;
            _meta?: {
                [x: string]: unknown;
                progressToken?: string | number | undefined;
                "io.modelcontextprotocol/related-task"?: {
                    taskId: string;
                } | undefined;
            } | undefined;
        } | undefined;
    }, {
        [x: string]: unknown;
        _meta?: {
            [x: string]: unknown;
            progressToken?: string | number | undefined;
            "io.modelcontextprotocol/related-task"?: {
                taskId: string;
            } | undefined;
        } | undefined;
    }>;
    tools: AgentTool[];
};
//# sourceMappingURL=create-mcp-server.d.ts.map