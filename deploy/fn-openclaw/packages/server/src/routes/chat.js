import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import * as db from "../services/db.js";
import dbInstance from "../services/db.js";
import { defaultModel, getAuthToken, resolveModel } from "../utils/agent-sdk.js";
import fs from "fs";
import path from "path";
const router = Router();
const pendingPermissions = new Map();
const PERMISSION_TIMEOUT = 5 * 60 * 1000;
// ============= 会话 CRUD =============
router.get("/api/sessions", (req, res) => {
    try {
        const sessions = db.getAllSessions();
        const sessionsWithMessages = sessions.map(session => {
            const messages = db.getMessagesBySession(session.id);
            return { ...session, messageCount: messages.length };
        });
        res.json({ sessions: sessionsWithMessages });
    }
    catch (error) {
        res.status(500).json({ error: error?.message || "获取会话失败" });
    }
});
router.get("/api/sessions/:sessionId", (req, res) => {
    try {
        const { sessionId } = req.params;
        const session = db.getSession(sessionId);
        if (!session)
            return res.status(404).json({ error: "会话不存在" });
        const messages = db.getMessagesBySession(sessionId);
        const parsedMessages = messages.map(msg => {
            const toolCalls = msg.tool_calls ? JSON.parse(msg.tool_calls) : null;
            // 对 dispatch_exec_agent 的 tool_calls，从 agent_tasks 表补全执行结果
            if (toolCalls && Array.isArray(toolCalls)) {
                for (const tc of toolCalls) {
                    if (tc.name === "dispatch_exec_agent" && tc.result?.task_id && (!tc.result?.summary || tc.result.summary === "")) {
                        try {
                            const task = dbInstance.prepare("SELECT status, result, error, iterations, tool_calls FROM agent_tasks WHERE id = ?").get(tc.result.task_id);
                            if (task) {
                                // 优先用 result，其次 error，最后从 tool_calls 提取摘要
                                let summary = task.result || task.error || "";
                                if (!summary && task.tool_calls) {
                                    try {
                                        const calls = JSON.parse(task.tool_calls);
                                        const lastCalls = calls.slice(-3);
                                        summary = `[${task.status}] 执行了 ${task.iterations} 轮工具调用\n` +
                                            lastCalls.map(c => {
                                                const r = typeof c.result === "string" ? c.result : JSON.stringify(c.result, null, 2);
                                                return `▸ ${c.name}: ${(r || "").slice(0, 300)}`;
                                            }).join("\n");
                                    }
                                    catch {
                                        summary = `[${task.status}] 执行了 ${task.iterations} 轮工具调用`;
                                    }
                                }
                                if (!summary)
                                    summary = `[${task.status}] 执行了 ${task.iterations} 轮工具调用`;
                                tc.result.summary = summary;
                                tc.result.task_status = task.status;
                                tc.result.iterations = task.iterations;
                            }
                        }
                        catch { /* ignore */ }
                    }
                }
            }
            return { ...msg, tool_calls: toolCalls };
        });
        res.json({ session, messages: parsedMessages });
    }
    catch (error) {
        res.status(500).json({ error: error?.message || "获取会话失败" });
    }
});
router.post("/api/sessions", (req, res) => {
    try {
        const { model = defaultModel, title = "新对话" } = req.body;
        const now = new Date().toISOString();
        const session = db.createSession({ id: uuidv4(), title, model, sdk_session_id: null, created_at: now, updated_at: now });
        res.json({ session });
    }
    catch (error) {
        res.status(500).json({ error: error?.message || "创建会话失败" });
    }
});
router.patch("/api/sessions/:sessionId", (req, res) => {
    try {
        const { sessionId } = req.params;
        const { title, model } = req.body;
        const success = db.updateSession(sessionId, { title, model });
        if (!success)
            return res.status(404).json({ error: "会话不存在" });
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: error?.message || "更新会话失败" });
    }
});
router.delete("/api/sessions/:sessionId", (req, res) => {
    try {
        const { sessionId } = req.params;
        const success = db.deleteSession(sessionId);
        if (!success)
            return res.status(404).json({ error: "会话不存在" });
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: error?.message || "删除会话失败" });
    }
});
// ============= 权限响应 =============
router.post("/api/permission-response", (req, res) => {
    const { requestId, behavior, message } = req.body;
    const pending = pendingPermissions.get(requestId);
    if (!pending)
        return res.status(404).json({ error: "权限请求不存在或已超时" });
    pendingPermissions.delete(requestId);
    if (behavior === 'allow') {
        pending.resolve({ behavior: 'allow', updatedInput: pending.input });
    }
    else {
        pending.resolve({ behavior: 'deny', message: message || '用户拒绝了此操作' });
    }
    res.json({ success: true });
});
// ============= 聊天 API（SSE） =============
router.post("/api/chat", async (req, res) => {
    const { sessionId, message, model, systemPrompt, cwd, permissionMode, attachments } = req.body;
    if (!message)
        return res.status(400).json({ error: "消息不能为空" });
    // ---- 处理附件：保存到临时目录，将路径注入消息 ----
    const UPLOADS_DIR = path.join(process.cwd(), '..', '..', 'data', 'uploads', 'chat');
    let enhancedMessage = message;
    let tempFiles = [];
    if (Array.isArray(attachments) && attachments.length > 0) {
        if (!fs.existsSync(UPLOADS_DIR)) {
            fs.mkdirSync(UPLOADS_DIR, { recursive: true });
        }
        const filePaths = [];
        for (const att of attachments) {
            if (!att.name || !att.type || !att.base64)
                continue;
            try {
                const safeName = att.name.replace(/[^a-zA-Z0-9._\-\u4e00-\u9fa5]/g, '_');
                const fileName = `${Date.now()}_${safeName}`;
                const filePath = path.join(UPLOADS_DIR, fileName);
                fs.writeFileSync(filePath, Buffer.from(att.base64, 'base64'));
                tempFiles.push(filePath);
                filePaths.push(filePath);
                console.log(`[Chat] 附件已保存: ${fileName} (${(att.base64.length * 3 / 4 / 1024).toFixed(1)}KB)`);
            }
            catch (e) {
                console.error(`[Chat] 附件保存失败 (${att.name}):`, e.message);
            }
        }
        if (filePaths.length > 0) {
            const pathsText = filePaths.map((p, i) => `[${i + 1}] ${p}`).join('\n');
            enhancedMessage += `\n\n--- 用户上传了以下文件，你可以直接读取这些文件的绝对路径来查看内容 ---\n${pathsText}\n（请使用 Glob 或 ReadFile 等工具读取文件内容）`;
        }
    }
    let session = sessionId ? db.getSession(sessionId) : null;
    const now = new Date().toISOString();
    if (!session) {
        session = db.createSession({
            id: sessionId || uuidv4(),
            title: message.slice(0, 30) + (message.length > 30 ? '...' : ''),
            model: resolveModel(model),
            sdk_session_id: null,
            created_at: now,
            updated_at: now
        });
    }
    const selectedModel = resolveModel(model) || resolveModel(session.model);
    const sdkSessionId = session.sdk_session_id;
    const userMessageId = uuidv4();
    const assistantMessageId = uuidv4();
    try {
        db.createMessage({
            id: userMessageId, session_id: session.id, role: 'user',
            content: message, model: null, created_at: now, tool_calls: null
        });
    }
    catch (dbError) {
        return res.status(500).json({ error: "保存消息失败", detail: dbError?.message });
    }
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    const workingDir = cwd || process.cwd();
    try {
        const canUseTool = async (toolName, input, options) => {
            if (permissionMode === 'bypassPermissions') {
                return { behavior: 'allow', updatedInput: input };
            }
            const requestId = uuidv4();
            res.write(`data: ${JSON.stringify({ type: "permission_request", requestId, toolUseId: options.toolUseID, toolName, input, sessionId: session.id, timestamp: Date.now() })}\n\n`);
            return new Promise((resolve, reject) => {
                pendingPermissions.set(requestId, { resolve, reject, toolName, input, sessionId: session.id, timestamp: Date.now() });
                setTimeout(() => {
                    if (pendingPermissions.has(requestId)) {
                        pendingPermissions.delete(requestId);
                        resolve({ behavior: 'deny', message: '权限请求超时' });
                    }
                }, PERMISSION_TIMEOUT);
            });
        };
        const internetEnv = process.env.CODEBUDDY_INTERNET_ENVIRONMENT || 'external';
        const token = await getAuthToken(internetEnv);
        const { unstable_v2_createSession } = await import("@tencent-ai/agent-sdk");
        const sdkSession = await unstable_v2_createSession({
            cwd: workingDir,
            model: selectedModel,
            environment: internetEnv,
            env: { CODEBUDDY_AUTH_TOKEN: token, CODEBUDDY_INTERNET_ENVIRONMENT: internetEnv },
            permissionMode: permissionMode || 'default',
        });
        let fullResponse = "";
        let toolCalls = [];
        const newSdkSessionId = sdkSession.sessionId;
        res.write(`data: ${JSON.stringify({ type: "init", sessionId: session.id, userMessageId, assistantMessageId, model: selectedModel })}\n\n`);
        if (newSdkSessionId && newSdkSessionId !== sdkSessionId) {
            db.updateSession(session.id, { sdk_session_id: newSdkSessionId });
        }
        let currentToolId = null;
        await sdkSession.send(enhancedMessage);
        for await (const msg of sdkSession.stream()) {
            if (msg.type === "system" && msg.subtype === "init") {
                const sId = msg.session_id;
                if (sId && sId !== sdkSessionId)
                    db.updateSession(session.id, { sdk_session_id: sId });
            }
            else if (msg.type === "assistant") {
                const content = msg.message.content;
                if (typeof content === "string") {
                    fullResponse += content;
                    res.write(`data: ${JSON.stringify({ type: "text", content })}\n\n`);
                }
                else if (Array.isArray(content)) {
                    for (const block of content) {
                        if (block.type === "text") {
                            fullResponse += block.text;
                            res.write(`data: ${JSON.stringify({ type: "text", content: block.text })}\n\n`);
                        }
                        else if (block.type === "tool_use") {
                            currentToolId = block.id || uuidv4();
                            const toolInput = block.input || {};
                            const toolCall = { id: currentToolId, name: block.name, input: toolInput, status: "running" };
                            toolCalls.push(toolCall);
                            res.write(`data: ${JSON.stringify({ type: "tool", id: toolCall.id, name: toolCall.name, input: toolCall.input, status: toolCall.status })}\n\n`);
                        }
                    }
                }
            }
            else if (msg.type === "tool_result") {
                const msgAny = msg;
                const toolId = msgAny.tool_use_id || currentToolId;
                const isError = msgAny.is_error || false;
                const content = msgAny.content;
                const tool = toolCalls.find(t => t.id === toolId) || toolCalls[toolCalls.length - 1];
                if (tool) {
                    tool.status = isError ? "error" : "completed";
                    tool.isError = isError;
                    tool.result = typeof content === 'string' ? content : JSON.stringify(content);
                    res.write(`data: ${JSON.stringify({ type: "tool_result", toolId: tool.id, content: tool.result, isError })}\n\n`);
                }
                currentToolId = null;
            }
            else if (msg.type === "result") {
                toolCalls.forEach(tool => {
                    if (tool.status === "running") {
                        tool.status = "completed";
                        res.write(`data: ${JSON.stringify({ type: "tool_result", toolId: tool.id, content: tool.result || "已完成" })}\n\n`);
                    }
                });
                const resultMsg = msg;
                res.write(`data: ${JSON.stringify({ type: "done", duration: resultMsg.duration_ms, cost: resultMsg.total_cost_usd })}\n\n`);
            }
        }
        db.createMessage({
            id: assistantMessageId, session_id: session.id, role: 'assistant',
            content: fullResponse, model: selectedModel, created_at: new Date().toISOString(),
            tool_calls: toolCalls.length > 0 ? JSON.stringify(toolCalls) : null
        });
        const messages = db.getMessagesBySession(session.id);
        if (messages.length <= 2) {
            db.updateSession(session.id, { title: message.slice(0, 30) + (message.length > 30 ? '...' : ''), model: selectedModel });
        }
        res.end();
        // 清理临时附件文件（延迟清理，给 Agent 足够时间读取）
        if (tempFiles.length > 0) {
            setTimeout(() => {
                for (const f of tempFiles) {
                    try {
                        fs.unlinkSync(f);
                    }
                    catch { /* ignore */ }
                }
            }, 5 * 60 * 1000); // 5分钟后删除
            console.log(`[Chat] ${tempFiles.length} 个临时文件将在5分钟后自动清理`);
        }
    }
    catch (error) {
        const errorMessage = error?.message || "处理请求时发生错误";
        res.write(`data: ${JSON.stringify({ type: "error", message: errorMessage })}\n\n`);
        res.end();
    }
});
export default router;
//# sourceMappingURL=chat.js.map