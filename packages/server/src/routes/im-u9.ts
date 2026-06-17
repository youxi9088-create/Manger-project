import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";
import * as db from "../services/db.js";
import { U9ApiClient } from "../services/u9-api.js";
import { readEnvFileContent, readRuntimeConfig, persistEnvVar, envFilePath } from "../utils/env.js";

const router = Router();

// ============= 辅助函数 =============

function isGroupConvId(convId: string): boolean {
  if (convId.includes('-')) return true;
  if (/^\d{16,}$/.test(convId)) return true;
  return false;
}

function normalizeU9Timestamp(rawTime: string | number | undefined, fallback: string): string {
  if (!rawTime) return fallback;
  const str = String(rawTime).trim();
  if (/^\d+$/.test(str)) {
    const num = parseInt(str, 10);
    const ms = str.length >= 13 ? num : num * 1000;
    return new Date(ms).toISOString();
  }
  return str;
}

function createU9Client() {
  return new U9ApiClient({
    baseUrl: process.env.U9_API_BASE_URL,
    authId: process.env.U9_API_AUTH_ID || '',
    authKey: process.env.U9_API_AUTH_KEY || '',
    appId: process.env.U9_SDP_APP_ID || '',
    diff: parseInt(process.env.U9_API_DIFF || '0'),
  });
}

// ============= 从 99U 导入聊天记录 =============

router.post("/api/im/chat-records/import-u9", async (req, res) => {
  try {
    const { sourceId, convId, keyword, beginTime, endTime, maxMessages = 100 } = req.body;
    if (!sourceId || !convId) return res.status(400).json({ error: "sourceId 和 convId 不能为空" });

    const source = db.getImSource(sourceId);
    if (!source) return res.status(404).json({ error: "数据源不存在" });

    const u9Client = createU9Client();
    const myName = process.env.U9_MY_NAME || '';
    const messages = await u9Client.getAllMessages(convId, { keyword, beginTime, endTime, maxMessages, myName });
    const isGroup = isGroupConvId(convId);
    const now = new Date().toISOString();

    const dbRecords: db.DbChatRecord[] = messages.map((msg) => ({
      id: uuidv4(), source_id: sourceId, im_message_id: msg.msg_id,
      sender_name: msg.sender_name || '未知', sender_id: msg.sender_id || null,
      group_name: isGroup ? (source.name || null) : null,
      group_id: isGroup ? convId : null,
      content: msg.content || '', message_type: msg.msg_type || 'text',
      timestamp: normalizeU9Timestamp(msg.create_time, now),
      is_mentioned: msg.is_mentioned ? 1 : 0,
      raw_data: JSON.stringify(msg), synced_at: now,
    }));

    const importResult = db.importChatRecords(dbRecords);
    db.updateImSource(sourceId, { last_sync_at: now });

    res.json({ success: true, imported: importResult.inserted, skipped: importResult.skipped, totalFromApi: messages.length, convId, sourceId });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || '导入失败' });
  }
});

// ============= 搜索 99U 消息 =============

router.post("/api/im/chat-records/search-u9", async (req, res) => {
  try {
    const { convId, keyword, beginTime, endTime, beforeMsgId, limit = 30 } = req.body;
    if (!convId) return res.status(400).json({ error: "convId 不能为空" });

    const u9Client = createU9Client();
    const response = await u9Client.searchMessages({ convId, keyword, beginTime, endTime, beforeMsgId, limit });
    res.json({ messages: response.messages, total: response.total, has_more: response.has_more, pre: response.pre, earliest_conv_msg_id: response.earliest_conv_msg_id });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || '搜索失败' });
  }
});

// ============= 99U 会话列表 =============

