import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import * as db from "../services/db.js";
import { U9ApiClient } from "../services/u9-api.js";
import { readEnvFileContent, readRuntimeConfig, persistEnvVar, removeRuntimeConfig, envFilePath } from "../utils/env.js";
import { listRemoteU9Conversations, saveRemoteU9Conversations } from "../services/u9-conversation-store.js";

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
  const envContent = readEnvFileContent();
  const readValue = (key: string) => process.env[key]?.trim()
    || envContent.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]?.trim()
    || '';
  return new U9ApiClient({
    baseUrl: readValue('U9_API_BASE_URL') || 'https://im-message-search.sdp.101.com',
    authId: readValue('U9_API_AUTH_ID'),
    authKey: readValue('U9_API_AUTH_KEY'),
    appId: readValue('U9_SDP_APP_ID'),
    diff: parseInt(readValue('U9_API_DIFF') || '0'),
  });
}

type U9Auth = {
  access_token: string;
  mac_key: string;
  refresh_token?: string;
  expires_at?: string;
  diff?: number;
  user_id?: string;
};
type U9Conversation = { id: string; name: string };
type U9ConversationLoad = { sessions: U9Conversation[]; source: 'u9_api' | 'local_chat_records' | 'u9_api_merged' | 'u9_data_store' };

function readStoredU9Auth(): U9Auth | null {
  const candidates = [
    path.resolve(process.cwd(), 'data', 'auth', 'oa-auth.json'),
    path.resolve(process.cwd(), 'data', 'auth', 'meeting-auth.json'),
    path.resolve(process.cwd(), '..', '..', 'data', 'auth', 'oa-auth.json'),
    path.resolve(process.cwd(), '..', '..', 'data', 'auth', 'meeting-auth.json'),
    path.resolve(process.cwd(), '..', '..', 'api', '_data', 'auth', 'oa-auth.json'),
    path.resolve(process.cwd(), '..', '..', 'api', '_data', 'auth', 'meeting-auth.json'),
  ];

  let newest: { auth: U9Auth; expiresAt: number } | null = null;
  for (const filePath of candidates) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const state = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      for (const origin of state?.origins || []) {
        for (const entry of origin?.localStorage || []) {
          if (!String(entry?.name || '').includes('ND_UC_AUTH') || !String(entry?.name || '').includes('token')) continue;
          const wrapper = JSON.parse(String(entry.value || '{}'));
          const token = typeof wrapper?.value === 'string' ? JSON.parse(wrapper.value) : wrapper?.value;
          if (token?.access_token && token?.mac_key) {
            const auth: U9Auth = {
              access_token: token.access_token,
              mac_key: token.mac_key,
              refresh_token: token.refresh_token,
              expires_at: token.expires_at,
              diff: token.diff || 0,
              user_id: token.user_id,
            };
            const expiresAt = Number.isFinite(new Date(token.expires_at).getTime())
              ? new Date(token.expires_at).getTime()
              : fs.statSync(filePath).mtimeMs;
            if (!newest || expiresAt > newest.expiresAt) newest = { auth, expiresAt };
          }
        }
      }
    } catch (error) {
      console.warn(`[U9] 读取认证快照失败: ${path.basename(filePath)}`, error);
    }
  }
  return newest?.auth || null;
}

