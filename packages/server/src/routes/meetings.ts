import { Router } from "express";
import path from "path";
import fs from "fs";
import { saveMeetingIntelligence, getMeetingIntelligence, deleteMeetingIntelligence } from "../services/db.js";

const router = Router();

// ============= Playwright 会议系统 =============

const MEETING_URL = 'https://ndmeeting-personal-management.sdp.101.com/?sdp-app-id=b4fb92a0-af7f-49c2-b270-8f62afac1133&lang=zh-CN&&machine_code=087abe36b877d7d9a6638d2a3c25/#/record';
const USERNAME = process.env.MEETING_USERNAME || '986916';
const PASSWORD = process.env.MEETING_PASSWORD || 'Youxi0921';

const MEETINGS_DATA_DIR = path.resolve(process.cwd(), 'data', 'meetings');
if (!fs.existsSync(MEETINGS_DATA_DIR)) fs.mkdirSync(MEETINGS_DATA_DIR, { recursive: true });

let meetingBrowser: any = null;
let meetingPage: any = null;
let meetingContext: any = null;
const AUTH_FILE = path.resolve(process.cwd(), 'data', 'auth', 'meeting-auth.json');

async function ensureMeetingLogin() {
  if (meetingPage && !meetingPage.isClosed()) {
    try {
      const url = await meetingPage.url();
      if (!url.includes('login') && url.includes('#/record')) return meetingPage;
    } catch { }
  }

  const { chromium } = await import('playwright');

  if (!meetingBrowser || !meetingBrowser.isConnected()) {
    const chromePaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
    ];
    let executablePath: string | undefined;
    for (const p of chromePaths) { if (fs.existsSync(p)) { executablePath = p; break; } }

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
    } else {
      try { meetingBrowser = await chromium.launch({
        headless: false,
        channel: 'chrome',
        args: [
          '--start-minimized',
          '--window-position=-32000,-32000',
          '--no-sandbox',
          '--disable-gpu',
          '--disable-dev-shm-usage',
        ],
      }); }
      catch { throw new Error('未找到 Chrome 浏览器'); }
    }
  }

  let contextOpts: any = {};
  if (fs.existsSync(AUTH_FILE)) contextOpts = { storageState: AUTH_FILE };
  if (meetingContext) { try { await meetingContext.close(); } catch { } }

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
    if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });
    await meetingContext.storageState({ path: AUTH_FILE });
  }

  const currentUrl = await meetingPage.url();
  if (!currentUrl.includes('#/record')) {
    await meetingPage.goto(MEETING_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await meetingPage.waitForTimeout(2000);
  }

  try { await meetingPage.waitForSelector('tr.fish-table-row', { timeout: 10000 }); }
  catch { }

  return meetingPage;
}

// ============= 获取会议列表 =============

router.post("/api/meetings", async (req, res) => {
  try {
    const page = await ensureMeetingLogin();
    await page.waitForTimeout(1000);

    const records = await page.evaluate(() => {
      const items: any[] = [];
      const rows = document.querySelectorAll('tr.fish-table-row');
      let index = 0;
      rows.forEach((row) => {
        const cells = row.querySelectorAll('td.fish-table-cell');
        if (cells.length >= 7) {
          const links = Array.from(row.querySelectorAll('a'));
          let audioUrl = '', debugInfo = '';

          for (const link of links) {
            const linkText = link.textContent?.trim() || '';
            if (linkText.includes('音频') || linkText.includes('下载')) {
              for (let i = 0; i < link.attributes.length; i++) {
                const attr = link.attributes[i];
                if (attr.name.startsWith('data-') && (attr.value.includes('gcdncs') || attr.value.includes('download'))) {
                  audioUrl = attr.value.replace(/\\u0026/g, '&');
                  break;
                }
              }
              if (audioUrl) break;
              const href = link.getAttribute('href') || '';
              if (href.includes('gcdncs') || href.includes('download')) { audioUrl = href.replace(/\\u0026/g, '&'); break; }
            }
          }

          let meetingId = '';
          for (let i = 0; i < Math.min(cells.length, 5); i++) {
            const cellText = cells[i]?.getAttribute('title') || cells[i]?.textContent?.trim() || '';
            if (/^\d{10,}$/.test(cellText) || /^[a-f0-9-]{36}$/i.test(cellText)) { meetingId = cellText; break; }
          }
          if (!meetingId) meetingId = `meeting_${Date.now()}_${index}`;

          items.push({
            meetingId,
            title: cells[3]?.getAttribute('title') || cells[3]?.textContent?.trim() || `会议 ${index + 1}`,
            startTime: cells[4]?.getAttribute('title') || cells[4]?.textContent?.trim() || '',
            recorder: cells[5]?.getAttribute('title') || cells[5]?.textContent?.trim() || '',
            duration: cells[6]?.getAttribute('title') || cells[6]?.textContent?.trim() || '',
            fileSize: cells[7]?.getAttribute('title') || cells[7]?.textContent?.trim() || '',
            audioUrl: audioUrl || '',
            status: 'pending',
            _rowIndex: index,
          });
          index++;
        }
      });
      return items;
    });

    // 补充 hasIntelligence 标记
    for (const r of records as any[]) {
      const intel = getMeetingIntelligence(r.meetingId);
      r.hasIntelligence = !!intel;
    }

    res.json({ records, total: records.length });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || '获取会议列表失败' });
  }
});

