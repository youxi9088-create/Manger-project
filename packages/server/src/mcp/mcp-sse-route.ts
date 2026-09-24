// OpenClaw MCP SSE 路由：供 MCP Client 连接
// 已加入 API Key 认证：连接时需在 Authorization header 或 query 参数中提供有效 Key

import { Router, type Request, type Response } from "express";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createMcpServer } from "./create-mcp-server.js";
import { verifyApiKey, extractApiKey, type McpApiKey } from "../services/mcp-auth.js";

interface Session {
  transport: SSEServerTransport;
  server: ReturnType<typeof createMcpServer>["server"];
  apiKey: McpApiKey | null;
}

const sessions = new Map<string, Session>();

// 是否跳过认证（本地开发模式，默认 false）
const SKIP_AUTH = process.env.OPENCLAW_MCP_SKIP_AUTH === "1";

function getApiKeyFromRequest(req: Request): string | null {
  // 1. Authorization header
  const fromHeader = extractApiKey(req.headers.authorization);
  if (fromHeader) return fromHeader;

  // 2. Query 参数 ?key=sk-openclaw-xxx
  const fromQuery = typeof req.query.key === 'string' ? req.query.key : null;
  if (fromQuery) return fromQuery;

  return null;
}

const router = Router();

router.get("/mcp/sse", async (req: Request, res: Response) => {
  // 认证检查
  let apiKey: McpApiKey | null = null;

  if (!SKIP_AUTH) {
    const keyValue = getApiKeyFromRequest(req);
    if (!keyValue) {
      return res.status(401).json({
        error: "未提供 API Key。请在 Authorization header 或 ?key= 参数中提供。",
        hint: "POST /api/mcp-keys 创建新 Key",
      });
    }

    apiKey = verifyApiKey(keyValue);
    if (!apiKey) {
      return res.status(403).json({ error: "API Key 无效或已吊销" });
    }
  }

  // 根据权限模式创建 MCP Server
  // readonly key 只暴露只读工具
  const originalMode = process.env.OPENCLAW_MCP_MODE;
  if (apiKey?.mode === 'readonly') {
    process.env.OPENCLAW_MCP_MODE = 'readonly';
  }
  const { server } = createMcpServer();
  if (originalMode !== undefined) {
    process.env.OPENCLAW_MCP_MODE = originalMode;
  } else {
    delete process.env.OPENCLAW_MCP_MODE;
  }

  const transport = new SSEServerTransport("/mcp/messages", res);
  const sessionId = transport.sessionId;

  sessions.set(sessionId, { transport, server, apiKey });

  res.on("close", () => {
    sessions.delete(sessionId);
    transport.close().catch(() => {});
  });

  try {
    await server.connect(transport);
    console.log(`[MCP] SSE 连接成功: session=${sessionId}, key=${apiKey?.name ?? 'no-auth'}`);
  } catch (error: any) {
    console.error("[MCP] SSE 连接失败:", error?.message ?? error);
    if (!res.headersSent) {
      res.status(500).json({ error: "MCP SSE connection failed" });
    }
    sessions.delete(sessionId);
  }
});

router.post("/mcp/messages", async (req: Request, res: Response) => {
  const sessionId = req.query.sessionId;
  if (typeof sessionId !== "string") {
    res.status(400).json({ error: "Missing sessionId" });
    return;
  }

  const session = sessions.get(sessionId);
  if (!session) {
    res.status(404).json({ error: "SSE session not found" });
    return;
  }

  try {
    await session.transport.handlePostMessage(req, res);
  } catch (error: any) {
    console.error("[MCP] POST 消息处理失败:", error?.message ?? error);
    if (!res.headersSent) {
      res.status(500).json({ error: "MCP message handling failed" });
    }
  }
});

export default router;
