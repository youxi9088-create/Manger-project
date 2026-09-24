import { Router } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { pushWorkflowOutput, getWorkflowOutputs, getWorkflowOutputById, deleteWorkflowOutput, upsertProjectInfoFile, getProjectInfoFiles, getProjectInfoFileByProid, deleteProjectInfoFile, syncKnowledgeBaseForProjectInfo, } from '../services/db.js';
import { loadWorkflowJob, saveWorkflowJob } from '../services/workflow-job-store.js';
import { waitUntil } from '../utils/fn-functions.js';
/* ─── AI-Hub 工作流配置 ───
 * 参考 project-info-analysis skill：
 *   - examples/_appids.ps1   AppId 注册表（唯一存放 UUID 的地方）
 *   - examples/_common.ps1   共享调用函数
 * 调用规范：代码里只使用能力别名，UUID 统一从下方注册表解析。
 * BaseUrl: https://bv.new.ndhy.com/api/agent/aihub
 * Auth:   Authorization: Bearer $env:AIHUB_AGENT_TOKEN
 * Run:    POST /workflows/run      { appId, inputs, meta? }
 * Status: GET  /workflows/runs/:id
 * Output: GET  /workflows/runs/:id/outputs
 */
const AIHUB_BASE_URL = process.env.AIHUB_BASE_URL || 'https://bv.new.ndhy.com/api/agent/aihub';
const AIHUB_AGENT_TOKEN = process.env.AIHUB_AGENT_TOKEN || '';
// AppId 注册表（与 skills/project-info-analysis/examples/_appids.ps1 保持一致）
const AIHUB_APP_IDS = {
    'project-info': 'eee4cd05-ded3-4794-84e2-73d2494a5dc6',
};
function getAIHubAppId(alias) {
    const id = AIHUB_APP_IDS[alias];
    if (!id) {
        const known = Object.keys(AIHUB_APP_IDS).join(', ');
        throw new Error(`Unknown AIHub app alias: ${alias}. Known aliases: ${known}`);
    }
    return id;
}
const AIHUB_APP_ALIAS = 'project-info';
const AIHUB_APP_ID = process.env.AIHUB_APP_ID || getAIHubAppId(AIHUB_APP_ALIAS);
/* ─── LLM 分析配置 ───
 * 优先使用 Moonshot 官方 API（Kimi），也可通过 OPENAI_BASE_URL 配置兼容端点
 */
