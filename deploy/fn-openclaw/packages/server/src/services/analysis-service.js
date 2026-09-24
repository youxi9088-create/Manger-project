import dayjs from "dayjs";
// 从 Markdown 报告提取摘要（今日要点部分）
export function extractSummary(markdown) {
    const summaryMatch = markdown.match(/## 今日要点\n\n([\s\S]*?)(?=\n## |---)/);
    if (summaryMatch) {
        return summaryMatch[1]
            .replace(/[#*_\[\]`]/g, "")
            .replace(/\n+/g, " ")
            .trim()
            .slice(0, 500);
    }
    return markdown.replace(/[#*_\[\]`\n]+/g, " ").trim().slice(0, 500);
}
// 解析 Markdown 格式的报告，提取结构化数据
export function parseMarkdownReport(markdown) {
    const result = {
        summary: "",
        work_priorities: [],
        completed_tasks: [],
        pending_tasks: [],
        key_decisions: [],
        follow_ups: [],
        meeting_notes: [],
    };
    const summaryMatch = markdown.match(/## 今日要点\n\n([\s\S]*?)(?=\n## |---)/);
    if (summaryMatch) {
        result.summary = summaryMatch[1]
            .replace(/[#*_\[\]`]/g, "")
            .replace(/\n+/g, " ")
            .trim();
    }
    const todoSectionMatch = markdown.match(/## (?:待办事项|TODO)\n\n([\s\S]*?)(?=\n## |---|$)/i);
    if (todoSectionMatch) {
        const section = todoSectionMatch[1];
        const rows = section.match(/\|([^|]+)\|([^|]*)\|([^|]*)\|/g) || [];
        for (const row of rows) {
            const cells = row
                .split("|")
                .map((c) => c.trim())
                .filter((c) => c);
            if (cells.length >= 2 && !cells[0].match(/^[事项:]/) && !cells[0].match(/^[-:]+$/)) {
                const task = cells[0].replace(/[#*_\[\]]/g, "").trim();
                if (task && task.length > 1) {
                    result.pending_tasks.push({
                        task,
                        priority: "中",
                        deadline: cells[2] || "",
                    });
                }
            }
        }
    }
    const discussionsMatch = markdown.match(/## 重要讨论\n\n([\s\S]*?)(?=\n## |---)/i);
    if (discussionsMatch) {
        const sections = discussionsMatch[1].split(/\n### /).filter((s) => s.trim());
        for (const section of sections) {
            const titleMatch = section.match(/^\d+\.\s*(.+?)(?:\n|$)/);
            if (titleMatch) {
                const taskName = titleMatch[1].replace(/[#*_\[\]]/g, "").trim();
                const conclusionMatch = section.match(/\*\*结论\*\*:\s*([^\n]+)/i);
                const contentLines = section
                    .split("\n")
                    .filter((l) => l.trim() && !l.startsWith("#") && !l.startsWith("|") && !l.match(/^\*\*\w/));
                const summary = contentLines
                    .slice(1, 3)
                    .join(" ")
                    .replace(/[#*_\[\]]/g, "")
                    .trim()
                    .slice(0, 150);
                if (taskName) {
                    result.completed_tasks.push({
                        task: taskName,
                        detail: conclusionMatch ? conclusionMatch[1].replace(/[#*_\[\]]/g, "").trim() : summary,
                    });
                }
            }
        }
    }
    const decisionsMatch = markdown.match(/## 关键决策\n\n([\s\S]*?)(?=\n## |---|$)/i);
    if (decisionsMatch) {
        const lines = decisionsMatch[1].split("\n");
        for (const line of lines) {
            if (line.match(/^\d+\./) || line.match(/\*\*/)) {
                const cleanLine = line
                    .replace(/^\d+\.\s*/, "")
                    .replace(/\*\*/g, "")
                    .replace(/[#_\[\]]/g, "")
                    .trim();
                if (cleanLine && cleanLine.length > 10) {
                    result.key_decisions.push({
                        decision: cleanLine,
                        participants: [],
                        impact: "",
                    });
                }
            }
        }
    }
    return result;
}
// 构建分析提示词（按群分组，每群独立分析）
export function buildAnalysisPrompt(date, chatRecords, stats, topSenders) {
    const topSendersText = topSenders.map((s) => `- ${s.sender_name}: ${s.message_count} 条`).join("\n");
    // ---- 按群名分组聊天记录 ----
    const groupedRecords = new Map();
    for (const r of chatRecords) {
        const groupKey = r.group_name || "(私聊/未分组)";
        if (!groupedRecords.has(groupKey))
            groupedRecords.set(groupKey, []);
        groupedRecords.get(groupKey).push(r);
    }
    // 按消息数降序排列群组
    const sortedGroups = [...groupedRecords.entries()].sort((a, b) => b[1].length - a[1].length);
    // 每群分配配额：总上限 500 条，按消息占比分配，每群至少 10 条
    const TOTAL_QUOTA = 500;
    const totalMsgs = chatRecords.length;
    const groupSections = [];
    for (const [groupName, records] of sortedGroups) {
        const quota = Math.max(10, Math.min(records.length, Math.ceil((records.length / totalMsgs) * TOTAL_QUOTA)));
        // 从该群记录中均匀采样
        const sampled = records.length <= quota ? records : records.filter((_, i) => i % Math.ceil(records.length / quota) === 0).slice(0, quota);
        const uniqueSenders = new Set(records.map(r => r.sender_name)).size;
        const lines = sampled.map((r) => {
            const t = r.timestamp ? String(r.timestamp).slice(0, 19) : "";
            const u = r.sender_name || "未知";
            const c = (r.content || "").replace(/\s+/g, " ").slice(0, 300);
            return `  ${t} ${u}: ${c}`.trim();
        }).join("\n");
        groupSections.push(`=== 【${groupName}】（${records.length} 条消息，${uniqueSenders} 人参与）===\n${lines}`);
    }
    const groupedChatText = groupSections.join("\n\n");
    // 群组列表
    const realGroupNames = sortedGroups.map(([name]) => name);
    const groupListText = realGroupNames.map((n, i) => `  ${i + 1}. "${n}"（${groupedRecords.get(n).length} 条）`).join("\n");
    return (`你是一个专业的工作日报/会议纪要分析助手。\n\n` +
        `请基于以下聊天记录（日期：${date}）输出一份结构化工作日报。\n\n` +
        `统计信息：\n` +
        `- 总消息数：${stats.total_messages}\n` +
        `- 发送者数：${stats.unique_senders}\n` +
        `- 群组数：${stats.unique_groups}\n` +
        `- @我次数：${stats.mentioned_count}\n\n` +
        `Top 发送者：\n${topSendersText || "(无)"}\n\n` +
        `【本次聊天记录中的群组（共 ${realGroupNames.length} 个）】：\n${groupListText}\n\n` +
        `请严格以 JSON 输出（放在 \`\`\`json 代码块中），字段结构如下：\n` +
        `{\n` +
        `  "summary": "今日要点概述（一段文字）",\n` +
        `  "work_priorities": ["重点工作1", "重点工作2"],\n` +
        `  "completed_tasks": [{"task": "任务名", "detail": "完成详情", "group": "所在群组", "participants": ["参与人"]}],\n` +
        `  "pending_tasks": [{"task": "待办事项", "priority": "高/中/低", "deadline": "截止时间", "group": "所在群组", "owner": "负责人"}],\n` +
        `  "key_decisions": [{"decision": "决策内容", "participants": ["参与人"], "impact": "影响说明", "group": "所在群组"}],\n` +
        `  "follow_ups": [{"item": "跟进事项", "person": "负责人", "deadline": "截止时间", "group": "所在群组"}],\n` +
        `  "meeting_notes": [{"meeting": "会议名称", "topic": "讨论主题", "outcome": "结论/决议", "group": "所在群组"}],\n` +
        `  "group_summaries": [{"group": "群组名称", "summary": "该群组核心讨论内容摘要（一段话，包含具体事项、人员和结论）", "key_topics": ["关键话题1"], "active_members": ["活跃成员1"]}],\n` +
        `  "sender_activities": [{"sender": "人员姓名", "groups": ["参与群组1"], "main_activities": ["主要活动1"], "todo_items": ["待办1"]}]\n` +
        `}\n\n` +
        `【关键要求 - 群组讨论摘要（group_summaries）】\n` +
        `1. 必须为每个群组单独生成一条摘要，基于该群的聊天记录独立分析\n` +
        `2. summary 要具体、有信息量，包含：讨论了什么问题、谁做了什么、得出了什么结论/进展\n` +
        `   示例："卡牌光效发黑问题已定位为UE Sequencer中对象复制导致引用错误，廖立豪删除SQ中的光重新加入修复完成并全部上传；卡牌字体字号确认无问题"\n` +
        `3. key_topics 提取该群的关键话题标签（如"卡牌光效修复"、"版本发布"）\n` +
        `4. active_members 列出该群的活跃发言人\n` +
        `5. group 字段必须使用上方列出的真实群组名称，禁止使用"项目群"等通用名称\n` +
        `6. 没有实质讨论的群，summary 写"该群组今日无重要讨论"\n\n` +
        `注意：请严格按照上述字段名称输出，不要使用其他字段名。\n\n` +
        `以下是按群分组的聊天记录：\n\n${groupedChatText}`);
}
export function getTodayDateString() {
    return dayjs().format("YYYY-MM-DD");
}
//# sourceMappingURL=analysis-service.js.map