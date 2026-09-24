// F:\个人\app\openclaw\packages\server\src\services\exec-agent.ts
// 执行 Agent：接收任务，自主多步骤执行，结果写入 agent_tasks 表
import { v4 as uuidv4 } from "uuid";
import dbInstance from "./db.js";
import { runAgentLoop } from "./agent-loop.js";
import { buildExecAgentPrompt } from "./agent-prompts.js";
export async function runExecAgent(options) {
    const taskId = uuidv4();
    const { description, context, session_id, parent_message_id, onEvent } = options;
    const now = new Date().toISOString();
    // 创建任务记录
    dbInstance.prepare(`
    INSERT INTO agent_tasks (id, session_id, parent_message_id, description, status, agent_type, created_at)
    VALUES (?, ?, ?, ?, 'running', 'exec', ?)
  `).run(taskId, session_id ?? null, parent_message_id ?? null, description, now);
    onEvent?.({ type: "exec_start", task_id: taskId, description });
    // 统计 tool call 次数（存入 iterations 字段，含义：tool calls count）
    let toolCallCount = 0;
    const toolCallsRecord = [];
    let summary = "";
    let finalStatus = "completed";
    let errorMsg;
    try {
        summary = await runAgentLoop([{ role: "user", content: description }], {
            systemPrompt: buildExecAgentPrompt(description, context),
            model: "moonshot-v1-128k",
            maxIterations: 20,
            excludeTools: ["dispatch_exec_agent"],
            onEvent: (event) => {
                if (event.type === "tool_call") {
                    toolCallCount++;
                    toolCallsRecord.push({ name: event.name, params: event.params, result: null });
                    onEvent?.({ type: "exec_progress", task_id: taskId, message: `正在调用工具：${event.name}` });
                }
                if (event.type === "tool_result" && toolCallsRecord.length > 0) {
                    const last = toolCallsRecord[toolCallsRecord.length - 1];
                    last.result = event.result;
                    onEvent?.({
                        type: "exec_progress",
                        task_id: taskId,
                        message: event.error
                            ? `工具 ${event.name} 执行失败：${event.error}`
                            : `工具 ${event.name} 完成`,
                    });
                }
                // text 事件转为 exec_progress（保留足够长度展示摘要）
                if (event.type === "text") {
                    onEvent?.({ type: "exec_progress", task_id: taskId, message: event.content.slice(0, 500) });
                }
            },
        });
        // 更新任务记录为完成
        dbInstance.prepare(`
      UPDATE agent_tasks
      SET status = 'completed', result = ?, tool_calls = ?, iterations = ?, completed_at = ?
      WHERE id = ?
    `).run(summary, JSON.stringify(toolCallsRecord), toolCallCount, new Date().toISOString(), taskId);
        onEvent?.({ type: "exec_done", task_id: taskId, result: { summary, tool_calls_count: toolCallCount } });
    }
    catch (err) {
        finalStatus = "failed";
        errorMsg = err instanceof Error ? err.message : "执行 Agent 异常";
        summary = errorMsg;
        dbInstance.prepare(`
      UPDATE agent_tasks
      SET status = 'failed', error = ?, iterations = ?, completed_at = ?
      WHERE id = ?
    `).run(errorMsg, toolCallCount, new Date().toISOString(), taskId);
        onEvent?.({ type: "exec_progress", task_id: taskId, message: `执行失败：${errorMsg}` });
        onEvent?.({ type: "exec_done", task_id: taskId, result: { error: errorMsg } });
    }
    return { taskId, summary, status: finalStatus };
}
//# sourceMappingURL=exec-agent.js.map