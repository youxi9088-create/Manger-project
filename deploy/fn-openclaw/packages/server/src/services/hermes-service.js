// Hermes Agent 调用服务：由 Web 对话入口调用，复用 sessions/messages 表维护历史
import { spawn } from "child_process";
import { v4 as uuidv4 } from "uuid";
import * as db from "./db.js";
import { getTool } from "./agent-tools.js";
const HERMES_TIMEOUT_MS = 120_000;
function getHermesPath() {
    const envPath = process.env.HERMES_PATH;
    if (envPath)
        return envPath;
    // Windows 默认路径
    return "E:\\Hermes\\hermes-agent\\.venv\\Scripts\\hermes.exe";
}
function getHermesToolsets() {
    return process.env.HERMES_TOOLSETS || "openclaw";
}
function existsAsync(path) {
    return new Promise((resolve) => {
        import("fs").then(({ stat }) => {
            stat(path, (err) => resolve(!err));
        });
    });
}
/** 准备会话：保存用户消息，读取近期历史 */
export async function prepareHermesSession(params) {
    const { sessionId: _sessionId, message } = params;
    const now = new Date().toISOString();
    let session = _sessionId ? db.getSession(_sessionId) : null;
    if (!session) {
        session = db.createSession({
            id: _sessionId || uuidv4(),
            title: message.slice(0, 30) + (message.length > 30 ? "..." : ""),
            model: "kimi",
            sdk_session_id: null,
            created_at: now,
            updated_at: now,
        });
    }
    db.createMessage({
        id: uuidv4(),
        session_id: session.id,
        role: "user",
        content: message,
        model: null,
        created_at: now,
        tool_calls: null,
    });
    const history = db.getMessagesBySession(session.id).slice(-20);
    const historyMessages = history.map((m) => ({
        role: m.role,
        content: m.content,
    }));
    return { sessionId: session.id, historyMessages };
}
/** 运行 Hermes 单轮对话 */
export async function runHermesChat(params) {
    const { sessionId, message, historyMessages } = params;
    const startTime = Date.now();
    let systemStatus;
    try {
        const statusTool = getTool("get_system_status");
        if (statusTool) {
            systemStatus = await statusTool.execute({});
        }
    }
    catch {
        systemStatus = { error: "无法获取系统状态" };
    }
    const historyText = historyMessages
        .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
        .join("\n");
    const prompt = [
        "你是 OpenClaw 的 Hermes Agent，可以通过 OpenClaw 工具查询和操作项目、需求、任务、每日计划等数据。",
        "当前系统状态如下：",
        JSON.stringify(systemStatus, null, 2),
        historyText ? `\n以下是对话历史：\n${historyText}` : "",
        `\nUser: ${message}`,
        "Assistant:",
    ].join("\n");
    const hermesPath = getHermesPath();
    const toolsets = getHermesToolsets();
    if (!(await existsAsync(hermesPath))) {
        throw new Error(`Hermes 可执行文件不存在：${hermesPath}，请检查 HERMES_PATH 配置`);
    }
    const response = await callHermes(hermesPath, prompt, toolsets);
    db.createMessage({
        id: uuidv4(),
        session_id: sessionId,
        role: "assistant",
        content: response,
        model: "hermes",
        created_at: new Date().toISOString(),
        tool_calls: null,
    });
    return { response, sessionId, duration_ms: Date.now() - startTime };
}
function callHermes(hermesPath, prompt, toolsets) {
    return new Promise((resolve, reject) => {
        const args = ["-z", prompt];
        if (toolsets) {
            args.push("--toolsets", toolsets);
        }
        const child = spawn(hermesPath, args, {
            env: process.env,
            windowsHide: true,
        });
        let stdout = "";
        let stderr = "";
        let killed = false;
        const timeout = setTimeout(() => {
            killed = true;
            child.kill("SIGTERM");
            reject(new Error("Hermes 调用超时（120s），请检查模型连接或工具响应"));
        }, HERMES_TIMEOUT_MS);
        child.stdout?.on("data", (chunk) => {
            stdout += chunk.toString("utf-8");
        });
        child.stderr?.on("data", (chunk) => {
            stderr += chunk.toString("utf-8");
        });
        child.on("error", (err) => {
            clearTimeout(timeout);
            reject(new Error(`启动 Hermes 失败：${err.message}`));
        });
        child.on("close", (code) => {
            clearTimeout(timeout);
            if (killed)
                return;
            if (code !== 0) {
                const detail = stderr || stdout || `exit code ${code}`;
                reject(new Error(`Hermes 执行失败：${detail}`));
                return;
            }
            resolve(stdout.trim());
        });
    });
}
//# sourceMappingURL=hermes-service.js.map