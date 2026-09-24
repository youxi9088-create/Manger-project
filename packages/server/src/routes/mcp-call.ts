// MCP 工具试玩端点：直接通过 REST 调用 MCP 工具，无需 SSE 连接
// 用于前端 Playground 试玩功能

import { Router, type Request, type Response } from "express";
import { createMcpServer } from "../mcp/create-mcp-server.js";

const router = Router();

router.post("/api/mcp/call", async (req: Request, res: Response) => {
  const { name, arguments: args } = req.body;

  if (!name || typeof name !== "string") {
    res.status(400).json({ error: "缺少工具名称 (name)" });
    return;
  }

  try {
    const { server, tools } = createMcpServer();
    const tool = tools.find(t => t.definition.name === name);

    if (!tool) {
      res.status(404).json({ error: `工具不存在: ${name}` });
      return;
    }

    console.log(`[MCP Trial] ${name}(${JSON.stringify(args ?? {})})`);

    const result = await tool.execute((args ?? {}) as Record<string, unknown>);

    res.json({
      success: true,
      tool: name,
      result,
    });
  } catch (error: any) {
    console.error(`[MCP Trial] ${name} failed:`, error?.message ?? error);
    res.status(500).json({
      success: false,
      tool: name,
      error: error?.message ?? String(error),
    });
  }
});

export default router;
