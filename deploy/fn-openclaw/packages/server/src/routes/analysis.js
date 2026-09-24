import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import path from "path";
import dayjs from "dayjs";
import * as db from "../services/db.js";
import dbInstance from "../services/db.js";
import { buildAnalysisPrompt, parseMarkdownReport, extractSummary } from "../services/analysis-service.js";
import { createAgentSession } from "../utils/agent-sdk.js";
import { ensureU9Configuration } from "./im-u9.js";
const router = Router();
// ============= 分析报告文件（daily_report_*.json） =============
const REPORTS_ROOT_DIR = path.resolve(process.cwd());
function isDailyReportFile(name) {
    return /^daily_report_\d{4}-\d{2}-\d{2}\.json$/i.test(name);
}
function pickLatestDailyReportFile() {
    try {
        const files = fs.readdirSync(REPORTS_ROOT_DIR).filter(isDailyReportFile);
        if (files.length === 0)
            return null;
        files.sort((a, b) => b.localeCompare(a));
        const fileName = files[0];
        return { fileName, fullPath: path.join(REPORTS_ROOT_DIR, fileName) };
    }
    catch (e) {
        return null;
    }
}
router.get('/api/analysis-reports/latest', (req, res) => {
    try {
        const date = typeof req.query.date === 'string' ? req.query.date : undefined;
        let reportFile = null;
        if (date) {
            const fileName = `daily_report_${date}.json`;
            const fullPath = path.join(REPORTS_ROOT_DIR, fileName);
            if (fs.existsSync(fullPath))
                reportFile = { fileName, fullPath };
        }
        else {
            reportFile = pickLatestDailyReportFile();
        }
        if (!reportFile) {
            return res.status(404).json({ ok: false, error: 'NO_REPORT_FOUND', message: '未找到任何 daily_report_YYYY-MM-DD.json 报告文件' });
        }
        const raw = fs.readFileSync(reportFile.fullPath, 'utf-8');
        const json = JSON.parse(raw);
        return res.json({ ok: true, file: reportFile.fileName, report: json });
    }
    catch (e) {
        return res.status(500).json({ ok: false, error: 'INTERNAL_ERROR', message: e.message });
    }
});
// ============= 分析报告 DB CRUD =============
router.get("/api/analysis/reports", (req, res) => {
    try {
        const reports = db.getAnalysisReports({ limit: 100 });
        const parsed = reports.map((r) => {
            const stats = r.statistics ? JSON.parse(r.statistics) : null;
            return {
                ...r,
                work_priorities: r.work_priorities ? JSON.parse(r.work_priorities) : [],
                completed_tasks: r.completed_tasks ? JSON.parse(r.completed_tasks) : [],
                pending_tasks: r.pending_tasks ? JSON.parse(r.pending_tasks) : [],
                key_decisions: r.key_decisions ? JSON.parse(r.key_decisions) : [],
                follow_ups: r.follow_ups ? JSON.parse(r.follow_ups) : [],
                meeting_notes: r.meeting_notes ? JSON.parse(r.meeting_notes) : [],
                statistics: stats,
                group_summaries: stats?.group_summaries || [],
                sender_activities: stats?.sender_activities || [],
            };
        });
        res.json({ reports: parsed });
    }
    catch (error) {
        res.status(500).json({ error: error?.message });
    }
});
router.get("/api/analysis/reports/:reportId", (req, res) => {
    try {
        const { reportId } = req.params;
        const report = db.getAnalysisReportByDate(reportId);
        if (!report)
            return res.status(404).json({ error: "报告不存在" });
        const stats = report.statistics ? JSON.parse(report.statistics) : null;
        const parsed = {
            ...report,
            statistics: stats,
            work_priorities: report.work_priorities ? JSON.parse(report.work_priorities) : [],
            completed_tasks: report.completed_tasks ? JSON.parse(report.completed_tasks) : [],
            pending_tasks: report.pending_tasks ? JSON.parse(report.pending_tasks) : [],
            key_decisions: report.key_decisions ? JSON.parse(report.key_decisions) : [],
            follow_ups: report.follow_ups ? JSON.parse(report.follow_ups) : [],
            meeting_notes: report.meeting_notes ? JSON.parse(report.meeting_notes) : [],
            group_summaries: stats?.group_summaries || [],
            sender_activities: stats?.sender_activities || [],
        };
        res.json({ report: parsed });
    }
    catch (error) {
        res.status(500).json({ error: error?.message });
    }
});
// ============= 手动触发分析（SSE） =============
router.post("/api/analysis/run", async (req, res) => {
    const { date } = req.body;
    const targetDate = date || dayjs().format('YYYY-MM-DD');
    const startDate = targetDate;
    const endDate = dayjs(targetDate).add(1, 'day').format('YYYY-MM-DD');
    const chatRecords = db.getChatRecordsByDateRange(startDate, endDate);
    if (chatRecords.length === 0) {
        return res.json({ success: false, message: `${targetDate} 没有聊天记录` });
    }
    // 修复空 group_name：会话目录统一从数据管理读取，不再读取项目配置文件。
    const configuredDirectory = await ensureU9Configuration();
    const convNameMap = new Map(configuredDirectory.sessions
        .filter((session) => session.name)
        .map((session) => [session.id, session.name]));
    let fixedCount = 0;
    for (const r of chatRecords) {
        const isGenericName = !r.group_name || r.group_name === '99uWEB' || r.group_name === '99U自动抓取';
        if (isGenericName && r.group_id) {
            const realName = convNameMap.get(r.group_id);
            if (realName) {
                r.group_name = realName;
                fixedCount++;
            }
        }
    }
    if (fixedCount > 0) {
        // 同步修复数据库中的 group_name（后台，不阻塞分析）
        try {
            const updateStmt = dbInstance.prepare('UPDATE im_chat_records SET group_name = ? WHERE group_id = ? AND (group_name IS NULL OR group_name = ? OR group_name = ?)');
            for (const [gid, gname] of convNameMap.entries()) {
                updateStmt.run(gname, gid, '', '99uWEB');
            }
            // 同时修复 "99U自动抓取"
            for (const [gid, gname] of convNameMap.entries()) {
                dbInstance.prepare('UPDATE im_chat_records SET group_name = ? WHERE group_id = ? AND group_name = ?').run(gname, gid, '99U自动抓取');
            }
        }
        catch { /* 修复失败不阻断分析 */ }
    }
    const uniqueSenders = new Set(chatRecords.map(r => r.sender_name)).size;
    const uniqueGroups = new Set(chatRecords.map(r => r.group_name)).size;
    const mentionedCount = chatRecords.filter(r => r.is_mentioned).length;
    const stats = { total_messages: chatRecords.length, unique_senders: uniqueSenders, unique_groups: uniqueGroups, mentioned_count: mentionedCount };
    const senderCountMap = new Map();
    for (const record of chatRecords) {
        senderCountMap.set(record.sender_name, (senderCountMap.get(record.sender_name) || 0) + 1);
    }
    const topSenders = Array.from(senderCountMap.entries())
        .map(([sender_name, message_count]) => ({ sender_name, message_count }))
        .sort((a, b) => b.message_count - a.message_count)
        .slice(0, 5);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    const analysisPrompt = buildAnalysisPrompt(targetDate, chatRecords, stats, topSenders);
    try {
        const sdkSession = await createAgentSession({ permissionMode: 'bypassPermissions' });
        res.write(`data: ${JSON.stringify({ type: "init", date: targetDate, chatCount: chatRecords.length })}\n\n`);
        await sdkSession.send(analysisPrompt);
        let fullResponse = "";
        let lastSentLength = 0;
        for await (const msg of sdkSession.stream()) {
            if (msg.type === "assistant") {
                const content = msg.message.content;
                let newText = "";
                if (typeof content === "string") {
                    newText = content;
                    fullResponse = content;
                }
                else if (Array.isArray(content)) {
                    fullResponse = "";
                    for (const block of content) {
                        if (block.type === "text")
                            fullResponse += block.text;
                    }
                    newText = fullResponse;
                }
                if (newText.length > lastSentLength) {
                    const delta = newText.slice(lastSentLength);
                    lastSentLength = newText.length;
                    try {
                        res.write(`data: ${JSON.stringify({ type: "text", content: delta })}\n\n`);
                    }
                    catch { }
                }
            }
            else if (msg.type === "result") {
                const resultMsg = msg;
                res.write(`data: ${JSON.stringify({ type: "done", duration: resultMsg.duration_ms })}\n\n`);
            }
        }
        // 解析并保存
        try {
            let analysisResult = null;
            // 尝试 3 种 JSON 提取方式：
            // 1. 标准 ```json ... ``` 代码块
            const backtickMatch = fullResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (backtickMatch) {
                try {
                    analysisResult = JSON.parse(backtickMatch[1].trim().replace(/^\uFEFF/, ''));
                }
                catch { }
            }
            // 2. json { ... } 无反引号（AI 常见错误）
            if (!analysisResult) {
                const nakedMatch = fullResponse.match(/^(?:\s*json)?\s*(\{[\s\S]*\})\s*$/i);
                if (nakedMatch) {
                    try {
                        analysisResult = JSON.parse(nakedMatch[1].trim());
                    }
                    catch { }
                }
            }
            // 3. 从响应中提取第一个 { ... } JSON 对象
            if (!analysisResult) {
                const firstObjMatch = fullResponse.match(/(\{[\s\S]*\})/);
                if (firstObjMatch) {
                    try {
                        analysisResult = JSON.parse(firstObjMatch[1].trim());
                    }
                    catch {
                        // 如果有尾巴 {} 导致无效 JSON, 尝试逐层收缩
                        let trimmed = firstObjMatch[1].trim();
                        while (trimmed.length > 1 && !analysisResult) {
                            const idx = trimmed.lastIndexOf('}');
                            if (idx < 0)
                                break;
                            trimmed = trimmed.slice(0, idx + 1);
                            try {
                                analysisResult = JSON.parse(trimmed);
                            }
                            catch {
                                trimmed = trimmed.slice(0, -1);
                            }
                        }
                    }
                }
            }
            // 4. 平衡花括号提取（处理 AI 响应后带解释文字含 {} 的情况）
            if (!analysisResult) {
                function extractBalancedJson(text) {
                    const start = text.indexOf('{');
                    if (start < 0)
                        return null;
                    let depth = 0, inStr = false, esc = false;
                    for (let i = start; i < text.length; i++) {
                        const ch = text[i];
                        if (esc) {
                            esc = false;
                            continue;
                        }
                        if (ch === '\\' && inStr) {
                            esc = true;
                            continue;
                        }
                        if (ch === '"' && !esc) {
                            inStr = !inStr;
                            continue;
                        }
                        if (inStr)
                            continue;
                        if (ch === '{')
                            depth++;
                        else if (ch === '}') {
                            depth--;
                            if (depth === 0)
                                return text.slice(start, i + 1);
                        }
                    }
                    return null;
                }
                const balanced = extractBalancedJson(fullResponse);
                if (balanced) {
                    try {
                        analysisResult = JSON.parse(balanced);
                    }
                    catch { }
                }
            }
            if (!analysisResult)
                analysisResult = parseMarkdownReport(fullResponse);
            // ----- 字段名归一化：处理 AI 常见的命名差异（空格、大小写等） -----
            const fieldNameMap = {
                'summary': 'summary',
                'work_priorities': 'work_priorities', 'work priorities': 'work_priorities', 'work_priority': 'work_priorities',
                'completed_tasks': 'completed_tasks', 'completed tasks': 'completed_tasks',
                'pending_tasks': 'pending_tasks', 'pending tasks': 'pending_tasks',
                'key_decisions': 'key_decisions', 'key decisions': 'key_decisions',
                'follow_ups': 'follow_ups', 'follow ups': 'follow_ups',
                'meeting_notes': 'meeting_notes', 'meeting notes': 'meeting_notes',
                'group_summaries': 'group_summaries', 'group summaries': 'group_summaries',
                'sender_activities': 'sender_activities', 'sender activities': 'sender_activities',
            };
            const normalizedRoot = {};
            for (const [k, v] of Object.entries(analysisResult)) {
                const mapped = fieldNameMap[k.toLowerCase().trim()] || k;
                normalizedRoot[mapped] = v;
            }
            analysisResult = normalizedRoot;
            // ----- 类型归一化：确保数组字段始终是数组（AI 常返回对象而非数组） -----
            function ensureArray(v) {
                if (Array.isArray(v))
                    return v;
                if (v == null)
                    return [];
                if (typeof v === 'object')
                    return [v];
                return [v];
            }
            function ensureStringArray(v) {
                if (Array.isArray(v))
                    return v.filter(x => typeof x === 'string');
                if (typeof v === 'string')
                    return [v];
                return [];
            }
            analysisResult.work_priorities = ensureStringArray(analysisResult.work_priorities);
            analysisResult.completed_tasks = ensureArray(analysisResult.completed_tasks);
            analysisResult.pending_tasks = ensureArray(analysisResult.pending_tasks);
            analysisResult.key_decisions = ensureArray(analysisResult.key_decisions);
            analysisResult.follow_ups = ensureArray(analysisResult.follow_ups);
            analysisResult.meeting_notes = ensureArray(analysisResult.meeting_notes);
            analysisResult.group_summaries = ensureArray(analysisResult.group_summaries);
            analysisResult.sender_activities = ensureArray(analysisResult.sender_activities);
            // 收集所有真实群名，用于后处理校验
            const realGroupNames = [...new Set(chatRecords.map((r) => r.group_name).filter((n) => !!n))];
            // 后处理：用真实群名替换 group_summaries 中的模糊/通用名称
            function normalizeGroupName(given) {
                if (!given)
                    return "";
                // 精确匹配（忽略大小写和空格）
                const exactMatch = realGroupNames.find((rn) => rn.toLowerCase().trim() === given.toLowerCase().trim());
                if (exactMatch)
                    return exactMatch;
                // 包含匹配：真实群名包含 LLM 返回的名称 或反之
                const containMatch = realGroupNames.find((rn) => rn.includes(given) || given.includes(rn));
                if (containMatch)
                    return containMatch;
                // 未匹配到任何真实群名，返回原值（可能是新群组或 LLM 错误）
                return given;
            }
            const normalizedGroupSummaries = (analysisResult.group_summaries || []).map((g) => ({
                group: normalizeGroupName(g.group || g.name || ''),
                summary: g.summary || g.activity || '',
                key_topics: g.key_topics || g.topics || [],
                active_members: g.active_members || g.key_members || [],
            }));
            const normalizedSenderActivities = (analysisResult.sender_activities || []).map((s) => ({
                sender: s.sender || s.name || '', groups: s.groups || [],
                main_activities: Array.isArray(s.main_activities) ? s.main_activities : Array.isArray(s.activities) ? s.activities : [],
                todo_items: s.todo_items || s.todoItems || [],
            }));
            db.createAnalysisReport({
                id: uuidv4(), report_date: targetDate,
                summary: analysisResult.summary || extractSummary(fullResponse),
                work_priorities: JSON.stringify(analysisResult.work_priorities || []),
                completed_tasks: JSON.stringify(analysisResult.completed_tasks || []),
                pending_tasks: JSON.stringify(analysisResult.pending_tasks || []),
                key_decisions: JSON.stringify(analysisResult.key_decisions || []),
                follow_ups: JSON.stringify(analysisResult.follow_ups || []),
                meeting_notes: JSON.stringify(analysisResult.meeting_notes || []),
                statistics: JSON.stringify({ totalMessages: stats.total_messages, uniqueSenders: stats.unique_senders, topSenders, group_summaries: normalizedGroupSummaries, sender_activities: normalizedSenderActivities }),
                raw_chat_count: chatRecords.length, important_chat_count: stats.mentioned_count,
                created_at: new Date().toISOString(),
            });
            try {
                res.write(`data: ${JSON.stringify({ type: "saved" })}\n\n`);
            }
            catch { }
        }
        catch (parseError) {
            try {
                res.write(`data: ${JSON.stringify({ type: "error", message: "分析结果解析失败: " + parseError.message })}\n\n`);
            }
            catch { }
        }
    }
    catch (error) {
        try {
            res.write(`data: ${JSON.stringify({ type: "error", message: error?.message || "分析执行失败" })}\n\n`);
        }
        catch { }
    }
    try {
        res.end();
    }
    catch { }
});
export default router;
//# sourceMappingURL=analysis.js.map