const MOONSHOT_BASE_URL = process.env.MOONSHOT_BASE_URL || 'https://api.moonshot.cn/v1';
const MOONSHOT_API_KEY = process.env.MOONSHOT_API_KEY || '';
const LLM_BASE_URL = process.env.OPENAI_BASE_URL || MOONSHOT_BASE_URL;
const LLM_API_KEY = process.env.OPENAI_API_KEY || MOONSHOT_API_KEY || '';
const LLM_MODEL = process.env.OPENAI_CHAT_MODEL || process.env.MOONSHOT_MODEL || 'moonshot-v1-128k';
const router = Router();
const recoveringWorkflowJobs = new Set();
/* ─── 本地文件中转目录 ─── */
const WORKFLOW_INBOX_DIR = path.resolve(process.cwd(), '..', '..', 'data', 'workflow-inbox');
if (!fs.existsSync(WORKFLOW_INBOX_DIR)) {
    fs.mkdirSync(WORKFLOW_INBOX_DIR, { recursive: true });
}
/* ─── POST /api/workflow/push ─── 接收工作流输出 */
router.post('/api/workflow/push', (req, res) => {
    try {
        const { source, content, type = 'text', title, metadata } = req.body || {};
        if (!source || typeof source !== 'string') {
            res.status(400).json({ error: '缺少 source 字段' });
            return;
        }
        if (!content || typeof content !== 'string') {
            res.status(400).json({ error: '缺少 content 字段' });
            return;
        }
        const validTypes = ['text', 'json', 'markdown', 'html'];
        const finalType = validTypes.includes(type) ? type : 'text';
        const record = pushWorkflowOutput(source, content, finalType, title, metadata);
        if (!record) {
            res.status(500).json({ error: '保存失败' });
            return;
        }
        res.json({ success: true, data: record });
    }
    catch (e) {
        res.status(500).json({ error: e?.message || '推送失败' });
    }
});
/* ─── GET /api/workflow/outputs ─── 查询工作流输出 */
router.get('/api/workflow/outputs', (req, res) => {
    try {
        const { source, limit = '20', since } = req.query;
        const records = getWorkflowOutputs({
            source: source ? String(source) : undefined,
            limit: Number(limit),
            since: since ? String(since) : undefined,
        });
        res.json({ success: true, data: records, count: records.length });
    }
    catch (e) {
        res.status(500).json({ error: e?.message || '查询失败' });
    }
});
/* ─── GET /api/workflow/outputs/:id ─── 单条详情 */
router.get('/api/workflow/outputs/:id', (req, res) => {
    try {
        const id = Number(req.params.id);
        if (isNaN(id)) {
            res.status(400).json({ error: '无效的 ID' });
            return;
        }
        const record = getWorkflowOutputById(id);
        if (!record) {
            res.status(404).json({ error: '记录不存在' });
            return;
        }
        res.json({ success: true, data: record });
    }
    catch (e) {
        res.status(500).json({ error: e?.message || '查询失败' });
    }
});
/* ─── DELETE /api/workflow/outputs/:id ─── 删除 */
router.delete('/api/workflow/outputs/:id', (req, res) => {
    try {
        const id = Number(req.params.id);
        if (isNaN(id)) {
            res.status(400).json({ error: '无效的 ID' });
            return;
        }
        const ok = deleteWorkflowOutput(id);
        if (!ok) {
            res.status(404).json({ error: '记录不存在' });
            return;
        }
        res.json({ success: true, message: '删除成功' });
    }
    catch (e) {
        res.status(500).json({ error: e?.message || '删除失败' });
    }
});
/* ─── POST /api/workflow/push-file ─── 文件方式：工作流写入文件，后端读取 ─── */
router.post('/api/workflow/push-file', (req, res) => {
    try {
        const { filename, content, source = 'file-inbox', type = 'text', title } = req.body || {};
        if (!filename || !content) {
            res.status(400).json({ error: '缺少 filename 或 content' });
            return;
        }
        // 安全检查：只允许 .json 文件
        if (!filename.endsWith('.json')) {
            res.status(400).json({ error: '只允许 .json 文件' });
            return;
        }
        const safeName = filename.replace(/[^a-zA-Z0-9_.-]/g, '_');
        const filePath = path.join(WORKFLOW_INBOX_DIR, safeName);
        fs.writeFileSync(filePath, content, 'utf-8');
        // 同时存入数据库
        const record = pushWorkflowOutput(source, content, type, title || safeName, { from_file: safeName });
        res.json({ success: true, data: { saved_to: filePath, db_record: record } });
    }
    catch (e) {
        res.status(500).json({ error: e?.message || '保存失败' });
    }
});
/* ─── GET /api/workflow/inbox ─── 读取文件中转目录中的文件列表 ─── */
router.get('/api/workflow/inbox', (req, res) => {
    try {
        const files = fs.readdirSync(WORKFLOW_INBOX_DIR)
            .filter(f => f.endsWith('.json'))
            .map(f => {
            const stat = fs.statSync(path.join(WORKFLOW_INBOX_DIR, f));
            return {
                filename: f,
                size: stat.size,
                modified: stat.mtime.toISOString(),
            };
        })
            .sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());
        res.json({ success: true, data: files });
    }
    catch (e) {
        res.status(500).json({ error: e?.message || '读取失败' });
    }
});
/* ─── GET /api/workflow/inbox/:filename ─── 读取单个文件内容 ─── */
router.get('/api/workflow/inbox/:filename', (req, res) => {
    try {
        const safeName = req.params.filename.replace(/[^a-zA-Z0-9_.-]/g, '_');
        const filePath = path.join(WORKFLOW_INBOX_DIR, safeName);
        if (!fs.existsSync(filePath)) {
            res.status(404).json({ error: '文件不存在' });
            return;
        }
        const content = fs.readFileSync(filePath, 'utf-8');
        res.json({ success: true, data: { filename: safeName, content } });
    }
    catch (e) {
        res.status(500).json({ error: e?.message || '读取失败' });
    }
});
/* ─── GET /api/workflow/project-info ─── 查询项目信息聚合列表 */
router.get('/api/workflow/project-info', (req, res) => {
    try {
        const { proid, limit = '50' } = req.query;
        const records = getProjectInfoFiles({
            proid: proid ? String(proid) : undefined,
            limit: Number(limit),
        });
        res.json({ success: true, data: records, count: records.length });
    }
    catch (e) {
        res.status(500).json({ error: e?.message || '查询失败' });
    }
});
/* ─── GET /api/workflow/project-info/:proid ─── 单个项目信息详情 */
router.get('/api/workflow/project-info/:proid', (req, res) => {
    try {
        const proid = req.params.proid;
        const record = getProjectInfoFileByProid(proid);
        if (!record) {
            res.status(404).json({ error: '项目信息不存在' });
            return;
        }
        res.json({ success: true, data: record });
    }
    catch (e) {
        res.status(500).json({ error: e?.message || '查询失败' });
    }
});
/* ─── DELETE /api/workflow/project-info/:proid ─── 删除项目信息 */
router.delete('/api/workflow/project-info/:proid', (req, res) => {
    try {
        const proid = req.params.proid;
        const ok = deleteProjectInfoFile(proid);
        if (!ok) {
            res.status(404).json({ error: '项目信息不存在' });
            return;
        }
        res.json({ success: true, message: '删除成功' });
    }
    catch (e) {
        res.status(500).json({ error: e?.message || '删除失败' });
    }
});
/* ─── 轮询等待 AI-Hub Run 完成 ─── */
async function pollAIHubRun(runId, token) {
    const maxWaitMs = 600_000; // 10 分钟，真实项目数据量较大时需要更长时间
    const intervalMs = 3_000;
    const start = Date.now();
    const headers = { 'Authorization': `Bearer ${token}` };
    while (Date.now() - start < maxWaitMs) {
        const resp = await fetch(`${AIHUB_BASE_URL}/workflows/runs/${runId}`, { headers });
        const json = await resp.json().catch(() => ({}));
        const status = json.status;
        if (status === 'succeeded' || status === 'failed') {
            return json;
        }
        await new Promise(r => setTimeout(r, intervalMs));
    }
    throw new Error(`工作流执行超时（>${Math.round(maxWaitMs / 1000)}s）`);
}
async function finishWorkflowRun(params) {
    const statusJson = await pollAIHubRun(params.runId, AIHUB_AGENT_TOKEN);
    if (statusJson.status === 'failed') {
        const reason = statusJson.error?.message || statusJson.aiHubError?.message || statusJson.lastPollError || JSON.stringify(statusJson);
        throw new Error(`工作流执行失败: ${reason}`);
    }
    const outputsResp = await fetch(`${AIHUB_BASE_URL}/workflows/runs/${params.runId}/outputs`, { headers: params.headers });
    const outputsJson = await outputsResp.json().catch(() => ({}));
    if (!outputsResp.ok)
        throw new Error(`获取工作流输出失败: HTTP ${outputsResp.status}`);
    const innerOutputs = getInnerOutputs(outputsJson);
    const llmReport = typeof innerOutputs.llm === 'string' ? innerOutputs.llm : '';
    const todoText = typeof innerOutputs.zxzdb === 'string' ? innerOutputs.zxzdb : '';
    const rawAnswer = (llmReport ? llmReport : '')
        + (todoText ? '\n\n---\n\n## 执行中待办\n\n' + todoText : '')
        || outputsJson?.text || outputsJson?.answer || JSON.stringify(outputsJson, null, 2);
    const structuredData = normalizeWorkflowStructuredData(extractWorkflowStructuredData(outputsJson));
    const historyTitle = `工作流结果 proid=${params.proid}`;
    try {
        pushWorkflowOutput('ai-hub-workflow', rawAnswer, 'markdown', historyTitle, {
            proid: params.proid, ask: params.ask, workflow_run_id: params.runId,
        });
    }
    catch (error) {
        console.warn('[workflow/run] 历史记录存库失败（不影响返回）:', error);
    }
    const { analyzed, structuredData: llmStructuredData, usedLLM, error: llmError } = params.skipLLM
        ? { analyzed: rawAnswer, structuredData, usedLLM: false, error: 'recovered_without_llm' }
        : await analyzeProjectInfoWithLLM({ proid: params.proid, ask: params.ask, rawAnswer, structuredData });
    const finalStructuredData = normalizeWorkflowStructuredData(llmStructuredData);
    const title = `项目信息 proid=${params.proid}`;
    try {
        upsertProjectInfoFile({
            proid: params.proid, title, content: analyzed, raw_content: rawAnswer, ask: params.ask,
            workflow_run_id: params.runId,
            metadata: {
                analyzed_by_llm: usedLLM, llm_error: llmError || undefined,
                llm_model: usedLLM ? LLM_MODEL : undefined, structured_data: finalStructuredData,
                todo_list_text: todoText || undefined,
            },
        });
    }
    catch (error) {
        console.warn('[workflow/run] 项目信息存库失败（不影响返回）:', error);
    }
    try {
        syncKnowledgeBaseForProjectInfo(params.proid, analyzed, finalStructuredData, todoText || undefined);
    }
    catch (error) {
        console.warn('[workflow/run] 知识库同步失败（不影响返回）:', error);
    }
    return {
        answer: analyzed, title, proid: params.proid, workflow_run_id: params.runId,
        analyzed_by_llm: usedLLM, llm_error: llmError,
        structured_data: finalStructuredData,
        raw: { run: params.runJson, status: statusJson, outputs: outputsJson },
    };
}
function buildWorkflowJobResult(result) {
    // FN Mongo has a request-size ceiling. Keep the polling record renderable;
    // the full workflow data is already persisted through the normal paths.
    return {
        answer: truncateUtf8(result.answer, 12 * 1024),
        title: result.title,
        proid: result.proid,
        workflow_run_id: result.workflow_run_id,
        analyzed_by_llm: result.analyzed_by_llm,
        llm_error: result.llm_error,
    };
}
async function recoverWorkflowJob(job) {
    if (job.status !== 'running' || recoveringWorkflowJobs.has(job.jobId))
        return job;
    recoveringWorkflowJobs.add(job.jobId);
    try {
        const statusResp = await fetch(`${AIHUB_BASE_URL}/workflows/runs/${job.workflowRunId}`, {
            headers: { 'Authorization': `Bearer ${AIHUB_AGENT_TOKEN}` },
        });
        const statusJson = await statusResp.json().catch(() => ({}));
        if (statusJson.status === 'failed') {
            const message = statusJson.error?.message || statusJson.aiHubError?.message || statusJson.lastPollError || 'AIHub 工作流失败';
            const failed = { ...job, status: 'failed', updatedAt: new Date().toISOString(), error: message };
            await saveWorkflowJob(failed);
            return failed;
        }
        if (statusJson.status !== 'succeeded')
            return job;
        const result = await finishWorkflowRun({
            proid: job.proid,
            ask: job.ask || '',
            runId: job.workflowRunId,
            runJson: { runId: job.workflowRunId },
            headers: {
                'Authorization': `Bearer ${AIHUB_AGENT_TOKEN}`,
                'Content-Type': 'application/json',
            },
            skipLLM: true,
        });
        const completed = {
            ...job,
            status: 'completed',
            updatedAt: new Date().toISOString(),
            result: buildWorkflowJobResult(result),
            error: undefined,
        };
        await saveWorkflowJob(completed);
        return completed;
    }
    catch (error) {
        const message = error?.message || '工作流结果回写失败';
        console.error(`[workflow/recover ${job.jobId}]`, message);
        const failed = { ...job, status: 'failed', updatedAt: new Date().toISOString(), error: message };
        await saveWorkflowJob(failed).catch(() => { });
        return failed;
    }
    finally {
        recoveringWorkflowJobs.delete(job.jobId);
    }
}
function truncateUtf8(value, maxBytes) {
    if (new TextEncoder().encode(value).byteLength <= maxBytes)
        return value;
    const suffix = '\n\n[结果过长，已在任务状态中截断]';
    const suffixBytes = new TextEncoder().encode(suffix).byteLength;
    let usedBytes = 0;
    let result = '';
    for (const character of value) {
        const characterBytes = new TextEncoder().encode(character).byteLength;
        if (usedBytes + characterBytes + suffixBytes > maxBytes)
            break;
        result += character;
        usedBytes += characterBytes;
    }
    return `${result}${suffix}`;
}
/* ─── 获取 AIHub 原始输出的内层 outputs 对象 ─── */
function getInnerOutputs(outputsJson) {
    let outputs = outputsJson?.outputs;
    if (outputs?.data?.outputs && typeof outputs.data.outputs === 'object') {
        outputs = outputs.data.outputs;
    }
    else if (outputsJson?.data?.outputs && typeof outputsJson.data.outputs === 'object') {
        outputs = outputsJson.data.outputs;
    }
    else if (!outputs) {
        outputs = outputsJson;
    }
    return outputs && typeof outputs === 'object' ? outputs : {};
}
/* ─── 从 AIHub 原始输出中提取结构化 JSON 数据 ───
 * AIHub 常见输出结构：{ outputs: { data: { outputs: { llm, zxzdb, mbyh, cb, zh, zbb } } } }
 */
