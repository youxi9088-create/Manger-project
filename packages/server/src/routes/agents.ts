/**
 * Agent 路由
 * 提供 Agent 配置、角色管理、任务执行等接口
 */
import { Router } from "express";
import {
  getRoleTemplates,
  getRoleTemplate,
  configureEmployeeAsAgent,
  removeAgentFromEmployee,
  isAgentEmployee,
  getEmployeeAgentConfig,
} from "../services/agent-service.js";
import { createAgentSession } from "../utils/agent-sdk.js";
import dbInstance from "../services/db.js";

const router = Router();

// ============= GET /api/agent-roles - 预置角色模板列表 =============
router.get("/api/agent-roles", (_req, res) => {
  try {
    const roles = getRoleTemplates();
    res.json({ success: true, data: roles.map((r) => ({
      role_id: r.role_id,
      display_name: r.display_name,
      description: r.description,
      capabilities: r.capabilities,
      tools: r.tools,
    })) });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "查询失败";
    res.status(500).json({ error: message });
  }
});

// ============= GET /api/employees/:id/agent-config - 查看员工 Agent 配置 =============
router.get("/api/employees/:id/agent-config", (req, res) => {
  try {
    const config = getEmployeeAgentConfig(req.params.id);
    if (!config) {
      return res.json({ success: true, data: null, agent_enabled: false });
    }
    // 附带员工基本信息
    const emp = dbInstance.prepare("SELECT id, name, rank, status FROM employees WHERE id = ?").get(req.params.id);
    res.json({ success: true, data: { ...config, employee: emp }, agent_enabled: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "查询失败";
    res.status(500).json({ error: message });
  }
});

// ============= POST /api/employees/:id/enable-agent - 启用 Agent 模式 =============
router.post("/api/employees/:id/enable-agent", (req, res) => {
  try {
    const emp = dbInstance.prepare("SELECT id FROM employees WHERE id = ?").get(req.params.id);
    if (!emp) return res.status(404).json({ error: "员工不存在" });

    const { role_id, custom_prompt, extra_tools } = req.body;
    if (!role_id) return res.status(400).json({ error: "role_id 不能为空，可选: project_delivery" });

    configureEmployeeAsAgent(
      req.params.id,
      role_id,
      custom_prompt as string | undefined,
      extra_tools as string[] | undefined
    );

    const config = getEmployeeAgentConfig(req.params.id);
    res.status(201).json({ success: true, data: config, message: `已启用 Agent 模式（${role_id}）` });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "配置失败";
    res.status(500).json({ error: message });
  }
});

// ============= POST /api/employees/:id/disable-agent - 禁用 Agent 模式 =============
router.post("/api/employees/:id/disable-agent", (req, res) => {
  try {
    removeAgentFromEmployee(req.params.id);
    res.json({ success: true, message: "已禁用 Agent 模式" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "操作失败";
    res.status(500).json({ error: message });
  }
});

// ============= POST /api/employees/:id/agent/run - 触发 Agent 执行任务 (SSE) =============
router.post("/api/employees/:id/agent/run", async (req, res) => {
  try {
    const { id: employeeId } = req.params;
    const { task_input, context } = req.body;

    // 获取员工 Agent 配置
    const agentConfig = getEmployeeAgentConfig(employeeId);
    if (!agentConfig) return res.status(400).json({ error: "该员工未启用 Agent 模式" });

    const employee = dbInstance.prepare("SELECT name FROM employees WHERE id = ?").get(employeeId) as
      { name: string } | undefined;
    if (!employee) return res.status(404).json({ error: "员工不存在" });

    const roleTemplate = getRoleTemplate(agentConfig.agent_type || "");
    if (!roleTemplate) return res.status(500).json({ error: "未找到角色模板配置" });

    // 构建完整 prompt
    const systemPrompt = agentConfig.agent_prompt || roleTemplate.system_prompt;
    const fullPrompt = `${systemPrompt}\n\n---\n\n## 当前任务\n${task_input || "(无具体任务)"}
${context ? `\n\n## 背景信息\n${context}` : ""}

## 输出要求
请开始执行，每完成一个步骤输出进度和结果。如果需要调用工具/API，说明你要做什么。`;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    try {
      res.write(`data: ${JSON.stringify({ type: "init", employee_name: employee.name, agent_type: agentConfig.agent_type })}\n\n`);

      const sdkSession = await createAgentSession({
        model: (agentConfig.agent_config as any)?.model || roleTemplate.model,
        permissionMode: "bypassPermissions",
      });
      await sdkSession.send(fullPrompt);

      let fullResponse = "";
      for await (const msg of sdkSession.stream()) {
        if (msg.type === "assistant") {
          const content = msg.message.content;
          let newText = "";
          if (typeof content === "string") { newText = content; fullResponse += content; }
          else if (Array.isArray(content)) {
            fullResponse = "";
            for (const block of content) { if (block.type === "text") fullResponse += block.text; }
            newText = fullResponse;
          }
          try { res.write(`data: ${JSON.stringify({ type: "text", content: newText })}\n\n`); } catch { /* client disconnected */ }
        } else if (msg.type === "result") {
          const resultMsg = msg as any;
          res.write(`data: ${JSON.stringify({ type: "done", duration_ms: resultMsg.duration_ms, response_length: fullResponse.length })}\n\n`);
        }
      }

      // 记录执行历史到 work_cycles（如果有关联的任务）
      res.write(`data: ${JSON.stringify({ type: "completed", full_response: fullResponse })}\n\n`);
    } catch (execError: unknown) {
      try {
        res.write(`data: ${JSON.stringify({ type: "error", message: (execError as Error).message })}\n\n`);
      } catch { /* ignore */ }
    }

    try { res.end(); } catch { /* ignore */ }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "执行失败";
    res.status(500).json({ error: message });
  }
});

export default router;
