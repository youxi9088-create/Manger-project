import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { pushWorkflowOutput, getWorkflowOutputs, getWorkflowOutputById, deleteWorkflowOutput } from '../services/db.js';

/* ─── AI-Hub 工作流配置 ─── */
const AIHUB_BASE_URL     = process.env.AIHUB_BASE_URL     || 'https://ai-hub-api.aiae.ndhy.com';
const AIHUB_PROJECT_KEY  = process.env.AIHUB_PROJECT_KEY  || 'pk-jbBSRhXu300agef7tUAw_XzQ_ZrJKBsf';
const AIHUB_BOT_ID       = process.env.AIHUB_BOT_ID       || 'eee4cd05-ded3-4794-84e2-73d2494a5dc6';
const AIHUB_SDP_APP_ID   = process.env.AIHUB_SDP_APP_ID   || 'b4fb92a0-af7f-49c2-b270-8f62afac1133';
const AIHUB_USER_ID      = process.env.AIHUB_USER_ID      || '986916';
// BTS_TOKEN 由调用方在 request body 中传入，或预设在环境变量里
const AIHUB_BTS_TOKEN_DEFAULT = process.env.AIHUB_BTS_TOKEN || '';

const router = Router();

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
  } catch (e: any) {
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
  } catch (e: any) {
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
  } catch (e: any) {
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
  } catch (e: any) {
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
  } catch (e: any) {
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
  } catch (e: any) {
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
  } catch (e: any) {
    res.status(500).json({ error: e?.message || '读取失败' });
  }
});

/* ─── POST /api/workflow/run ─── 主动触发 AI-Hub 工作流 ─── */
router.post('/api/workflow/run', async (req, res) => {
  try {
    const { proid, extra_inputs, bts_token } = req.body || {};

    if (!proid || typeof proid !== 'string' || !proid.trim()) {
      res.status(400).json({ success: false, error: '缺少 proid 参数' });
      return;
    }

    // BTS Token: 优先用请求里传的，其次用环境变量预设的
    const btsToken = (bts_token && typeof bts_token === 'string' && bts_token.trim())
      ? bts_token.trim()
      : AIHUB_BTS_TOKEN_DEFAULT;

    if (!btsToken) {
      res.status(400).json({ success: false, error: '缺少 BTS Token，请在页面输入后重试' });
      return;
    }

    const inputs: Record<string, string> = { proid: proid.trim() };
    if (extra_inputs && typeof extra_inputs === 'object') {
      Object.assign(inputs, extra_inputs);
    }

    const payload = {
      inputs,
      response_mode: 'blocking',
      user: AIHUB_USER_ID,
    };

    console.log(`[workflow/run] 触发工作流 proid=${proid}`);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000);

    let upstream: Response;
    try {
      upstream = await fetch(`${AIHUB_BASE_URL}/v1/workflows/run`, {
        method: 'POST',
        headers: {
          'Authorization': `BTS ${btsToken}`,
          'X-App-Id': AIHUB_BOT_ID,
          'Userid': AIHUB_USER_ID,
          'X-Project-Key': AIHUB_PROJECT_KEY,
          'sdp-app-id': AIHUB_SDP_APP_ID,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    const rawText = await upstream.text();

    let upstreamJson: any;
    try {
      upstreamJson = JSON.parse(rawText);
    } catch {
      upstreamJson = { raw: rawText };
    }

    if (!upstream.ok) {
      console.warn(`[workflow/run] upstream error ${upstream.status}:`, rawText.slice(0, 300));
      res.status(upstream.status).json({
        success: false,
        error: upstreamJson?.message || upstreamJson?.msg || `AI-Hub 返回 ${upstream.status}`,
        detail: upstreamJson,
      });
      return;
    }

    /* ── 提取 answer 内容 ── */
    const answer: string =
      upstreamJson?.data?.outputs?.text ||
      upstreamJson?.data?.outputs?.answer ||
      upstreamJson?.answer ||
      (typeof upstreamJson?.data?.outputs === 'string' ? upstreamJson.data.outputs : null) ||
      JSON.stringify(upstreamJson?.data?.outputs ?? upstreamJson, null, 2);

    const title = `工作流结果 proid=${proid}`;

    /* ── 存库（异步，不阻塞返回） ── */
    try {
      pushWorkflowOutput('ai-hub-workflow', answer, 'markdown', title, {
        proid,
        workflow_run_id: upstreamJson?.workflow_run_id,
        task_id: upstreamJson?.task_id,
      });
    } catch (dbErr) {
      console.warn('[workflow/run] 存库失败（不影响返回）:', dbErr);
    }

    res.json({
      success: true,
      data: {
        answer,
        title,
        proid,
        workflow_run_id: upstreamJson?.workflow_run_id,
        task_id: upstreamJson?.task_id,
        raw: upstreamJson,
      },
    });
  } catch (e: any) {
    const isTimeout = e?.name === 'AbortError';
    console.error('[workflow/run] error:', e?.message);
    res.status(isTimeout ? 504 : 500).json({
      success: false,
      error: isTimeout ? '工作流执行超时（>120s）' : (e?.message || '触发失败'),
    });
  }
});

export default router;