function getU9AuthSnapshotPath(): string {
  const candidates = [
    path.resolve(process.cwd(), 'data', 'auth', 'oa-auth.json'),
    path.resolve(process.cwd(), '..', '..', 'data', 'auth', 'oa-auth.json'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

function isU9TokenExpired(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '');
  return /UC\/AUTH_(TOKEN_EXPIRED|INVALID_TOKEN|UNAVAILABLE_TOKEN|INVALID_TOKEN_BE_KICKED)/.test(message);
}

function shouldRefreshU9Auth(auth: U9Auth): boolean {
  const expiresAt = auth.expires_at ? new Date(auth.expires_at).getTime() : NaN;
  // Refresh only when the current access token is nearly expired. U9 rotates
  // refresh tokens, so refreshing every setup would invalidate the deployed snapshot.
  return !Number.isFinite(expiresAt) || expiresAt <= Date.now() + 5 * 60 * 1000;
}

async function refreshU9Auth(auth: U9Auth): Promise<U9Auth> {
  if (!auth.refresh_token) {
    throw new Error('本地 U9 认证快照缺少续期凭据。请在本机重新登录 99U 后再同步。');
  }

  const response = await fetch(`https://uc-gateway.101.com/v1.1/tokens/${encodeURIComponent(auth.refresh_token)}/actions/refresh`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'sdp-app-id': process.env.U9_SDP_APP_ID || 'b4fb92a0-af7f-49c2-b270-8f62afac1133',
      Origin: 'https://ndim.101.com',
      Referer: 'https://ndim.101.com/',
    },
  });

  if (!response.ok) {
    const body = await response.text();
    if (/UC\/AUTH_(TOKEN_EXPIRED|INVALID_TOKEN|UNAVAILABLE_TOKEN|INVALID_TOKEN_BE_KICKED)/.test(body)) {
      throw new Error('99U 登录已失效，无法自动续期。请在本机重新登录 99U 后再同步认证。');
    }
    throw new Error(`99U 授权续期失败（HTTP ${response.status}）`);
  }

  const refreshed = await response.json() as Partial<U9Auth> & { server_time?: string | number };
  if (!refreshed.access_token || !refreshed.mac_key) {
    throw new Error('99U 授权续期返回的数据不完整。请在本机重新登录 99U 后再同步认证。');
  }

  const serverTime = refreshed.server_time ? new Date(refreshed.server_time).getTime() : NaN;
  return {
    ...auth,
    ...refreshed,
    refresh_token: refreshed.refresh_token || auth.refresh_token,
    diff: typeof refreshed.diff === 'number'
      ? refreshed.diff
      : (Number.isFinite(serverTime) ? serverTime - Date.now() : auth.diff || 0),
    user_id: refreshed.user_id || auth.user_id,
  };
}

async function loadU9Conversations(auth: U9Auth): Promise<U9ConversationLoad> {
  const client = new U9ApiClient({
    baseUrl: process.env.U9_API_BASE_URL || 'https://im-message-search.sdp.101.com',
    authId: auth.access_token,
    authKey: auth.mac_key,
    appId: process.env.U9_SDP_APP_ID || 'b4fb92a0-af7f-49c2-b270-8f62afac1133',
    diff: Number(auth.diff || 0),
  });
  const [groupsResult, friendsResult] = await Promise.allSettled([
    client.getGroups(auth.user_id || '986916'),
    client.getAllFriends(),
  ]);
  const groups = groupsResult.status === 'fulfilled' ? groupsResult.value : [];
  const friends = friendsResult.status === 'fulfilled' ? friendsResult.value : [];
  const live = [...groups, ...friends]
    .filter((item: any) => item?.id)
    .map((item: any) => ({ id: String(item.id), name: String(item.name || '') }));
  const [stored, saved] = await Promise.all([
    listRemoteU9Conversations(),
    Promise.resolve(db.getSavedU9Conversations()),
  ]);

  // The U9 directory is sometimes partial. Keep its fresh names, but never
  // discard conversation IDs already proven by real local chat records.
  const conversations = new Map<string, U9Conversation>();
  for (const session of saved) conversations.set(session.id, session);
  for (const session of stored) conversations.set(session.id, { id: session.id, name: session.name || conversations.get(session.id)?.name || '' });
  for (const session of live) {
    const existing = conversations.get(session.id);
    conversations.set(session.id, { id: session.id, name: session.name || existing?.name || '' });
  }
  const sessions = Array.from(conversations.values());
  if (live.length > 0 && (saved.length > 0 || stored.length > 0)) return { sessions, source: 'u9_api_merged' };
  if (live.length > 0) return { sessions, source: 'u9_api' };
  if (stored.length > 0) return { sessions, source: 'u9_data_store' };
  if (saved.length > 0) return { sessions, source: 'local_chat_records' };

  const errors = [groupsResult, friendsResult]
    .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    .map((result) => result.reason instanceof Error ? result.reason.message : String(result.reason));
  if (errors.length > 0) throw new Error(`U9 会话目录读取失败：${errors.join('；')}`);
  return { sessions: [], source: 'u9_api' };
}