// ============= 获取真实音频链接 =============

router.post("/api/meetings/audio-url", async (req, res) => {
  const { title, rowIndex } = req.body;
  if (rowIndex === undefined && !title) return res.status(400).json({ error: '需要 title 或 rowIndex' });

  try {
    const page = await ensureMeetingLogin();
    await page.waitForTimeout(500);

    let capturedUrl = '';
    const requestHandler = (request: any) => {
      const url = request.url();
      if (url.includes('gcdncs.101.com') && url.includes('download')) capturedUrl = url;
    };
    page.on('request', requestHandler);

    try {
      const idx = typeof rowIndex === 'number' ? rowIndex : 0;
      const downloadLink = page.locator('tr.fish-table-row').nth(idx).locator('a:has-text("下载音频")').first();
      if (await downloadLink.count() > 0) {
        const downloadPromise = page.waitForEvent('download', { timeout: 8000 }).catch(() => null);
        await downloadLink.click();
        const download = await downloadPromise;
        if (download) await download.cancel().catch(() => { });
        await page.waitForTimeout(1000);
      }
    } finally {
      page.off('request', requestHandler);
    }

    if (capturedUrl) res.json({ success: true, audioUrl: capturedUrl });
    else res.json({ success: false, error: '未能捕获到下载链接' });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || '获取音频链接失败' });
  }
});

// ============= 会议处理（SSE） =============

router.post("/api/meetings/process", async (req, res) => {
  const { meetingId, format = 'audio' } = req.body;
  if (!meetingId) return res.status(400).json({ error: 'meetingId 不能为空' });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const send = (type: string, data: any = {}) => {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
  };

  try {
    send('log', { message: `开始处理会议 ${meetingId}...` });
    const page = await ensureMeetingLogin();
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // 获取会议信息
    const records = await page.evaluate((mid: string) => {
      const rows = Array.from(document.querySelectorAll('tr.fish-table-row'));
      for (const row of rows) {
        const cells = row.querySelectorAll('td.fish-table-cell');
        const id = cells[2]?.getAttribute('title') || '';
        if (id) {
          return {
            meetingId: id,
            title: cells[3]?.getAttribute('title') || '',
            startTime: cells[4]?.getAttribute('title') || '',
            recorder: cells[5]?.getAttribute('title') || '',
            duration: cells[6]?.getAttribute('title') || '',
            fileSize: cells[7]?.getAttribute('title') || ''
          };
        }
      }
      return null;
    });

    send('log', { message: '会议信息获取完成' });

    // TODO: 集成 meeting-service.ts 的完整转录流程
    // 当前简化版：返回会议基本信息
    send('done', {
      success: true,
      meetingId,
      transcript: `会议信息：${records?.title || meetingId}`,
      summary: `会议 ${records?.title || meetingId} 的纪要`,
      todos: ['确认工作进度', '跟进相关事项'],
    });
    res.end();
  } catch (error: any) {
    send('error', { message: error?.message || '处理失败' });
    res.end();
  }
});

// ============= 会议智能分析（行动决策 + 风险评估） =============

