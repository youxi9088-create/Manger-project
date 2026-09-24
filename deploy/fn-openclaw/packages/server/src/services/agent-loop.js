// F:\个人\app\openclaw\packages\server\src\services\agent-loop.ts
// 自研轻量 Agent Loop 引擎，支持 Moonshot Function Calling + overrideExecutor
import https from "https";
import { getTool, getToolsForMoonshot } from "./agent-tools.js";
import { waitForPermission } from "./agent-permission.js";
/** 将文本 + 附件转换为 Moonshot API 支持的消息内容格式 */
function buildUserContent(text, attachments) {
    if (!attachments || attachments.length === 0)
        return text;
    const imageAttachments = attachments.filter(a => a.type.startsWith("image/"));
    const docAttachments = attachments.filter(a => !a.type.startsWith("image/"));
    // 如果没有图片附件，将文档信息追加到文本中
    if (imageAttachments.length === 0) {
        let enhancedText = text;
        if (docAttachments.length > 0) {
            enhancedText += "\n\n---\n**附件：**\n" + docAttachments.map(a => `- **${a.name}** (${(a.size / 1024).toFixed(1)}KB, ${a.type})`).join("\n");
        }
        return enhancedText;
    }
    // 有图片 → 构建多模态内容数组
    const parts = [];
    parts.push({ type: "text", text });
    for (const img of imageAttachments) {
        parts.push({
            type: "image_url",
            image_url: { url: `data:${img.type};base64,${img.base64}` },
        });
    }
    if (docAttachments.length > 0) {
        parts.push({
            type: "text",
            text: "**文档附件：**\n" + docAttachments.map(a => `- **${a.name}** (${(a.size / 1024).toFixed(1)}KB, ${a.type})`).join("\n"),
        });
    }
    return parts;
}
// ---------- Moonshot API 直连 ----------
function moonshotRequest(body) {
    return new Promise((resolve, reject) => {
        const apiKey = process.env.MOONSHOT_API_KEY;
        if (!apiKey) {
            reject(new Error("未配置 MOONSHOT_API_KEY"));
            return;
        }
        const payload = JSON.stringify(body);
        const options = {
            hostname: "api.moonshot.cn",
            path: "/v1/chat/completions",
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`,
                "Content-Length": Buffer.byteLength(payload),
            },
        };
        const req = https.request(options, (res) => {
            let data = "";
            res.on("data", (chunk) => { data += chunk; });
            res.on("end", () => {
                try {
                    resolve(JSON.parse(data));
                }
                catch {
                    reject(new Error(`Moonshot 响应解析失败: ${data.slice(0, 200)}`));
                }
            });
        });
        req.on("error", reject);
        req.write(payload);
        req.end();
    });
}
// ---------- 主循环 ----------
export async function runAgentLoop(initialMessages, options) {
    const { systemPrompt, model = "moonshot-v1-128k", maxIterations = 10, excludeTools = [], onEvent, overrideExecutor, attachments, loopId, } = options;
    // 处理最后一条用户消息：如果有附件，转为多模态格式
    const processedMessages = [...initialMessages];
    if (attachments && attachments.length > 0 && processedMessages.length > 0) {
        const lastMsg = processedMessages[processedMessages.length - 1];
        if (lastMsg.role === "user" && typeof lastMsg.content === "string") {
            processedMessages[processedMessages.length - 1] = {
                ...lastMsg,
                content: buildUserContent(lastMsg.content, attachments),
            };
        }
    }
    const loopMessages = [
        { role: "system", content: systemPrompt },
        ...processedMessages,
    ];
    const tools = getToolsForMoonshot(excludeTools);
    let fullResponse = "";
    for (let i = 0; i < maxIterations; i++) {
        const isLastIteration = i === maxIterations - 1;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const requestBody = {
            model,
            messages: loopMessages,
        };
        // 最后一轮不传 tools，强制 LLM 输出纯文本摘要而非继续调工具
        if (tools.length > 0 && !isLastIteration) {
            requestBody.tools = tools;
            requestBody.tool_choice = "auto";
        }
        const response = await moonshotRequest(requestBody);
        if (response.error) {
            throw new Error(`Moonshot API 错误: ${response.error.message}`);
        }
        const choice = response.choices?.[0];
        if (!choice)
            throw new Error("Moonshot 返回空响应");
        const msg = choice.message;
        if (!msg)
            throw new Error("Moonshot 返回空 message");
        // 把当前 assistant 消息加入历史
        loopMessages.push({
            role: "assistant",
            content: msg.content ?? "",
            tool_calls: msg.tool_calls,
        });
        // 没有工具调用 → 生成完毕
        if (!msg.tool_calls || msg.tool_calls.length === 0) {
            fullResponse = msg.content ?? "";
            // 检测 token 截断：finish_reason=length 说明输出被 max_tokens 切断
            if (choice.finish_reason === "length" && fullResponse) {
                fullResponse += "\n\n（⚠️ 输出被截断，以上为部分内容）";
            }
            if (fullResponse)
                onEvent?.({ type: "text", content: fullResponse });
            break;
        }
        // 有工具调用 → 逐个执行
        for (const toolCall of msg.tool_calls) {
            const toolName = toolCall.function.name;
            let params = {};
            try {
                params = JSON.parse(toolCall.function.arguments);
            }
            catch {
                params = {};
            }
            onEvent?.({ type: "tool_call", id: toolCall.id, name: toolName, params });
            let toolResult = null;
            let toolError;
            // 1. 先检查 overrideExecutor
            if (overrideExecutor) {
                const override = await overrideExecutor({
                    toolCallId: toolCall.id,
                    toolName,
                    params,
                    messages: loopMessages,
                });
                if (override.handled) {
                    toolResult = override.result;
                    toolError = override.error;
                }
            }
            // 2. overrideExecutor 未处理，走普通工具注册表
            if (toolResult === null && !toolError) {
                const tool = getTool(toolName);
                if (tool) {
                    try {
                        // 2.1 高风险工具：先请求用户确认
                        if (tool.requireConfirm && loopId) {
                            const confirmReason = `工具 ${toolName} 可能修改系统数据，需要你的确认`;
                            onEvent?.({
                                type: "permission_request",
                                loop_id: loopId,
                                tool_call_id: toolCall.id,
                                name: toolName,
                                params,
                                reason: confirmReason,
                            });
                            const { approved, reason } = await waitForPermission(loopId, toolCall.id);
                            onEvent?.({
                                type: "permission_resolved",
                                loop_id: loopId,
                                tool_call_id: toolCall.id,
                                approved,
                            });
                            if (!approved) {
                                toolError = reason || "用户拒绝执行该操作";
                            }
                        }
                        // 2.2 执行工具（未被拒绝时）
                        if (!toolError) {
                            toolResult = await tool.execute(params);
                        }
                    }
                    catch (err) {
                        toolError = err instanceof Error ? err.message : "工具执行失败";
                    }
                }
                else {
                    toolError = `工具 ${toolName} 未注册`;
                }
            }
            onEvent?.({
                type: "tool_result",
                tool_call_id: toolCall.id,
                name: toolName,
                result: toolResult,
                error: toolError,
            });
            loopMessages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                name: toolName,
                content: JSON.stringify(toolError ? { error: toolError } : toolResult),
            });
        }
    }
    // 如果迭代用完但没有纯文本回复（LLM 一直在调工具），从最后一条 assistant 消息和工具结果中提取摘要
    if (!fullResponse) {
        // 收集所有工具结果作为上下文
        const toolResults = loopMessages
            .filter(m => m.role === "tool")
            .map(m => {
            try {
                return typeof m.content === 'string' ? JSON.parse(m.content) : m.content;
            }
            catch {
                return m.content;
            }
        });
        // 找最后一条有内容的 assistant 消息
        const lastAssistantContent = [...loopMessages]
            .reverse()
            .find(m => m.role === "assistant" && m.content)?.content;
        if (lastAssistantContent) {
            fullResponse = typeof lastAssistantContent === 'string' ? lastAssistantContent : JSON.stringify(lastAssistantContent);
        }
        else if (toolResults.length > 0) {
            // 用最后几个工具结果拼一个摘要
            const lastResults = toolResults.slice(-3);
            fullResponse = `[已完成 ${maxIterations} 轮工具调用] 最近结果摘要：\n${lastResults.map(r => typeof r === "string" ? r : JSON.stringify(r, null, 2).slice(0, 500)).join("\n---\n")}`;
        }
        else {
            fullResponse = `[已完成 ${maxIterations} 轮迭代，未产生文本总结]`;
        }
        if (fullResponse)
            onEvent?.({ type: "text", content: fullResponse });
    }
    return fullResponse;
}
//# sourceMappingURL=agent-loop.js.map