router.get("/api/im/u9-conversations", async (req, res) => {
  try {
    const envContent = readEnvFileContent();
    const match = envContent.match(/^U9_CONVERSATIONS=(.*)/m);
    let envValue = match ? match[1].trim() : '';

    if (!envValue) {
      const nameMatches = envContent.match(/^U9_CONVERSATION_NAMES_([^=]+)=/gm);
      if (nameMatches && nameMatches.length > 0) {
        const recoveredIds = nameMatches.map(m => m.replace('U9_CONVERSATION_NAMES_', '').replace('=', ''));
        envValue = recoveredIds.join(',');
        persistEnvVar('U9_CONVERSATIONS', envValue);
      }
    }

    const nameMap: Record<string, string> = {};
    const nameRegex = /^U9_CONVERSATION_NAMES_([^=]+)=(.*)$/gm;
    let nm;
    while ((nm = nameRegex.exec(envContent)) !== null) { if (!(nm[1] in nameMap)) nameMap[nm[1]] = nm[2].trim(); }

    const conversations = envValue.split(',').map(id => id.trim()).filter(Boolean)
      .map(id => ({ id, name: nameMap[id] || `会话 ${id.slice(-6)}` }));

    res.json({ conversations, total: conversations.length, source: 'env' });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || '获取会话列表失败' });
  }
});

// ============= 刷新会话列表 =============

router.post("/api/im/refresh-conversations", async (req, res) => {
  try {
    const envContent = readEnvFileContent();
    const authId = envContent.match(/^U9_API_AUTH_ID=(.*)/m)?.[1]?.trim();
    const authKey = envContent.match(/^U9_API_AUTH_KEY=(.*)/m)?.[1]?.trim();
    const appId = envContent.match(/^U9_SDP_APP_ID=(.*)/m)?.[1]?.trim();

    if (!authId || !authKey || !appId) return res.status(400).json({ error: '99U API 未配置' });

    const userId = req.body?.userId || envContent.match(/^U9_USER_ID=(.*)/m)?.[1]?.trim() || '986916';
    const u9Client = new U9ApiClient({
      baseUrl: process.env.U9_API_BASE_URL || 'https://im-message-search.sdp.101.com',
      authId, authKey, appId,
      diff: parseInt(process.env.U9_API_DIFF || '0'),
    });

    const [groups, friends] = await Promise.all([
      u9Client.getGroups(userId).catch(() => [] as { id: string; name: string }[]),
      u9Client.getAllFriends().catch(() => [] as { id: string; name: string }[]),
    ]);

    const convMatch = envContent.match(/^U9_CONVERSATIONS=(.*)/m);
    const existingIds = new Set((convMatch?.[1]?.trim() || '').split(',').map(id => id.trim()).filter(Boolean));
    const existingNames: Record<string, string> = {};
    const nameRegex = /^U9_CONVERSATION_NAMES_([^=]+)=(.*)$/gm;
    let nm;
    while ((nm = nameRegex.exec(envContent)) !== null) { if (!(nm[1] in existingNames)) existingNames[nm[1]] = nm[2].trim(); }

    const previousCount = existingIds.size;
    const newConversations: { id: string; name: string; type: string }[] = [];

    for (const g of groups) {
      if (!existingIds.has(g.id)) { existingIds.add(g.id); newConversations.push({ id: g.id, name: g.name, type: 'group' }); }
      if (g.name) existingNames[g.id] = g.name;
    }
    for (const f of friends) {
      if (!existingIds.has(f.id)) { existingIds.add(f.id); newConversations.push({ id: f.id, name: f.name, type: 'friend' }); }
      if (f.name) existingNames[f.id] = f.name;
    }

    const allIds = Array.from(existingIds).join(',');
    persistEnvVar('U9_CONVERSATIONS', allIds);
    process.env.U9_CONVERSATIONS = allIds;
    for (const [id, name] of Object.entries(existingNames)) { persistEnvVar(`U9_CONVERSATION_NAMES_${id}`, name); }

    res.json({ success: true, previousCount, currentCount: existingIds.size, newCount: newConversations.length, newConversations, groupsFromApi: groups.length, friendsFromApi: friends.length });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || '刷新会话列表失败' });
  }
});

// ============= 刷新环境变量 =============

router.post("/api/im/refresh-env", (req, res) => {
  try {
    dotenv.config({ path: envFilePath, override: true });
    // 同时加载运行时配置到 process.env
    const runtime = readRuntimeConfig();
    for (const [k, v] of Object.entries(runtime)) {
      process.env[k] = v;
    }
    res.json({ success: true, message: '环境变量已刷新' });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || '刷新失败' });
  }
});