async function persistU9Configuration(auth: U9Auth, sessions: U9Conversation[]) {
  const convIds = sessions.map((session) => session.id).join(',');
  persistEnvVar('U9_API_AUTH_ID', auth.access_token);
  persistEnvVar('U9_API_AUTH_KEY', auth.mac_key);
  if (auth.refresh_token) persistEnvVar('U9_REFRESH_TOKEN', auth.refresh_token);
  if (auth.expires_at) persistEnvVar('U9_TOKEN_EXPIRES_AT', auth.expires_at);
  if (auth.user_id) persistEnvVar('U9_USER_ID', String(auth.user_id));
  persistEnvVar('U9_SDP_APP_ID', 'b4fb92a0-af7f-49c2-b270-8f62afac1133');
  persistEnvVar('U9_API_DIFF', String(auth.diff || 0));
  persistEnvVar('U9_API_BASE_URL', 'https://im-message-search.sdp.101.com');
  await saveRemoteU9Conversations(sessions);
  return convIds;
}

function readLegacyU9Conversations(): U9Conversation[] {
  const envContent = readEnvFileContent();
  const ids = (envContent.match(/^U9_CONVERSATIONS=(.*)/m)?.[1] || '')
    .split(',').map((id) => id.trim()).filter(Boolean);
  const names: Record<string, string> = {};
  const nameRegex = /^U9_CONVERSATION_NAMES_([^=]+)=(.*)$/gm;
  let match: RegExpExecArray | null;
  while ((match = nameRegex.exec(envContent)) !== null) names[match[1].trim()] = match[2].trim();
  return Array.from(new Set([...ids, ...Object.keys(names)])).map((id) => ({ id, name: names[id] || '' }));
}

async function migrateLegacyU9Conversations(): Promise<U9Conversation[]> {
  const sessions = readLegacyU9Conversations();
  if (sessions.length === 0) return [];
  if (await saveRemoteU9Conversations(sessions)) {
    const config = readRuntimeConfig();
    removeRuntimeConfig(Object.keys(config).filter((key) => key === 'U9_CONVERSATIONS' || key.startsWith('U9_CONVERSATION_NAMES_')));
  }
  return sessions;
}

/**
 * F functions keep runtime files in /tmp, which are cleared after a cold start.
 * Restore the active U9 configuration from the packaged local-login snapshot
 * before an endpoint attempts to call the U9 API.
 */
