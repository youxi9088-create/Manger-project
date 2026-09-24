import { Router } from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { saveMeetingIntelligence, getMeetingIntelligence, deleteMeetingIntelligence } from "../services/db.js";
import meetingService from "../services/meeting-service.js";
import { generateMeetingMinutes, transcribeMeetingAudio } from "../services/meeting-transcription.js";
import { deleteRemoteMeetingIntelligence, loadRemoteMeetingIntelligence, saveRemoteMeetingIntelligence, } from "../services/meeting-intelligence-store.js";
import { loadMeetingIntelligenceJob, saveMeetingIntelligenceJob, } from "../services/meeting-intelligence-job-store.js";
import { loadMeetingProcessJob, saveMeetingProcessJob, } from "../services/meeting-process-job-store.js";
import { waitUntil } from "../utils/fn-functions.js";
const router = Router();
function publicMeetingProcessJob(job) {
    const { jobId, meetingId, status, createdAt, updatedAt, result, error } = job;
    return { jobId, meetingId, status, createdAt, updatedAt, result, error };
}
async function updateMeetingProcessJob(job, update) {
    Object.assign(job, update, { updatedAt: new Date().toISOString() });
    await saveMeetingProcessJob(job);
}
async function runMeetingProcessJob(job, directUrl, options) {
    try {
        await updateMeetingProcessJob(job, { status: 'downloading' });
        const audioPath = await meetingService.downloadMedia(job.meetingId, 'audio', directUrl, { forceRefresh: options?.forceRefresh });
        const stat = fs.statSync(audioPath);
        if (stat.size < 10_000)
            throw new Error(`会议音频下载不完整（${stat.size} 字节）`);
        await updateMeetingProcessJob(job, { status: 'transcribing' });
        const transcript = await transcribeMeetingAudio(audioPath, { audioUrl: directUrl });
        await updateMeetingProcessJob(job, { status: 'summarizing' });
        const minutes = await generateMeetingMinutes(transcript, { title: job.title, startTime: job.startTime });
        await meetingService.persistMeetingResult({
            meetingId: job.meetingId,
            title: job.title,
            startTime: job.startTime,
            transcript,
            summary: minutes.summary,
            todos: minutes.todos,
            audioPath,
        });
        await updateMeetingProcessJob(job, { status: 'completed', result: { transcript, ...minutes } });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error || '转录失败');
        await updateMeetingProcessJob(job, { status: 'failed', error: message });
        console.error(`[Meeting process ${job.jobId}] ${message}`);
    }
}
// ============= Playwright 会议系统 =============
const MEETING_URL = 'https://ndmeeting-personal-management.sdp.101.com/?sdp-app-id=b4fb92a0-af7f-49c2-b270-8f62afac1133&lang=zh-CN&&machine_code=087abe36b877d7d9a6638d2a3c25/#/record';
const USERNAME = process.env.MEETING_USERNAME || '986916';
const PASSWORD = process.env.MEETING_PASSWORD || 'Youxi0921';
const MEETINGS_DATA_DIR = process.env.MEETING_DATA_DIR || path.resolve(process.cwd(), 'data', 'meetings');
if (!fs.existsSync(MEETINGS_DATA_DIR))
    fs.mkdirSync(MEETINGS_DATA_DIR, { recursive: true });