function extractWorkflowStructuredData(outputsJson) {
    const result = {};
    const outputs = getInnerOutputs(outputsJson);
    if (!outputs)
        return result;
    // 保留文本类内容：llm 是分析报告，zxzdb 是执行中待办
    if (typeof outputs.llm === 'string') {
        result.llm_report = outputs.llm;
    }
    if (typeof outputs.zxzdb === 'string') {
        result.todo_list_text = outputs.zxzdb;
    }
    for (const [key, value] of Object.entries(outputs)) {
        // llm / zxzdb 已在上方单独保留为文本
        if (key === 'llm' || key === 'zxzdb')
            continue;
        if (Array.isArray(value) && value.length > 0) {
            const first = value[0];
            if (first && typeof first === 'object') {
                // 把数组元素中的模块字段合并到顶层结果
                for (const item of value) {
                    if (!item || typeof item !== 'object')
                        continue;
                    for (const [k, v] of Object.entries(item)) {
                        if (k === 'status_code' || k === 'code' || k === 'msg' || k === 'message')
                            continue;
                        if (v === undefined || v === null)
                            continue;
                        try {
                            result[k] = typeof v === 'string' ? JSON.parse(v) : v;
                        }
                        catch {
                            result[k] = v;
                        }
                    }
                }
            }
            else {
                result[key] = value;
            }
        }
        else if (value && typeof value === 'object') {
            for (const [k, v] of Object.entries(value)) {
                if (k === 'status_code' || k === 'code' || k === 'msg' || k === 'message')
                    continue;
                try {
                    result[k] = typeof v === 'string' ? JSON.parse(v) : v;
                }
                catch {
                    result[k] = v;
                }
            }
        }
        else if (typeof value === 'string') {
            try {
                const parsed = JSON.parse(value);
                if (parsed && typeof parsed === 'object') {
                    result[key] = parsed;
                }
                else {
                    result[key] = value;
                }
            }
            catch {
                result[key] = value;
            }
        }
        else {
            result[key] = value;
        }
    }
    return result;
}
/* ─── 解包 { obj / items } 包装结构 ─── */
function unwrapValue(v) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
        if (v.obj !== undefined)
            return v.obj;
        if (v.items !== undefined)
            return v.items;
    }
    return v;
}
/* ─── 深度解包 AIHub { field: JSON字符串, status_code: 200 } 包装 ─── */
function deepUnwrap(v) {
    if (typeof v === 'string') {
        const trimmed = v.trim();
        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
            try {
                return deepUnwrap(JSON.parse(trimmed));
            }
            catch {
                return v;
            }
        }
        return v;
    }
    if (Array.isArray(v))
        return v.map(deepUnwrap);
    if (v && typeof v === 'object') {
        const keys = Object.keys(v);
        // AIHub 常见包装：{ field: <JSON字符串>, status_code: 200 }
        if (keys.includes('status_code')) {
            const valueKey = keys.find(k => !['status_code', 'code', 'msg', 'message'].includes(k));
            if (valueKey !== undefined)
                return deepUnwrap(v[valueKey]);
        }
        return v;
    }
    return v;
}
/* ─── 将 AIHub 字段名映射为前端标准字段名 ─── */
function normalizeWorkflowStructuredData(sd) {
    // 部分 AIHub 工作流输出使用中文字段名，先映射为标准英文字段名
    const CN_KEY_MAP = {
        mbyh: 'goal_users', // 目标用户
        zbb: 'weekly_versions', // 周版本/周报
        jdmb: 'stage_objectives', // 阶段目标
        cb: 'budget', // 成本/预算
        hxjz: 'core_values', // 核心价值
        zh: 'core_values', // 综合价值
        ydgh: 'monthly_plan', // 月度计划
    };
    const mappedSd = { ...sd };
    for (const [cnKey, enKey] of Object.entries(CN_KEY_MAP)) {
        if (mappedSd[cnKey] !== undefined && mappedSd[enKey] === undefined) {
            mappedSd[enKey] = mappedSd[cnKey];
        }
    }
    const norm = { ...mappedSd };
    // project_profile：解包 { obj: {...} } 并映射字段名
    const rawProfile = unwrapValue(mappedSd.project_profile);
    if (rawProfile && typeof rawProfile === 'object') {
        norm.project_profile = {
            name: rawProfile.name,
            code: rawProfile.code,
            project_id: rawProfile.project_id,
            status_name: rawProfile.status_name,
            lifecycle_phase_name: rawProfile.lifecycle_phase_name,
            plan_finish_date: rawProfile.plan_finish_date,
            manage_vp: rawProfile.manage_vp,
            manage_vp_uid: rawProfile.manage_vp_uid,
            importance: rawProfile.importance,
        };
    }
    // 解包 AIHub 常见的 { field: <JSON string> } 或 { field: { items: [...] } } 结构
    function extractItems(v, fieldName) {
        const unwrapped = deepUnwrap(v);
        const collect = (val) => {
            if (Array.isArray(val)) {
                // 如果数组元素仍是包装对象（含 items 或对应字段），则继续展开
                if (val.every(item => item && typeof item === 'object' && !Array.isArray(item))) {
                    const allWrappers = val.every(item => Array.isArray(item.items) ||
                        Array.isArray(item[fieldName]) ||
                        (typeof item[fieldName] === 'string' && /^[\[{]/.test(item[fieldName].trim())));
                    if (allWrappers)
                        return val.flatMap(collect);
                }
                return val;
            }
            if (val && typeof val === 'object') {
                if (Array.isArray(val.items))
                    return val.items;
                if (Array.isArray(val[fieldName]))
                    return val[fieldName];
                if (typeof val[fieldName] === 'string') {
                    try {
                        return collect(JSON.parse(val[fieldName]));
                    }
                    catch {
                        return [];
                    }
                }
            }
            return [];
        };
        return collect(unwrapped);
    }
    // goal_users
    const goalUsers = extractItems(mappedSd.goal_users, 'goal_users');
    if (goalUsers.length > 0) {
        norm.goal_users = goalUsers.map((u) => ({
            type: u.goal_users || u.type || '',
            desc: u.goal_user_desc || u.desc || '',
            attributes: Array.isArray(u.goal_user_attributes)
                ? u.goal_user_attributes.map((a) => ({
                    name: a.attribute_type || a.name || '',
                    desc: a.attribute_explain || a.attribute_desc || a.desc || '',
                    inspiration: a.attribute_desc || a.inspiration || '',
                }))
                : [],
        }));
    }
    // weekly_versions
    const weeklyVersions = extractItems(mappedSd.weekly_versions, 'weekly_versions');
    if (weeklyVersions.length > 0) {
        norm.weekly_versions = weeklyVersions.map((w) => ({
            time: w.time || w.week || '',
            plan: w.planIntroduction || w.plan || w.monthPlan || '',
            importance: w.importance || '',
            progress: w.progress || '0%',
            completion: w.completionOfProject || w.completion || '',
        }));
    }
    // stage_objectives：统一字段名（chooseVersion -> version、status -> check_status 等）
    if (mappedSd.stage_objectives && typeof mappedSd.stage_objectives === 'object') {
        const rawSo = deepUnwrap(mappedSd.stage_objectives);
        const normalizeStageItem = (s) => ({
            name: s.name || '',
            target: s.target || '',
            important: s.important || '',
            progress: s.progress || '0%',
            version: s.version || s.chooseVersion || '',
            check_status: s.check_status || s.status || '',
            status: s.status || '',
        });
        if (Array.isArray(rawSo)) {
            norm.stage_objectives = rawSo.map(normalizeStageItem);
        }
        else if (rawSo && typeof rawSo === 'object') {
            norm.stage_objectives = {
                average: rawSo.average || '',
                delay_rate: rawSo.delay_rate || '',
                now_rate: rawSo.now_rate || '',
                items: Array.isArray(rawSo.items) ? rawSo.items.map(normalizeStageItem) : [],
            };
        }
    }
    // monthly_plan
    const monthlyPlan = extractItems(mappedSd.monthly_plan, 'monthly_plan');
    if (monthlyPlan.length > 0) {
        norm.monthly_plan = monthlyPlan.map((m) => ({
            month: m.month || m.month_plan || m.monthPlan || '',
            plan: m.plan || m.plan_content || m.content || m.monthPlan || '',
            progress: m.progress || m.finish_progress || m.finishProgress || m.percent || m.effect_precent || '',
        }));
    }
    // budget：解包 { year_cost_budget: "{budget_cost_situation: ...}", status_code: 200 }
    if (mappedSd.budget && typeof mappedSd.budget === 'object') {
        const rawBudget = deepUnwrap(mappedSd.budget);
        if (typeof rawBudget === 'string') {
            norm.budget = rawBudget;
        }
        else if (rawBudget && typeof rawBudget === 'object') {
            norm.budget = rawBudget.budget_cost_situation || rawBudget.budget || rawBudget.cost || JSON.stringify(rawBudget);
        }
    }
    // core_values：支持 { core_values: { items: [{ core_value_detail_list: [...] }] } }
    const coreValuesRaw = extractItems(mappedSd.core_values, 'core_values');
    if (coreValuesRaw.length > 0) {
        norm.core_values = coreValuesRaw.flatMap((item) => {
            const details = item.core_value_detail_list || item.details || item.items || [];
            if (Array.isArray(details) && details.length > 0) {
                return details.map((d) => ({
                    stakeholder: d.stakeholder || '',
                    value: d.value || '',
                    progress: d.value_completed_progress !== undefined ? String(d.value_completed_progress) : (d.progress || ''),
                }));
            }
            return [{
                    stakeholder: item.stakeholder || '',
                    value: item.value || '',
                    progress: item.progress || '',
                }];
        });
    }
    return norm;
}
/* ─── 调用 LLM 对原始工作流输出进行二次分析 ───
 * 输出格式：先 Markdown 报告，最后紧跟一个 JSON 代码块（summary.json 结构）
 */
async function analyzeProjectInfoWithLLM(params) {
    const { proid, ask, rawAnswer, structuredData = {}, baseUrl = LLM_BASE_URL, apiKey = LLM_API_KEY } = params;
    if (!apiKey) {
        return { analyzed: rawAnswer, structuredData, usedLLM: false, error: '未配置 LLM API Key，直接返回原始输出' };
    }
    const systemPrompt = `你是一位项目信息分析专家。我会给你一份从 AIHub 工作流返回的项目原始数据，包含：
- project_profile、goal_users、year_cost_budget、weekly_versions 等结构化 JSON
- 部分字段可能以中文缩写返回：mbyh（目标用户）、zbb（周版本/周报）、jdmb（阶段目标）、cb（成本/预算）、hxjz（核心价值）、zh（综合价值）、ydgh（月度计划）
- 系统已生成的大模型分析报告（llm）
- 执行中的待办列表（zxzdb）

请完成两个任务：

1. 按以下结构输出一份 Markdown 项目综合分析报告（参考 project_01/0624.md 风格）。其中必须包含「执行中待办」章节，总结当前关键待办、负责人/截止信息（如原始数据中有）、以及待办反映出的项目推进重点或风险：
### 一、项目概览
| 维度 | 关键信息 |
|------|---------|
| 项目代码 | ... |
| 项目名称 | ... |
| 项目性质 | ... |
| 当前状态 | ... |
| 负责人 | ... |
| 计划完成 | ... |
| 当前预算 | ... |

核心诉求：...

### 二、目标用户与价值定位
### 三、核心价值与当前进度
### 四、阶段目标与里程碑进展
### 五、月度计划执行跟踪
### 六、周版本关键风险与阻塞点
### 七、综合评估与建议

2. 在 Markdown 末尾，输出一个 JSON 代码块（用于更新知识库 summary.json），结构如下：
{
  "project_profile": {
    "name": "项目名称",
    "code": "项目代码",
    "project_id": "项目ID",
    "status_name": "状态名称如 正常/预警/风险",
    "lifecycle_phase_name": "生命周期阶段",
    "plan_finish_date": "计划完成日期",
    "manage_vp": "分管VP",
    "manage_vp_uid": "VP UID",
    "importance": 3,
    "summary": "项目摘要，300字以内"
  },
  "core_values": [{ "stakeholder": "干系方", "value": "价值承诺", "progress": "当前进度" }],
  "goal_users": [{ "type": "用户类型", "desc": "描述", "attributes": [{ "name": "属性名", "desc": "描述", "inspiration": "设计启示" }] }],
  "stage_objectives": { "average": "平均进度", "delay_rate": "延期率", "now_rate": "当前进度", "items": [{ "target": "目标", "progress": "进度", "version": "版本", "check_status": "状态" }] },  // 必须输出
  "weekly_versions": [{ "time": "时间", "plan": "计划", "progress": "进度", "completion": "完成情况" }],
  "monthly_plan": [{ "month": "月份", "plan": "计划", "progress": "进度" }],
  "budget": "预算文本"
}

规则：
- 严格使用原始数据中已有的字段，不要编造不存在的信息
- 日期格式：YYYY-MM-DDTHH:mm:ss.000+0800
- 进度使用字符串，如 "91.67%"
- stage_objectives 是必填字段，不要省略。即使当前没有具体阶段目标，也返回 {"average":"","delay_rate":"","now_rate":"","items":[]}；只要有阶段目标/里程碑/版本计划/进度节点信息，items 必须填充 target 和 progress
- 其他模块如果原始数据中不存在，可以省略，不要返回空数组或占位符
- JSON 必须是合法 JSON，键名使用英文双引号
- 输出顺序：先 Markdown 报告，最后 JSON 代码块，中间不要插入其他内容
- 不要省略 JSON 代码块，这是必须的输出`;
    const userPrompt = `项目ID：${proid}

用户问题：${ask}

结构化原始数据（JSON）：
${JSON.stringify(structuredData, null, 2).slice(0, 12000)}

系统已生成的分析文本：
${typeof rawAnswer === 'string' ? rawAnswer.slice(0, 4000) : JSON.stringify(rawAnswer).slice(0, 4000)}`;
    try {
        const resp = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: LLM_MODEL,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
                temperature: 0.2,
            }),
        });
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok) {
            const errMsg = json?.error?.message || json?.message || `LLM 请求失败 ${resp.status}`;
            console.warn('[workflow/analyze] LLM 请求失败:', errMsg);
            // 如果当前不是 Moonshot 官方 API，尝试回退
            if (baseUrl !== MOONSHOT_BASE_URL && MOONSHOT_API_KEY) {
                console.log('[workflow/analyze] 回退到 Moonshot 官方 API...');
                return analyzeProjectInfoWithLLM({ proid, ask, rawAnswer, structuredData, baseUrl: MOONSHOT_BASE_URL, apiKey: MOONSHOT_API_KEY });
            }
            return { analyzed: rawAnswer, structuredData, usedLLM: false, error: errMsg };
        }
        const content = json.choices?.[0]?.message?.content;
        if (!content || typeof content !== 'string') {
            return { analyzed: rawAnswer, structuredData, usedLLM: false, error: 'LLM 返回为空' };
        }
        // 分离 Markdown 和 JSON
        const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```\s*$/);
        let analyzed = content;
        let extractedSummary = {};
        if (jsonMatch) {
            analyzed = content.slice(0, content.lastIndexOf('```json')).trim();
            try {
                extractedSummary = JSON.parse(jsonMatch[1]);
            }
            catch (e) {
                console.warn('[workflow/analyze] JSON 解析失败:', e?.message);
            }
        }
        // 合并 LLM 生成的 summary 和原始结构化数据
        const finalStructuredData = { ...structuredData, ...extractedSummary };
        return { analyzed, structuredData: finalStructuredData, usedLLM: true };
    }
    catch (e) {
        console.warn('[workflow/analyze] LLM 调用异常:', e?.message);
        // 网络异常时同样回退到 Moonshot 官方 API
        if (baseUrl !== MOONSHOT_BASE_URL && MOONSHOT_API_KEY) {
            console.log('[workflow/analyze] 回退到 Moonshot 官方 API...');
            return analyzeProjectInfoWithLLM({ proid, ask, rawAnswer, structuredData, baseUrl: MOONSHOT_BASE_URL, apiKey: MOONSHOT_API_KEY });
        }
        return { analyzed: rawAnswer, structuredData, usedLLM: false, error: e?.message };
    }
}
/* ─── POST /api/workflow/run ─── 主动触发 AI-Hub 工作流 ─── */
router.post('/api/workflow/run', async (req, res) => {
    try {
        const { proid, extra_inputs } = req.body || {};
        const ask = extra_inputs?.ask || '';
        if (!proid || typeof proid !== 'string' || !proid.trim()) {
            res.status(400).json({ success: false, error: '缺少 proid 参数' });
            return;
        }
        if (!AIHUB_AGENT_TOKEN) {
            res.status(400).json({
                success: false,
                error: '后端未配置 AIHUB_AGENT_TOKEN，请在 .env 中设置后重启服务',
            });
            return;
        }
        const inputs = { proid: proid.trim() };
        if (extra_inputs && typeof extra_inputs === 'object') {
            Object.assign(inputs, extra_inputs);
        }
        const headers = {
            'Authorization': `Bearer ${AIHUB_AGENT_TOKEN}`,
            'Content-Type': 'application/json',
        };
        console.log(`[workflow/run] 触发 AI-Hub 工作流 appId=${AIHUB_APP_ID} proid=${proid} ask=${ask}`);
        /* ── 1. 启动 run ── */
        const runResp = await fetch(`${AIHUB_BASE_URL}/workflows/run`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                appId: AIHUB_APP_ID,
                inputs,
                meta: { source: 'openclaw' },
            }),
        });
        const runJson = await runResp.json().catch(() => ({}));
        if (!runResp.ok) {
            console.warn(`[workflow/run] 启动失败 ${runResp.status}:`, JSON.stringify(runJson).slice(0, 300));
            res.status(runResp.status).json({
                success: false,
                error: runJson?.message || runJson?.msg || `AI-Hub 启动工作流失败 ${runResp.status}`,
                detail: runJson,
            });
            return;
        }
        const runId = runJson.runId;
        if (!runId) {
            res.status(502).json({ success: false, error: 'AI-Hub 未返回 runId', detail: runJson });
            return;
        }
        if (req.body?.async === true) {
            const now = new Date().toISOString();
            const job = {
                jobId: crypto.randomUUID(),
                proid: proid.trim(),
                ask,
                workflowRunId: runId,
                status: 'queued',
                createdAt: now,
                updatedAt: now,
            };
            await saveWorkflowJob(job);
            waitUntil((async () => {
                try {
                    await saveWorkflowJob({ ...job, status: 'running', updatedAt: new Date().toISOString() });
                    const result = await finishWorkflowRun({ proid: proid.trim(), ask, runId, runJson, headers });
                    // FN Mongo has a request-size ceiling. The polling record only needs
                    // a bounded, renderable answer; full workflow data follows its normal
                    // project-info persistence path.
                    const jobResult = buildWorkflowJobResult(result);
                    await saveWorkflowJob({ ...job, status: 'completed', updatedAt: new Date().toISOString(), result: jobResult });
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : '工作流执行失败';
                    console.error(`[workflow/job ${job.jobId}]`, message);
                    await saveWorkflowJob({ ...job, status: 'failed', updatedAt: new Date().toISOString(), error: message }).catch(() => { });
                }
            })());
            return res.status(202).json({ success: true, accepted: true, jobId: job.jobId, workflow_run_id: runId });
        }
        console.log(`[workflow/run] runId=${runId}，开始轮询...`);
        /* ── 2. 轮询状态 ── */
        const statusJson = await pollAIHubRun(runId, AIHUB_AGENT_TOKEN);
        if (statusJson.status === 'failed') {
            const errMsg = statusJson.error?.message || statusJson.aiHubError?.message || statusJson.lastPollError || JSON.stringify(statusJson);
            console.warn(`[workflow/run] 工作流失败:`, errMsg);
            res.status(502).json({ success: false, error: `工作流执行失败: ${errMsg}`, detail: statusJson });
            return;
        }
        /* ── 3. 获取输出 ── */
        const outputsResp = await fetch(`${AIHUB_BASE_URL}/workflows/runs/${runId}/outputs`, { headers });
        const outputsJson = await outputsResp.json().catch(() => ({}));
        const innerOutputs = getInnerOutputs(outputsJson);
        const llmReport = typeof innerOutputs.llm === 'string' ? innerOutputs.llm : '';
        const todoText = typeof innerOutputs.zxzdb === 'string' ? innerOutputs.zxzdb : '';
        // rawAnswer 保留 LLM 分析报告 + 待办列表，供后续 LLM 二次分析和原始存档
        const rawAnswer = (llmReport ? llmReport : '') +
            (todoText ? '\n\n---\n\n## 执行中待办\n\n' + todoText : '') ||
            outputsJson?.text ||
            outputsJson?.answer ||
            (typeof outputsJson === 'string' ? outputsJson : null) ||
            JSON.stringify(outputsJson, null, 2);
        // 提取并规范化工作流输出的结构化数据，供 LLM 生成完整项目信息
        const rawStructuredData = extractWorkflowStructuredData(outputsJson);
        const structuredData = normalizeWorkflowStructuredData(rawStructuredData);
        console.log(`[workflow/run] 提取结构化数据键:`, Object.keys(structuredData).join(', '));
        const historyTitle = `工作流结果 proid=${proid}`;
        /* ── 4. 保存历史记录（每次查询都新增） ── */
        try {
            pushWorkflowOutput('ai-hub-workflow', rawAnswer, 'markdown', historyTitle, {
                proid,
                ask,
                workflow_run_id: runId,
            });
        }
        catch (dbErr) {
            console.warn('[workflow/run] 历史记录存库失败（不影响返回）:', dbErr);
        }
        /* ── 5. LLM 二次分析 ── */
        const { analyzed, structuredData: llmStructuredData, usedLLM, error: llmError } = await analyzeProjectInfoWithLLM({
            proid: proid.trim(),
            ask,
            rawAnswer,
            structuredData,
        });
        // LLM 可能未按指令输出英文键，做一次兜底映射
        const finalStructuredData = normalizeWorkflowStructuredData(llmStructuredData);
        const projectInfoTitle = `项目信息 proid=${proid}`;
        /* ── 6. 保存/覆盖项目信息（按 proid 覆盖） ── */
        try {
            upsertProjectInfoFile({
                proid: proid.trim(),
                title: projectInfoTitle,
                content: analyzed,
                raw_content: rawAnswer,
                ask,
                workflow_run_id: runId,
                metadata: {
                    analyzed_by_llm: usedLLM,
                    llm_error: llmError || undefined,
                    llm_model: usedLLM ? LLM_MODEL : undefined,
                    structured_data: finalStructuredData,
                    todo_list_text: typeof innerOutputs.zxzdb === 'string' ? innerOutputs.zxzdb : undefined,
                },
            });
        }
        catch (dbErr) {
            console.warn('[workflow/run] 项目信息存库失败（不影响返回）:', dbErr);
        }
        /* ── 7. 同步到知识库 ── */
        try {
            const todoList = typeof innerOutputs.zxzdb === 'string' ? innerOutputs.zxzdb : undefined;
            const kbResult = syncKnowledgeBaseForProjectInfo(proid.trim(), analyzed, finalStructuredData, todoList);
            if (kbResult.success && kbResult.updatedFiles.length > 0) {
                console.log(`[workflow/run] 知识库同步完成: ${kbResult.updatedFiles.map(f => path.basename(f)).join(', ')}`);
            }
            else {
                console.log(`[workflow/run] 知识库同步: ${kbResult.message}`);
            }
        }
        catch (kbErr) {
            console.warn('[workflow/run] 知识库同步失败（不影响返回）:', kbErr);
        }
        console.log(`[workflow/run] 完成 proid=${proid} runId=${runId} llm=${usedLLM}`);
        res.json({
            success: true,
            data: {
                answer: analyzed,
                title: projectInfoTitle,
                proid,
                workflow_run_id: runId,
                analyzed_by_llm: usedLLM,
                llm_error: llmError,
                structured_data: finalStructuredData,
                raw: { run: runJson, status: statusJson, outputs: outputsJson },
            },
        });
    }
    catch (e) {
        const isTimeout = e?.message?.includes('超时');
        console.error('[workflow/run] error:', e?.message);
        res.status(isTimeout ? 504 : 500).json({
            success: false,
            error: e?.message || '触发失败',
        });
    }
});
router.get('/api/workflow/jobs/:jobId', async (req, res) => {
    try {
        let job = await loadWorkflowJob(req.params.jobId);
        if (!job)
            return res.status(404).json({ success: false, error: '工作流任务不存在' });
        if (job.status === 'running')
            job = await recoverWorkflowJob(job);
        return res.json({ success: true, job });
    }
    catch (error) {
        return res.status(500).json({ success: false, error: error?.message || '读取工作流任务失败' });
    }
});
export default router;
//# sourceMappingURL=workflow.js.map