// ============= 99U 配置状态 =============

router.get("/api/im/u9-status", async (req, res) => {
  try {
    const envContent = readEnvFileContent();
    const authId = envContent.match(/^U9_API_AUTH_ID=(.*)/m)?.[1]?.trim() || '';
    const authKey = envContent.match(/^U9_API_AUTH_KEY=(.*)/m)?.[1]?.trim() || '';
    const appId = envContent.match(/^U9_SDP_APP_ID=(.*)/m)?.[1]?.trim() || '';
    const baseUrl = envContent.match(/^U9_API_BASE_URL=(.*)/m)?.[1]?.trim() || 'https://im-message-search.sdp.101.com';
    let conversationsValue = envContent.match(/^U9_CONVERSATIONS=(.*)/m)?.[1]?.trim() || '';

    if (!conversationsValue) {
      const nameMatches = envContent.match(/^U9_CONVERSATION_NAMES_([^=]+)=/gm);
      if (nameMatches && nameMatches.length > 0) {
        const recoveredIds = nameMatches.map(m => m.replace('U9_CONVERSATION_NAMES_', '').replace('=', ''));
        conversationsValue = recoveredIds.join(',');
        persistEnvVar('U9_CONVERSATIONS', conversationsValue);
        process.env.U9_CONVERSATIONS = conversationsValue;
      }
    }

    const configured = !!(authId && authKey && appId);
    const conversations = conversationsValue.split(',').map(id => id.trim()).filter(Boolean);

    res.json({ configured, hasAuthId: !!authId, hasAuthKey: !!authKey, hasAppId: !!appId, baseUrl, conversations, conversationsCount: conversations.length });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || '检查配置失败' });
  }
});

// ============= 自动登录（SSE）=============

let autoSetupBrowser: any = null;
let autoSetupSmsResolve: ((code: string) => void) | null = null;