export async function ensureU9Configuration(): Promise<{ sessions: U9Conversation[]; source: U9ConversationLoad['source'] | 'runtime' }> {
  const envContent = readEnvFileContent();
  const readValue = (key: string) => process.env[key]?.trim()
    || envContent.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]?.trim()
    || '';
  const authId = readValue('U9_API_AUTH_ID');
  const authKey = readValue('U9_API_AUTH_KEY');
  const appId = readValue('U9_SDP_APP_ID');
  const refreshToken = readValue('U9_REFRESH_TOKEN');
  const envAuth: U9Auth | null = authId && authKey && appId ? {
    access_token: authId,
    mac_key: authKey,
    refresh_token: refreshToken || undefined,
    expires_at: readValue('U9_TOKEN_EXPIRES_AT') || undefined,
    diff: Number(readValue('U9_API_DIFF') || 0),
    user_id: readValue('U9_USER_ID') || '986916',
  } : null;
  const stored = await listRemoteU9Conversations();

  if (authId && authKey && appId && stored.length > 0) {
    // 已有会话目录时也必须检查 token；否则冷启动会一直沿用已过期凭据。
    if (envAuth && shouldRefreshU9Auth(envAuth)) {
      if (!envAuth.refresh_token) {
        throw new Error('99U 登录已失效，无法自动续期。请在本机重新登录 99U 后再同步认证。');
      }
      const refreshed = await refreshU9Auth(envAuth);
      await persistU9Configuration(refreshed, stored);
    }
    return { sessions: stored.map(({ id, name }) => ({ id, name })), source: 'u9_data_store' };
  }

  const legacy = await migrateLegacyU9Conversations();
  if (authId && authKey && appId && legacy.length > 0) {
    return { sessions: legacy, source: 'runtime' };
  }

  // FN 冷启动时没有本地运行时文件，但平台环境变量仍然可直接使用。
  // 先用它们恢复会话目录，避免误报“未找到本地登录快照”。
  if (authId && authKey && appId) {
    const activeAuth = envAuth && shouldRefreshU9Auth(envAuth)
      ? await refreshU9Auth(envAuth)
      : envAuth!;
    const loaded = await loadU9Conversations({
      ...activeAuth,
    });
    await persistU9Configuration(activeAuth, loaded.sessions);
    return loaded;
  }

  const storedAuth = readStoredU9Auth();
  if (!storedAuth) {
    throw new Error('未找到可用的本地 99U 登录快照。请先在本机登录 99U 后再同步认证。');
  }

  const activeAuth = shouldRefreshU9Auth(storedAuth)
    ? await refreshU9Auth(storedAuth)
    : storedAuth;
  const loaded = await loadU9Conversations(activeAuth);
  await persistU9Configuration(activeAuth, loaded.sessions);
  return loaded;
}

// ============= 从 99U 导入聊天记录 =============

router.post("/api/im/chat-records/import-u9", async (req, res) => {
  try {
    const { sourceId, convId, keyword, beginTime, endTime, maxMessages = 100 } = req.body;
    if (!sourceId || !convId) return res.status(400).json({ error: "sourceId 和 convId 不能为空" });

    const source = db.getImSource(sourceId);
    if (!source) return res.status(404).json({ error: "数据源不存在" });

    await ensureU9Configuration();
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
    if (isU9TokenExpired(error)) {
      return res.status(401).json({ error: '99U 授权已过期。请在「设置」中重新配置，系统会先尝试自动续期。' });
    }
    res.status(500).json({ error: error?.message || '导入失败' });
  }
});

// ============= 搜索 99U 消息 =============

router.post("/api/im/chat-records/search-u9", async (req, res) => {
  try {
    const { convId, keyword, beginTime, endTime, beforeMsgId, limit = 30 } = req.body;
    if (!convId) return res.status(400).json({ error: "convId 不能为空" });

    await ensureU9Configuration();
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
    const configured = await ensureU9Configuration();
    const conversations = configured.sessions.map((session) => ({
      id: session.id,
      name: session.name || `会话 ${session.id.slice(-6)}`,
    }));
    res.json({ conversations, total: conversations.length, source: configured.source });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || '获取会话列表失败' });
  }
});

// ============= 刷新会话列表 =============

router.post("/api/im/refresh-conversations", async (req, res) => {
  try {
    const configured = await ensureU9Configuration();
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

    const existingIds = new Set(configured.sessions.map((session) => session.id));
    const existingNames: Record<string, string> = Object.fromEntries(configured.sessions.map((session) => [session.id, session.name]));

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

    await saveRemoteU9Conversations(Array.from(existingIds).map((id) => ({ id, name: existingNames[id] || '' })));

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
    const configuredDirectory = await ensureU9Configuration();
    const envContent = readEnvFileContent();
    const readValue = (key: string) => process.env[key]?.trim()
      || envContent.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]?.trim()
      || '';
    const authId = readValue('U9_API_AUTH_ID');
    const authKey = readValue('U9_API_AUTH_KEY');
    const appId = readValue('U9_SDP_APP_ID');
    const baseUrl = readValue('U9_API_BASE_URL') || 'https://im-message-search.sdp.101.com';
    const configured = !!(authId && authKey && appId);
    const conversations = configuredDirectory.sessions.map((session) => session.id);

    res.json({ configured, hasAuthId: !!authId, hasAuthKey: !!authKey, hasAppId: !!appId, baseUrl, conversations, conversationsCount: conversations.length });
  } catch (error: any) {
    res.json({
      configured: false,
      hasAuthId: false,
      hasAuthKey: false,
      hasAppId: false,
      baseUrl: 'https://im-message-search.sdp.101.com',
      conversations: [],
      conversationsCount: 0,
      error: error?.message || '检查配置失败',
    });
  }
});