let meetingBrowser = null;
let meetingPage = null;
let meetingContext = null;
const AUTH_FILE = path.resolve(process.cwd(), 'data', 'auth', 'meeting-auth.json');
async function readSavedMeetingRecords(limit = 50) {
    const results = await meetingService.listMeetingResults(limit);
    return results
        .map((item) => ({
        id: item.meetingId || item.key,
        meetingId: item.meetingId || item.key,
        title: item.title || item.key,
        startTime: item.startTime || null,
        updatedAt: item.updatedAt,
        status: item.transcript ? 'processed' : 'saved',
        hasTranscript: Boolean(item.transcript),
        hasSummary: Boolean(item.summary),
        hasIntelligence: Boolean(getMeetingIntelligence(item.meetingId || item.key)),
        // Expose the compact minutes todo list for Daily Plan imports without
        // returning the potentially large transcript body.
        todos: Array.isArray(item.todos) ? item.todos : [],
    }))
        .sort((a, b) => new Date(b.startTime || 0).getTime() - new Date(a.startTime || 0).getTime());
}
router.get("/api/meetings/saved", async (req, res) => {
    try {
        const date = typeof req.query.date === 'string' ? req.query.date : '';
        const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 200);
        let records = await readSavedMeetingRecords(200);
        if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            records = records.filter((record) => String(record.startTime || '').slice(0, 10) === date);
        }
        res.json({ success: true, records: records.slice(0, limit), total: records.length });
    }
    catch (e) {
        res.status(500).json({ error: e?.message || '读取本地会议记录失败' });
    }
});
async function ensureMeetingLogin() {
    if (meetingPage && !meetingPage.isClosed()) {
        try {
            const url = await meetingPage.url();
            if (!url.includes('login') && url.includes('#/record'))
                return meetingPage;
        }
        catch { }
    }
    const { chromium } = await import('playwright');
    if (!meetingBrowser || !meetingBrowser.isConnected()) {
        const chromePaths = [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
        ];
        let executablePath;
        for (const p of chromePaths) {
            if (fs.existsSync(p)) {
                executablePath = p;
                break;
            }
        }
        if (executablePath) {
            meetingBrowser = await chromium.launch({
                headless: false,
                executablePath,
                args: [
                    '--start-minimized',
                    '--window-position=-32000,-32000',
                    '--no-sandbox',
                    '--disable-gpu',
                    '--disable-dev-shm-usage',
                ],
            });
        }
        else {
            try {
                meetingBrowser = await chromium.launch({
                    headless: false,
                    channel: 'chrome',
                    args: [
                        '--start-minimized',
                        '--window-position=-32000,-32000',
                        '--no-sandbox',
                        '--disable-gpu',
                        '--disable-dev-shm-usage',
                    ],
                });
            }
            catch {
                throw new Error('未找到 Chrome 浏览器');
            }
        }
    }
    let contextOpts = {};
    if (fs.existsSync(AUTH_FILE))
        contextOpts = { storageState: AUTH_FILE };
    if (meetingContext) {
        try {
            await meetingContext.close();
        }
        catch { }
    }
    meetingContext = await meetingBrowser.newContext(contextOpts);
    meetingPage = await meetingContext.newPage();
    await meetingPage.setViewportSize({ width: 1440, height: 900 });
    await meetingPage.goto(MEETING_URL, { waitUntil: 'networkidle', timeout: 60000 });
    await meetingPage.waitForTimeout(2000);
    const needsLogin = await meetingPage.$('#login_name');
    if (needsLogin) {
        await meetingPage.fill('#login_name', USERNAME);
        await meetingPage.fill('#password', PASSWORD);
        await meetingPage.click('button[type="submit"]');
        await meetingPage.waitForTimeout(5000);
        // 确保 auth 目录存在
        const authDir = path.dirname(AUTH_FILE);
        if (!fs.existsSync(authDir))
            fs.mkdirSync(authDir, { recursive: true });
        await meetingContext.storageState({ path: AUTH_FILE });
    }
    const currentUrl = await meetingPage.url();
    if (!currentUrl.includes('#/record')) {
        await meetingPage.goto(MEETING_URL, { waitUntil: 'networkidle', timeout: 30000 });
        await meetingPage.waitForTimeout(2000);
    }
    try {
        await meetingPage.waitForSelector('tr.fish-table-row', { timeout: 10000 });
    }
    catch { }
    return meetingPage;
}
// ============= 获取会议列表 =============
router.post("/api/meetings", async (req, res) => {
    try {
        // FN runtime cannot depend on a visible local Chrome session. Fetch only from
        // the persisted meeting token and never return the service's mock fallback.
        const records = await meetingService.fetchMeetingListWithToken();
        res.json({ success: true, source: 'meeting_token_api', records, total: records.length });
    }
    catch (error) {
        res.status(500).json({ error: error?.message || '获取会议列表失败' });
    }
});
// ============= 获取真实音频链接 =============
router.post("/api/meetings/audio-url", async (req, res) => {
    const { title, rowIndex } = req.body;
    if (rowIndex === undefined && !title)
        return res.status(400).json({ error: '需要 title 或 rowIndex' });
    try {
        const page = await ensureMeetingLogin();
        await page.waitForTimeout(500);
        let capturedUrl = '';
        const requestHandler = (request) => {
            const url = request.url();
            if (url.includes('gcdncs.101.com') && url.includes('download'))
                capturedUrl = url;
        };
        page.on('request', requestHandler);
        try {
            const idx = typeof rowIndex === 'number' ? rowIndex : 0;
            const downloadLink = page.locator('tr.fish-table-row').nth(idx).locator('a:has-text("下载音频")').first();
            if (await downloadLink.count() > 0) {
                const downloadPromise = page.waitForEvent('download', { timeout: 8000 }).catch(() => null);
                await downloadLink.click();
                const download = await downloadPromise;
                if (download)
                    await download.cancel().catch(() => { });
                await page.waitForTimeout(1000);
            }
        }
        finally {
            page.off('request', requestHandler);
        }
        if (capturedUrl)
            res.json({ success: true, audioUrl: capturedUrl });
        else
            res.json({ success: false, error: '未能捕获到下载链接' });
    }
    catch (error) {
        res.status(500).json({ error: error?.message || '获取音频链接失败' });
    }
});
// ============= 会议处理（真实音频下载、转写与纪要） =============
router.get("/api/meetings/download", async (req, res) => {
    const meetingId = String(req.query.meetingId || '').trim();
    const format = (String(req.query.format || 'audio') === 'video' ? 'video' : 'audio');
    if (!meetingId)
        return res.status(400).json({ success: false, error: 'missing meetingId' });
    try {
        const exts = ['mp3', 'm4a', 'wav', 'mp4'];
        let filePath = exts
            .map((ext) => path.join(MEETINGS_DATA_DIR, `${meetingId}_${format}.${ext}`))
            .find((candidate) => fs.existsSync(candidate));
        if (!filePath) {
            // 当前实例没有落盘文件（FN 多实例 /tmp 互不可见），取最新直链重新下载
            const records = await meetingService.fetchMeetingListWithToken();
            const record = records.find((item) => item.meetingId === meetingId);
            filePath = await meetingService.downloadMedia(meetingId, format, record?.audioUrl || record?.videoUrl);
        }
        if (!filePath || !fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, error: 'file not found' });
        }
        const stat = fs.statSync(filePath);
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Length', String(stat.size));
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(filePath))}`);
        res.setHeader('Cache-Control', 'no-store');
        fs.createReadStream(filePath).pipe(res);
    }
    catch (error) {
        return res.status(500).json({ success: false, error: error?.message || '下载失败' });
    }
});
router.get("/api/meetings/process/:jobId", async (req, res) => {
    const job = await loadMeetingProcessJob(req.params.jobId);
    if (!job)
        return res.status(404).json({ success: false, error: '转录任务不存在或服务已重启，请重新发起转录' });
    return res.json({ success: true, ...publicMeetingProcessJob(job) });
});
router.post("/api/meetings/process", async (req, res) => {
    const { meetingId, format = 'audio', title, startTime, transcribe, regenerate, forceRefresh, transcript: requestTranscript } = req.body;
    if (!meetingId)
        return res.status(400).json({ error: 'meetingId 不能为空' });
    try {
        const saved = regenerate ? await meetingService.getMeetingResultLatest({ title, startTime }) : null;
        const transcript = String(requestTranscript || saved?.transcript || '').trim();
        if (regenerate) {
            if (!transcript)
                throw new Error('没有可用于重新生成纪要的真实转写文本');
            const minutes = await generateMeetingMinutes(transcript, { title, startTime });
            await meetingService.persistMeetingResult({ meetingId, title, startTime, transcript, summary: minutes.summary, todos: minutes.todos });
            return res.json({ success: true, meetingId, transcript, ...minutes });
        }
        const records = await meetingService.fetchMeetingListWithToken();
        const record = records.find((item) => item.meetingId === meetingId);
        if (!record)
            throw new Error('未在真实会议列表中找到该录制文件，请刷新会议列表后重试');
        if (!transcribe) {
            await meetingService.downloadMedia(meetingId, format, record.audioUrl || record.videoUrl);
            return res.json({ success: true, meetingId, audioUrl: `/api/meetings/download?meetingId=${encodeURIComponent(meetingId)}&format=${encodeURIComponent(format)}` });
        }
        const now = new Date().toISOString();
        const job = {
            jobId: crypto.randomUUID(),
            meetingId,
            title: record.title || title,
            startTime: record.startTime || startTime,
            status: 'queued',
            createdAt: now,
            updatedAt: now,
        };
        await saveMeetingProcessJob(job);
        waitUntil(runMeetingProcessJob(job, record.audioUrl || record.videoUrl, { forceRefresh: Boolean(forceRefresh) }));
        return res.status(202).json({ success: true, accepted: true, ...publicMeetingProcessJob(job) });
    }
    catch (error) {
        return res.status(500).json({ success: false, error: error?.message || '处理失败' });
    }
});
// ============= 会议智能分析（行动、决策、风险与跟进） =============
function text(value) {
    return typeof value === 'string' ? value.trim() : '';
}
function rows(value) {
    return Array.isArray(value) ? value.filter((item) => Boolean(item) && typeof item === 'object') : [];
}
function normalizeLevel(value, fallback = 'medium') {
    const normalized = text(value).toLowerCase();
    return normalized === 'high' || normalized === 'low' || normalized === 'medium' ? normalized : fallback;
}
function normalizeMeetingIntelligence(value) {
    const source = value && typeof value === 'object' ? value : {};
    return {
        executive_summary: text(source.executive_summary),
        key_topics: Array.isArray(source.key_topics) ? source.key_topics.map(text).filter(Boolean).slice(0, 8) : [],
        decisions: rows(source.decisions).map((item) => ({
            content: text(item.content), owner: text(item.owner), impact: text(item.impact), evidence: text(item.evidence),
        })).filter((item) => item.content),
        action_items: rows(source.action_items).map((item) => ({
            task: text(item.task), owner: text(item.owner), due: text(item.due),
            priority: normalizeLevel(item.priority), evidence: text(item.evidence),
        })).filter((item) => item.task),
        risks: rows(source.risks).map((item) => ({
            description: text(item.description), severity: normalizeLevel(item.severity), impact: text(item.impact),
            mitigation: text(item.mitigation), owner: text(item.owner), trigger: text(item.trigger), evidence: text(item.evidence),
        })).filter((item) => item.description),
        blockers: rows(source.blockers).map((item) => ({
            description: text(item.description), owner: text(item.owner), suggestion: text(item.suggestion), evidence: text(item.evidence),
        })).filter((item) => item.description),
        open_questions: rows(source.open_questions).map((item) => ({
            question: text(item.question), owner: text(item.owner), needed_by: text(item.needed_by),
        })).filter((item) => item.question),
        dependencies: rows(source.dependencies).map((item) => ({
            item: text(item.item), owner: text(item.owner), status: text(item.status),
        })).filter((item) => item.item),
        sentiment: text(source.sentiment) || 'neutral',
        follow_up_needed: Boolean(source.follow_up_needed),
        next_meeting_suggestion: text(source.next_meeting_suggestion),
    };
}
async function generateAndPersistMeetingIntelligence(input) {
    const apiKey = process.env.MOONSHOT_API_KEY || process.env.OPENAI_API_KEY;
    const baseUrl = process.env.MOONSHOT_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.moonshot.cn/v1';
    const model = process.env.OPENAI_CHAT_MODEL || 'moonshot-v1-128k';
    if (!apiKey)
        throw new Error('未配置会议分析 API Key');
    const prompt = `你是一个资深项目管理专家和风险评估分析师。基于下面会议转录生成可执行且可追溯的 JSON 深度分析，不要输出 JSON 之外的内容。
{
  "executive_summary":"不超过150字的会议结论",
  "key_topics":["核心议题"],
  "decisions":[{"content":"决策","owner":"决策者","impact":"影响范围","evidence":"依据摘要"}],
  "action_items":[{"task":"具体行动","owner":"负责人","due":"截止时间","priority":"high/medium/low","evidence":"承诺依据"}],
  "risks":[{"description":"风险","severity":"high/medium/low","impact":"影响","mitigation":"应对","owner":"跟进人","trigger":"触发信号","evidence":"依据摘要"}],
  "blockers":[{"description":"阻塞项","owner":"相关人","suggestion":"解除阻塞的下一步","evidence":"依据摘要"}],
  "open_questions":[{"question":"未决问题","owner":"回答或推动人","needed_by":"明确时间"}],
  "dependencies":[{"item":"外部依赖或前置条件","owner":"依赖方","status":"已确认/待确认/有风险"}],
  "sentiment":"positive/negative/neutral/mixed",
  "follow_up_needed":true,
  "next_meeting_suggestion":"下次会议重点"
}
所有事实必须来自转录；无法确认的负责人、日期和决策留空，不要猜测。evidence 只能写简短依据摘要。`;
    const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
            // Kimi K2 models only accept the default temperature value.
            model, temperature: 1,
            messages: [
                { role: 'system', content: prompt },
                { role: 'user', content: `会议标题：${input.title || '未知'}\n会议时间：${input.startTime || '未知'}\n\n转录文本：\n${input.transcript}` },
            ],
        }),
    });
    if (!response.ok)
        throw new Error(`AI 错误: ${response.status} ${await response.text()}`);
    const body = await response.json();
    const content = text(body.choices?.[0]?.message?.content);
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch)
        throw new Error('会议分析服务未返回结构化结果');
    const result = normalizeMeetingIntelligence(JSON.parse(jsonMatch[0]));
    const now = new Date().toISOString();
    let saved = false;
    try {
        saved = await saveRemoteMeetingIntelligence({
            meetingId: input.meetingId,
            title: text(input.title),
            startTime: text(input.startTime),
            result,
            createdAt: now,
            updatedAt: now,
        });
    }
    catch (error) {
        console.error('保存远程分析结果失败:', error);
    }
    if (!saved) {
        saveMeetingIntelligence(input.meetingId, input.title || '', input.startTime || '', result);
        saved = true;
    }
    return { result, saved, updatedAt: now };
}
router.post("/api/meetings/intelligence", async (req, res) => {
    const { transcript, title, startTime, meetingId } = req.body;
    if (!transcript)
        return res.status(400).json({ error: "请提供会议转录文本" });
    const intelligenceMeetingId = text(meetingId) || text(title) || `meeting_${Date.now()}`;
    if (req.body.async === true) {
        const startedAt = new Date().toISOString();
        const job = {
            jobId: crypto.randomUUID(),
            meetingId: intelligenceMeetingId,
            status: 'queued',
            createdAt: startedAt,
            updatedAt: startedAt,
        };
        try {
            await saveMeetingIntelligenceJob(job);
        }
        catch (error) {
            return res.status(500).json({ success: false, error: error instanceof Error ? error.message : '无法创建会议分析任务' });
        }
        waitUntil((async () => {
            try {
                await saveMeetingIntelligenceJob({ ...job, status: 'analyzing', updatedAt: new Date().toISOString() });
                await generateAndPersistMeetingIntelligence({ meetingId: intelligenceMeetingId, title, startTime, transcript });
                await saveMeetingIntelligenceJob({ ...job, status: 'completed', updatedAt: new Date().toISOString() });
            }
            catch (error) {
                const message = error instanceof Error ? error.message : '会议深度分析失败';
                console.error(`[Meeting intelligence ${intelligenceMeetingId}]`, message);
                await saveMeetingIntelligenceJob({ ...job, status: 'failed', updatedAt: new Date().toISOString(), error: message }).catch(() => { });
            }
        })());
        return res.status(202).json({ success: true, accepted: true, jobId: job.jobId, meetingId: intelligenceMeetingId, startedAt });
    }
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    const send = (type, data = {}) => { res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`); }; // eslint-disable-next-line @typescript-eslint/no-explicit-any
    try {
        send('log', { message: '正在进行会议深度分析...' });
        const apiKey = process.env.MOONSHOT_API_KEY || process.env.OPENAI_API_KEY;
        const baseUrl = process.env.MOONSHOT_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.moonshot.cn/v1';
        const model = process.env.OPENAI_CHAT_MODEL || 'moonshot-v1-128k';
        if (!apiKey) {
            send('error', { message: '未配置 API Key' });
            return res.end();
        }
        const systemPrompt = `你是一个资深项目管理专家和风险评估分析师。用户会提供一段会议转录文本，请生成一份可执行、可追溯的会议深度分析。

请严格按以下 JSON 格式输出，不要输出 JSON 以外的内容：

{
  "executive_summary": "不超过 150 字的会议结论，说明达成了什么、还缺什么",
  "key_topics": ["讨论的核心议题"],
  "decisions": [
    { "content": "做出的决策内容", "owner": "决策者/拍板人", "impact": "影响范围", "evidence": "转录中的依据或发言摘要" }
  ],
  "action_items": [
    { "task": "具体行动项", "owner": "负责人", "due": "截止时间（如会议中提到）", "priority": "high/medium/low", "evidence": "转录中的依据或承诺" }
  ],
  "risks": [
    { "description": "识别到的风险", "severity": "high/medium/low", "impact": "可能的影响", "mitigation": "建议的应对措施", "owner": "跟进人", "trigger": "需要关注的触发信号", "evidence": "转录中的依据" }
  ],
  "blockers": [
    { "description": "阻塞项描述", "owner": "相关负责人", "suggestion": "解除阻塞的下一步", "evidence": "转录中的依据" }
  ],
  "open_questions": [
    { "question": "尚未解决的问题", "owner": "回答或推动的人", "needed_by": "需要在何时前明确" }
  ],
  "dependencies": [
    { "item": "外部依赖或前置条件", "owner": "依赖方", "status": "已确认/待确认/有风险" }
  ],
  "sentiment": "positive/negative/neutral/mixed",
  "follow_up_needed": true,
  "next_meeting_suggestion": "如需跟进，建议下次会议讨论的重点"
}

注意：
- 行动项要尽量具体，提取会议中明确提到的人名和时间
- 每一项只能基于转录中明确表达的信息；无法确认负责人、日期或决定时留空，不要猜测
- evidence 只能是简短的依据摘要，不要编造不存在的原话
- 如果某个字段在会议中没有涉及，可以返回空数组
- owner 字段尽量提取会议中提到的真实人名`;
        send('log', { message: 'AI 正在分析决策与风险...' });
        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
                // Kimi K2 models only accept the default temperature value.
                model, temperature: 1, stream: true,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: `会议标题：${title || '未知'}\n会议时间：${startTime || '未知'}\n\n转录文本：\n${transcript}` },
                ],
            }),
        });
        if (!response.ok) {
            const t = await response.text();
            send('error', { message: `AI 错误: ${response.status} ${t}` });
            return res.end();
        }
        let fullContent = '';
        const reader = response.body?.getReader();
        if (!reader) {
            send('error', { message: '响应流为空' });
            return res.end();
        }
        const decoder = new TextDecoder();
        let buf = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            buf += decoder.decode(value, { stream: true });
            const lines = buf.split('\n');
            buf = lines.pop() || '';
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith('data: '))
                    continue;
                const data = trimmed.slice(6);
                if (data === '[DONE]')
                    continue;
                try {
                    const parsed = JSON.parse(data);
                    const delta = parsed.choices?.[0]?.delta?.content;
                    if (delta) {
                        fullContent += delta;
                        send('chunk', { content: delta });
                    }
                }
                catch { /* skip */ }
            }
        }
        try {
            const jsonMatch = fullContent.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = normalizeMeetingIntelligence(JSON.parse(jsonMatch[0]));
                const now = new Date().toISOString();
                let saved = false;
                try {
                    saved = await saveRemoteMeetingIntelligence({
                        meetingId: intelligenceMeetingId,
                        title: text(title),
                        startTime: text(startTime),
                        result: parsed,
                        createdAt: now,
                        updatedAt: now,
                    });
                }
                catch (e) {
                    console.error('保存远程分析结果失败:', e);
                }
                if (!saved) {
                    try {
                        saveMeetingIntelligence(intelligenceMeetingId, title || '', startTime || '', parsed);
                        saved = true;
                    }
                    catch (e) {
                        console.error('保存本地分析结果失败:', e);
                    }
                }
                send('done', { result: parsed, saved });
            }
            else {
                send('done', { result: null, raw: fullContent });
            }
        }
        catch {
            send('done', { result: null, raw: fullContent });
        }
    }
    catch (error) {
        send('error', { message: error?.message || '分析失败' });
    } // eslint-disable-next-line @typescript-eslint/no-explicit-any
    finally {
        res.end();
    }
});
router.get("/api/meetings/intelligence/jobs/:jobId", async (req, res) => {
    try {
        const job = await loadMeetingIntelligenceJob(req.params.jobId);
        if (!job)
            return res.status(404).json({ success: false, error: '会议分析任务不存在' });
        return res.json({ success: true, job });
    }
    catch (error) {
        return res.status(500).json({ success: false, error: error?.message || '读取会议分析任务失败' });
    }
});
// ============= 获取已保存的会议智能分析 =============
router.get("/api/meetings/intelligence/:meetingId", async (req, res) => {
    try {
        const { meetingId } = req.params;
        const remote = await loadRemoteMeetingIntelligence(meetingId);
        if (remote) {
            res.json({ success: true, result: remote.result, created_at: remote.createdAt, updated_at: remote.updatedAt });
            return;
        }
        const row = getMeetingIntelligence(meetingId);
        if (row) {
            res.json({ success: true, result: JSON.parse(row.result), created_at: row.created_at, updated_at: row.updated_at });
        }
        else {
            res.json({ success: true, result: null });
        }
    }
    catch (error) {
        res.status(500).json({ error: error?.message || '获取分析结果失败' });
    }
});
// ============= 删除已保存的会议智能分析 =============
router.delete("/api/meetings/intelligence/:meetingId", async (req, res) => {
    try {
        const { meetingId } = req.params;
        await deleteRemoteMeetingIntelligence(meetingId);
        deleteMeetingIntelligence(meetingId);
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: error?.message || '删除分析结果失败' });
    }
});
export default router;
//# sourceMappingURL=meetings.js.map