router.post("/api/meetings/intelligence", async (req, res) => {
  const { transcript, title, startTime } = req.body;
  if (!transcript) return res.status(400).json({ error: "请提供会议转录文本" });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  const send = (type: string, data: any = {}) => { res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`); }; // eslint-disable-next-line @typescript-eslint/no-explicit-any

  try {
    send('log', { message: '正在进行会议深度分析...' });
    const apiKey = process.env.MOONSHOT_API_KEY || process.env.OPENAI_API_KEY;
    const baseUrl = process.env.MOONSHOT_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.moonshot.cn/v1';
    const model = process.env.OPENAI_CHAT_MODEL || 'moonshot-v1-128k';
    if (!apiKey) { send('error', { message: '未配置 API Key' }); return res.end(); }

    const systemPrompt = `你是一个资深项目管理专家和风险评估分析师。用户会提供一段会议转录文本，请从中提取关键的决策、行动项、风险和阻塞项。

请严格按以下 JSON 格式输出，不要输出 JSON 以外的内容：

{
  "decisions": [
    { "content": "做出的决策内容", "owner": "决策者/拍板人", "impact": "影响范围" }
  ],
  "action_items": [
    { "task": "具体行动项", "owner": "负责人", "due": "截止时间（如会议中提到）", "priority": "high/medium/low" }
  ],
  "risks": [
    { "description": "识别到的风险", "severity": "high/medium/low", "impact": "可能的影响", "mitigation": "建议的应对措施" }
  ],
  "blockers": [
    { "description": "阻塞项描述", "owner": "相关负责人", "suggestion": "解决建议" }
  ],
  "key_topics": ["讨论的核心议题1", "讨论的核心议题2"],
  "sentiment": "overall/positive/negative/neutral/mixed（整体会议氛围）",
  "follow_up_needed": "是否需要后续会议跟进（true/false）",
  "next_meeting_suggestion": "如需跟进，建议下次会议讨论的重点"
}

注意：
- 行动项要尽量具体，提取会议中明确提到的人名和时间
- 风险评估要基于会议讨论中暴露的问题，不要凭空捏造
- 如果某个字段在会议中没有涉及，可以返回空数组
- owner 字段尽量提取会议中提到的真实人名`;

    send('log', { message: 'AI 正在分析决策与风险...' });
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model, temperature: 0.3, stream: true,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `会议标题：${title || '未知'}\n会议时间：${startTime || '未知'}\n\n转录文本：\n${transcript}` },
        ],
      }),
    });

    if (!response.ok) { const t = await response.text(); send('error', { message: `AI 错误: ${response.status} ${t}` }); return res.end(); }

    let fullContent = '';
    const reader = response.body?.getReader();
    if (!reader) { send('error', { message: '响应流为空' }); return res.end(); }
    const decoder = new TextDecoder(); let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n'); buf = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) { fullContent += delta; send('chunk', { content: delta }); }
        } catch { /* skip */ }
      }
    }

    try {
      const jsonMatch = fullContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        // 持久化：以 title 作为 meetingId 的 fallback 标识
        const meetingId = title || `meeting_${Date.now()}`;
        try { saveMeetingIntelligence(meetingId, title || '', startTime || '', parsed); } catch (e) { console.error('保存分析结果失败:', e); }
        send('done', { result: parsed, saved: true });
      } else {
        send('done', { result: null, raw: fullContent });
      }
    } catch { send('done', { result: null, raw: fullContent }); }
  } catch (error: any) { send('error', { message: error?.message || '分析失败' }); } // eslint-disable-next-line @typescript-eslint/no-explicit-any
  finally { res.end(); }
});

// ============= 获取已保存的会议智能分析 =============

router.get("/api/meetings/intelligence/:meetingId", (req, res) => {
  try {
    const { meetingId } = req.params;
    const row = getMeetingIntelligence(meetingId);
    if (row) {
      res.json({ success: true, result: JSON.parse(row.result as string), created_at: row.created_at, updated_at: row.updated_at });
    } else {
      res.json({ success: true, result: null });
    }
  } catch (error: any) {
    res.status(500).json({ error: error?.message || '获取分析结果失败' });
  }
});

// ============= 删除已保存的会议智能分析 =============

router.delete("/api/meetings/intelligence/:meetingId", (req, res) => {
  try {
    const { meetingId } = req.params;
    deleteMeetingIntelligence(meetingId);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || '删除分析结果失败' });
  }
});

export default router;