// ============= 自动登录（SSE）=============

let autoSetupBrowser: any = null;
let autoSetupSmsResolve: ((code: string) => void) | null = null;

router.post("/api/im/auto-setup", async (req, res) => {
  const { employeeId, password } = req.body;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const send = (type: string, data: any = {}) => {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
  };

  try {
    const storedAuth = readStoredU9Auth();
    if (storedAuth) {
      try {
        send('log', { message: '已从本地已登录认证快照获取 U9 凭据。' });
        let activeAuth = storedAuth;
        if (shouldRefreshU9Auth(storedAuth)) {
          send('log', { message: '正在续期即将过期的 U9 授权...' });
          activeAuth = await refreshU9Auth(storedAuth);
        }
        send('log', { message: '正在通过 U9 API 获取会话列表...' });
        const loaded = await loadU9Conversations(activeAuth);
        const { sessions } = loaded;
        if (loaded.source === 'local_chat_records') {
          send('log', { message: 'U9 会话目录为空，已从本地真实聊天记录恢复会话列表。' });
        }
        await persistU9Configuration(activeAuth, sessions);
        send('done', {
          message: `配置完成！获取到 ${sessions.length} 个会话`,
          sessions: sessions.length,
          userId: activeAuth.user_id,
          conversationIds: sessions.map((session) => session.id),
        });
        res.end();
        return;
      } catch (error) {
        if (process.platform === 'linux') throw error;
        send('log', { message: '本地认证快照已失效，转为浏览器重新登录。' });
      }
    }

    if (process.platform === 'linux') {
      throw new Error('未找到可用的 U9 认证快照。请先在本地登录 U9 并同步认证后重试。');
    }

    const { chromium } = await import('playwright');

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
        if (!employeeId || !password) {
          send('error', { message: '请在打开的浏览器中完成扫码登录；若使用密码登录，请在本地页面补充工号和密码后重试。' });
          await browser.close(); autoSetupBrowser = null; res.end(); return;
        }
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

    const authSnapshotPath = getU9AuthSnapshotPath();
    fs.mkdirSync(path.dirname(authSnapshotPath), { recursive: true });
    await context.storageState({ path: authSnapshotPath });
    const refreshedSnapshot = readStoredU9Auth();
    if (!refreshedSnapshot?.refresh_token) {
      send('error', { message: '已登录，但无法保存可续期的 U9 认证信息' });
      await browser.close(); autoSetupBrowser = null; res.end(); return;
    }
    const persistedAuth: U9Auth = { ...authInfo, refresh_token: refreshedSnapshot.refresh_token };

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
    send('log', { message: '保存认证并迁移会话目录到数据管理...' });

    await persistU9Configuration(persistedAuth, sessions);

    process.env.U9_API_AUTH_ID = authInfo.access_token;
    process.env.U9_API_AUTH_KEY = authInfo.mac_key;
    process.env.U9_SDP_APP_ID = 'b4fb92a0-af7f-49c2-b270-8f62afac1133';
    process.env.U9_API_DIFF = String(authInfo.diff || 0);

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

router.get("/api/debug-env", async (req, res) => {
  const conversations = await listRemoteU9Conversations();
  res.json({ conversationStore: 'mongo', conversations: conversations.length });
});

export default router;