router.post("/api/im/auto-setup", async (req, res) => {
  const { employeeId, password } = req.body;
  if (!employeeId || !password) return res.status(400).json({ error: '工号和密码不能为空' });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const send = (type: string, data: any = {}) => {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
  };

  try {
    const { chromium } = await import('playwright');
    const fs = await import('fs');

    send('log', { message: '启动浏览器...' });

    const possibleChromePaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
    ];
    let chromePath: string | undefined;
    for (const p of possibleChromePaths) {
      if (p && fs.existsSync(p)) { chromePath = p; break; }
    }

    let browser: any;
    if (chromePath) {
      browser = await chromium.launch({ headless: false, executablePath: chromePath });
    } else {
      try { browser = await chromium.launch({ headless: false, channel: 'chrome' }); }
      catch { browser = await chromium.launch({ headless: false }); }
    }
    autoSetupBrowser = browser;
    const context = await browser.newContext();
    const page = await context.newPage();

    send('log', { message: '打开 ndim.101.com...' });
    await page.goto('https://ndim.101.com/#/msg?_k=auto', { waitUntil: 'networkidle', timeout: 30000 }).catch(() => { });
    await page.waitForTimeout(5000);

    const url = page.url();
    if (!url.includes('login') && url.includes('ndim.101.com')) {
      send('log', { message: '已处于登录状态，直接获取配置...' });
    } else {
      send('log', { message: '需要登录，已打开浏览器，请优先扫码登录。' });

      let loggedInByQr = false;
      try {
        await page.waitForFunction(() => !location.href.includes('/login'), { timeout: 60000 });
        loggedInByQr = true;
        send('log', { message: '检测到扫码登录成功。' });
      } catch { }

      if (!loggedInByQr) {
        send('log', { message: '扫码未完成，尝试密码登录...' });
        const pcSwitcher = await page.$('.login-qrcode-switcher__pc');
        if (pcSwitcher) {
          try { await pcSwitcher.click({ force: true, timeout: 5000 }); }
          catch { await page.evaluate(() => { (document.querySelector('.login-qrcode-switcher__pc') as HTMLElement)?.click(); }); }
          await page.waitForTimeout(2000);
        }

        const accountSelectors = ['[placeholder="请输入工号"]', '[placeholder*="工号"]', '[placeholder*="账号"]', 'input[name="account"]', 'input[type="text"]'];
        const passwordSelectors = ['[placeholder="请输入密码"]', '[placeholder*="密码"]', 'input[name="password"]', 'input[type="password"]'];

        let accountSelector = '', passwordSelector = '';
        let accountFrame: any = null, passwordFrame: any = null;

        // 在主页面查找
        for (const sel of accountSelectors) {
          const loc = page.locator(sel).first();
          if ((await loc.count()) > 0) { try { await loc.waitFor({ state: 'visible', timeout: 1000 }); accountSelector = sel; break; } catch { } }
        }
        for (const sel of passwordSelectors) {
          const loc = page.locator(sel).first();
          if ((await loc.count()) > 0) { try { await loc.waitFor({ state: 'visible', timeout: 1000 }); passwordSelector = sel; break; } catch { } }
        }

        // iframe 中查找
        if (!accountSelector || !passwordSelector) {
          for (const frame of page.frames()) {
            if (frame === page.mainFrame()) continue;
            if (!accountSelector) {
              for (const sel of accountSelectors) {
                const loc = frame.locator(sel).first();
                if ((await loc.count()) > 0) { try { await loc.waitFor({ state: 'visible', timeout: 1000 }); accountSelector = sel; accountFrame = frame; break; } catch { } }
              }
            }
            if (!passwordSelector) {
              for (const sel of passwordSelectors) {
                const loc = frame.locator(sel).first();
                if ((await loc.count()) > 0) { try { await loc.waitFor({ state: 'visible', timeout: 1000 }); passwordSelector = sel; passwordFrame = frame; break; } catch { } }
              }
            }
            if (accountSelector && passwordSelector) break;
          }
        }

        if (!accountSelector || !passwordSelector) throw new Error('未找到账号/密码输入框');

        send('log', { message: '填入账号密码...' });
        await (accountFrame ? accountFrame.locator(accountSelector).first() : page.locator(accountSelector).first()).fill(employeeId);
        await (passwordFrame ? passwordFrame.locator(passwordSelector).first() : page.locator(passwordSelector).first()).fill(password);

        const loginContext = passwordFrame || accountFrame || page;
        const loginButton = loginContext.locator('button:has-text("登 录"), button:has-text("登录"), button:has-text("立即登录")').first();
        if ((await loginButton.count()) > 0) await loginButton.click({ force: true });
        else await page.keyboard.press('Enter');

        send('log', { message: '等待登录响应...' });
        await page.waitForTimeout(8000);

        // 检查短信验证码
        const smsInput = await page.$('[placeholder*="验证码"], input[name="code"]');
        if (smsInput) {
          send('sms_required', { message: '需要短信验证码' });
          const getCodeBtn = await page.$('button:has-text("获取验证码")');
          if (getCodeBtn) await getCodeBtn.click({ force: true });

          const smsCode = await new Promise<string>((resolve) => {
            autoSetupSmsResolve = resolve;
            setTimeout(() => { if (autoSetupSmsResolve === resolve) { autoSetupSmsResolve = null; resolve(''); } }, 5 * 60 * 1000);
          });

          if (!smsCode) { send('error', { message: '验证码超时' }); await browser.close(); autoSetupBrowser = null; res.end(); return; }
          await page.fill('[placeholder*="验证码"], input[name="code"]', smsCode);
          const confirmBtn = await page.$('button:has-text("确 定"), button:has-text("确定")');
          if (confirmBtn) await confirmBtn.click({ force: true });
          else await page.keyboard.press('Enter');
          await page.waitForTimeout(15000);
        }

        if (page.url().includes('login')) {
          send('error', { message: '登录失败，请确认工号和密码' });
          await browser.close(); autoSetupBrowser = null; res.end(); return;
        }
      }
    }

    send('log', { message: '登录成功，提取认证信息...' });
    await page.waitForTimeout(5000);

    const authInfo = await page.evaluate(() => {
      const authKey = Object.keys(localStorage).find(k => k.includes('ND_UC_AUTH') && k.includes('token') && !k.includes('time'));
      if (!authKey) return null;
      try {
        const raw = localStorage.getItem(authKey);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        const tokenObj = JSON.parse(parsed.value);
        return { access_token: tokenObj.access_token, mac_key: tokenObj.mac_key, diff: tokenObj.diff || 0, user_id: tokenObj.user_id };
      } catch { return null; }
    });

    if (!authInfo) { send('error', { message: '无法提取认证信息' }); await browser.close(); autoSetupBrowser = null; res.end(); return; }

    send('log', { message: `认证信息已获取 (user_id: ${authInfo.user_id})` });
    send('log', { message: '获取会话列表...' });
    await page.waitForTimeout(5000);

    const sessions = await page.evaluate(() => {
      const result: { id: string; name: string }[] = [];
      const seen = new Set<string>();
      document.querySelectorAll('[data-convid]').forEach(el => {
        const cid = el.getAttribute('data-convid');
        if (!cid || seen.has(cid)) return;
        seen.add(cid);
        const nameEl = el.querySelector('[data-id]') || el.querySelector('.conv-name') || el.querySelector('.name');
        result.push({ id: cid, name: nameEl?.textContent?.trim() || '' });
      });
      if (result.length === 0) {
        document.querySelectorAll('[data-conv-id]').forEach(el => {
          const cid = el.getAttribute('data-conv-id');
          if (!cid || seen.has(cid)) return;
          seen.add(cid);
          const nameEl = el.querySelector('.conv-name') || el.querySelector('[title]');
          result.push({ id: cid, name: nameEl?.textContent?.trim() || nameEl?.getAttribute('title') || '' });
        });
      }
      return result;
    });

    send('log', { message: `获取到 ${sessions.length} 个会话` });
    send('log', { message: '保存配置到 .env...' });

    persistEnvVar('U9_API_AUTH_ID', authInfo.access_token);
    persistEnvVar('U9_API_AUTH_KEY', authInfo.mac_key);
    persistEnvVar('U9_SDP_APP_ID', 'b4fb92a0-af7f-49c2-b270-8f62afac1133');
    persistEnvVar('U9_API_DIFF', String(authInfo.diff || 0));
    persistEnvVar('U9_API_BASE_URL', 'https://im-message-search.sdp.101.com');

    const convIds = sessions.map((s: any) => s.id).join(',');
    if (convIds) persistEnvVar('U9_CONVERSATIONS', convIds);
    for (const s of sessions) { if (s.name) persistEnvVar(`U9_CONVERSATION_NAMES_${s.id}`, s.name); }

    process.env.U9_API_AUTH_ID = authInfo.access_token;
    process.env.U9_API_AUTH_KEY = authInfo.mac_key;
    process.env.U9_SDP_APP_ID = 'b4fb92a0-af7f-49c2-b270-8f62afac1133';
    process.env.U9_API_DIFF = String(authInfo.diff || 0);
    process.env.U9_CONVERSATIONS = convIds;

    await browser.close();
    autoSetupBrowser = null;

    send('done', {
      message: `配置完成！获取到 ${sessions.length} 个会话`,
      sessions: sessions.length, userId: authInfo.user_id,
      conversationIds: sessions.map((s: any) => s.id),
    });
    res.end();
  } catch (error: any) {
    send('error', { message: error?.message || '自动配置失败' });
    if (autoSetupBrowser) { try { await autoSetupBrowser.close(); } catch { } autoSetupBrowser = null; }
    res.end();
  }
});

// ============= 提交短信验证码 =============

router.post("/api/im/auto-setup/sms", (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: '验证码不能为空' });
  if (autoSetupSmsResolve) {
    autoSetupSmsResolve(code);
    autoSetupSmsResolve = null;
    res.json({ success: true });
  } else {
    res.status(400).json({ error: '没有待处理的验证码请求' });
  }
});

// ============= 调试用 =============

router.get("/api/debug-env", (req, res) => {
  const envContent = readEnvFileContent();
  const match = envContent.match(/U9_CONVERSATIONS=(.*)/);
  res.json({ rawEnv: match ? match[1] : 'not found', fromProcessEnv: process.env.U9_CONVERSATIONS, parsed: process.env.U9_CONVERSATIONS ? process.env.U9_CONVERSATIONS.split(',').filter(Boolean) : [] });
});

export default router;
