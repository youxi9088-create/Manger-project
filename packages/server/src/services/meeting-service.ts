import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import {
  listRemoteMeetingResults,
  loadRemoteMeetingResult,
  PersistedMeetingResult,
  saveRemoteMeetingResult,
} from './meeting-result-store.js';

// ====== 本地持久化转录结果（用于刷新后保持“已转录”状态）======
// 说明：列表返回的 meetingId 可能不稳定（每次刷新变化），因此这里使用稳定键（title + startTime）来做持久化。

function stableKeyOf(title?: string, startTime?: string) {
  const t = String(title || '').trim();
  const s = String(startTime || '').trim();
  return `${s}__${t}`;
}

function fileSafeSlug(s: string) {
  // 简单做文件名安全处理：保留中文，替换 Windows 不允许字符
  return s
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
}

function getResultFilePathByKey(key: string, dataDir: string) {
  const slug = fileSafeSlug(key);
  return path.join(dataDir, `result__${slug}.json`);
}

function loadPersistedResultByKey(key: string, dataDir: string): PersistedMeetingResult | null {
  try {
    const p = getResultFilePathByKey(key, dataDir);
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function listLocalPersistedResults(dataDir: string, limit: number): PersistedMeetingResult[] {
  if (!fs.existsSync(dataDir)) return [];
  return fs.readdirSync(dataDir)
    .filter((name) => name.startsWith('result__') && name.endsWith('.json'))
    .map((name) => loadPersistedResultByKey(name.slice('result__'.length, -'.json'.length), dataDir))
    .filter((result): result is PersistedMeetingResult => Boolean(result))
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
    .slice(0, limit);
}

function newVersionId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function savePersistedResultByKey(result: PersistedMeetingResult, dataDir: string) {
  try {
    const p = getResultFilePathByKey(result.key, dataDir);
    fs.writeFileSync(p, JSON.stringify(result, null, 2), 'utf-8');
  } catch (e) {
    console.log('保存转录结果失败:', e);
  }
}

const MEETING_API_BASE = 'https://ndmeeting-personal-management.sdp.101.com';
const MEETING_EXTEND_API = 'https://nd-meeting-extend.sdp.101.com';
const USERNAME = process.env.MEETING_USERNAME || '986916';
const PASSWORD = process.env.MEETING_PASSWORD || 'Youxi0921';
const DATA_DIR = process.env.MEETING_DATA_DIR || path.resolve(process.cwd(), 'data', 'meetings');

// 认证文件路径（优先使用 im-chat-analyzer 目录下的）
const AUTH_FILE_PATHS = [
  path.resolve(process.cwd(), 'data', 'auth', 'meeting-auth.json'),
  path.resolve(process.cwd(), 'packages', 'server', 'data', 'auth', 'meeting-auth.json'),
  'F:/个人/app/im-chat-analyzer/meeting-auth.json',
  'F:/个人/app/claw studio/meeting-auth.json',
];

// 生成 MAC Authorization header（用于 gcdncs.101.com 下载认证）
function generateMacAuth(method: string, uri: string, host: string, authInfo: AuthInfo): string {
  const diff = (globalThis as any).__uc_diff || 0;
  const timestamp = Date.now() + diff;
  const randomStr = crypto.randomBytes(4).toString('hex').toUpperCase();
  const nonce = `${timestamp}:${randomStr}`;
  const macData = `${nonce}\n${method.toUpperCase()}\n${uri}\n${host}\n`;
  const mac = crypto.createHmac('sha256', authInfo.macKey).update(macData).digest('base64');
  return `MAC id="${authInfo.accessToken}",nonce="${nonce}",mac="${mac}"`;
}

// Node.js 18+ 已内置全局 fetch（Next.js App Router 运行时亦支持）
const fetchFn: typeof fetch = (...args: Parameters<typeof fetch>) => fetch(...args);

export interface MeetingRecord {
  meetingId: string;
  title: string;
  startTime: string;
  recorder: string;
  duration: string;
  fileSize: string;
  videoUrl?: string;
  audioUrl?: string;
  status: 'pending' | 'transcribing' | 'completed';
  transcript?: string;
  summary?: string;
  todos?: string[];
  audioPath?: string;
}

let sessionCookie = '';
let browserCookies: string[] = [];
let cachedAuthInfo: AuthInfo | null = null;

interface AuthInfo {
  accessToken: string;
  macKey: string;
  userId: string;
  tenantId: string;
  token: string; // meeting token
  serverTime: number;
}

// 从认证文件加载认证信息
function loadAuthFromFile(): AuthInfo | null {
  const authPaths = AUTH_FILE_PATHS
    .filter((authPath) => fs.existsSync(authPath))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);

  for (const authPath of authPaths) {
    try {
      if (fs.existsSync(authPath)) {
        const content = fs.readFileSync(authPath, 'utf-8');
        const authData = JSON.parse(content);

        // 解析 localStorage 中的认证信息
        const origins = authData.origins || [];
        for (const origin of origins) {
          if (origin.origin?.includes('ndmeeting')) {
            const localStorage = origin.localStorage || [];

            let accessToken = '';
            let macKey = '';
            let userId = '';
            let tenantId = '';
            let meetingToken = '';

            for (const item of localStorage) {
              // 解析 UC 认证 token
              if (item.name?.includes('ND_UC_AUTH') && item.name?.includes('token')) {
                try {
                  const tokenData = JSON.parse(item.value);
                  // tokenData.value 可能是字符串或对象
                  const innerData = typeof tokenData.value === 'string'
                    ? JSON.parse(tokenData.value)
                    : tokenData.value;
                  accessToken = innerData.access_token || '';
                  macKey = innerData.mac_key || '';
                  userId = innerData.user_id || '';
                  // diff 用于时间戳校准
                  if (typeof innerData.diff === 'number') {
                    (globalThis as any).__uc_diff = innerData.diff;
                  }
                } catch (e) {
                  console.log('解析 UC token 失败:', e);
                }
              }

              // 解析 meeting user info
              if (item.name?.includes('personal_meeting_user_info')) {
                try {
                  const userInfoData = JSON.parse(item.value);
                  // userInfoData.value 可能是字符串或对象
                  const innerData = typeof userInfoData.value === 'string'
                    ? JSON.parse(userInfoData.value)
                    : (userInfoData.value || userInfoData);
                  meetingToken = innerData.token || '';
                  tenantId = innerData.tenant_info?.tenant_id || '';
                  if (!userId) {
                    userId = innerData.user_info?.user_id || '';
                  }
                } catch (e) {
                  console.log('解析 meeting user info 失败:', e);
                }
              }
            }

            if (accessToken && macKey) {
              console.log('✓ 从认证文件加载认证信息成功:', authPath);
              console.log('  用户ID:', userId, '有meetingToken:', !!meetingToken);
              return {
                accessToken,
                macKey,
                userId,
                tenantId,
                token: meetingToken,
                serverTime: Date.now(),
              };
            }
          }
        }
      }
    } catch (e) {
      console.log('读取认证文件失败:', authPath, e);
    }
  }
  console.log('未找到有效的认证文件');
  return null;
}

class MeetingAPIService {
  private baseUrl = MEETING_API_BASE;
  private extendUrl = MEETING_EXTEND_API;
  private authKey = Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64');
  private authInfo: AuthInfo | null = null;

  constructor() {
    // 初始化时尝试加载认证信息
    this.authInfo = loadAuthFromFile();
    cachedAuthInfo = this.authInfo;
  }

  async fetchWithAuth(url: string, options: any = {}) {
    const headers = {
      'Authorization': `Basic ${this.authKey}`,
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (sessionCookie) {
      headers['Cookie'] = sessionCookie;
    }

    const response = await fetchFn(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      throw new Error(`API请求失败: ${response.status} ${response.statusText}`);
    }

    return response;
  }

  async login(): Promise<boolean> {
    console.log('执行网龙会议系统登录...');

    try {
      const loginUrl = `${this.baseUrl}/api/v1/auth/login`;
      const response = await fetchFn(loginUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${this.authKey}`,
        },
        body: JSON.stringify({
          username: USERNAME,
          password: PASSWORD,
        }),
      });

      if (response.ok) {
        const cookies = response.headers.get('set-cookie');
        if (cookies) {
          sessionCookie = cookies.split(';')[0];
          console.log('登录成功');
          return true;
        }
      }

      console.log('使用浏览器方式进行登录...');
      return await this.browserLogin();
    } catch (error) {
      console.log('API登录失败，使用浏览器方式:', error);
      return await this.browserLogin();
    }
  }

  async browserLogin(): Promise<boolean> {
    console.log('通过浏览器扩展方式登录网龙会议系统...');

    try {
      const mcpUrl = 'http://localhost:3003/api/meeting-login';
      const response = await fetchFn(mcpUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: USERNAME,
          password: PASSWORD,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.cookies) {
          browserCookies = data.cookies;
          sessionCookie = data.cookies[0];
          console.log('浏览器扩展登录成功');
          return true;
        }
      }
    } catch (error) {
      console.log('浏览器扩展未运行，尝试直接访问网站...');
    }

    return await this.manualLogin();
  }

  async manualLogin(): Promise<boolean> {
    console.log('请手动登录网龙会议系统，登录后接口将自动获取数据');
    return false;
  }

  // The web client lists cloud recordings from the meeting service's files API.
  // It authenticates with both UC MAC auth and the meeting token; the old
  // /record/list guesses return an authorization denial from this service.
  async fetchMeetingListWithToken(): Promise<MeetingRecord[]> {
    if (!this.authInfo?.token || !this.authInfo.accessToken || !this.authInfo.macKey) {
      throw new Error('未找到有效的认证 token');
    }

    const pageSize = 100;
    const records: MeetingRecord[] = [];
    for (let offset = 0; offset < 1_000; offset += pageSize) {
      const apiUrl = new URL('https://nd-meeting-extend.sdp.101.com/v2/api/files');
      apiUrl.searchParams.set('$limit', String(pageSize));
      apiUrl.searchParams.set('$offset', String(offset));
      apiUrl.searchParams.set('status', 'all');
      const response = await fetchFn(apiUrl, {
        method: 'GET',
        headers: {
          Authorization: generateMacAuth('GET', apiUrl.pathname, apiUrl.host, this.authInfo),
          'nd-meeting-token': this.authInfo.token,
          'accept-language': 'zh-CN',
        },
      });
      if (!response.ok) throw new Error(`会议录制列表请求失败: ${response.status}`);
      const data = await response.json();
      const page = this.parseMeetingRecords(data);
      records.push(...page);
      if (page.length < pageSize) break;
    }

    const persistedByKey = new Map((await this.listMeetingResults(1_000)).map((item) => [item.key, item]));
    const uniqueRecords = Array.from(new Map(records.map((record) => [record.meetingId, record])).values());
    const hydrated = uniqueRecords.map((record) => {
      const persisted = persistedByKey.get(stableKeyOf(record.title, record.startTime));
      if (!persisted?.transcript) return record;
      return {
        ...record,
        status: 'completed' as const,
        transcript: persisted.transcript,
        summary: persisted.summary,
        todos: persisted.todos || [],
      };
    });
    console.log(`会议录制列表返回 ${hydrated.length} 条记录`);
    return hydrated;
  }

  async fetchMeetingList(): Promise<MeetingRecord[]> {
    console.log('获取会议列表...');

    // 优先使用保存的认证信息调用真实 API
    if (this.authInfo?.token) {
      try {
        const records = await this.fetchMeetingListWithToken();
        if (records.length > 0) {
          return records;
        }
      } catch (error) {
        console.log('Token API 获取失败:', error);
      }
    }

    const headers: any = {
      'Content-Type': 'application/json',
    };

    if (sessionCookie) {
      headers['Cookie'] = sessionCookie;
    }

    try {
      const apiUrl = `${this.baseUrl}/api/v1/recordings`;
      const response = await fetchFn(apiUrl, {
        method: 'GET',
        headers,
      });

      if (response.ok) {
        const data = await response.json();
        return this.parseMeetingRecords(data);
      }
    } catch (error) {
      console.log('API 获取失败，尝试备用方式:', error);
    }

    return this.getMockRecords();
  }

  async fetchMeetingListFromWeb(): Promise<MeetingRecord[]> {
    console.log('从网页获取会议列表...');

    // 优先尝试 im-chat-analyzer 的 API（它使用 Playwright 自动化浏览器）
    try {
      const imApiUrl = 'http://localhost:3001/api/meetings';
      console.log('尝试 im-chat-analyzer API:', imApiUrl);
      const response = await fetchFn(imApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.records && data.records.length > 0) {
          console.log(`✓ 成功从 im-chat-analyzer 获取 ${data.records.length} 条会议记录`);
          // 合并本地已转录的结果，确保刷新后状态保持（按 title+startTime 作为稳定键）
          return (data.records as MeetingRecord[]).map((r) => {
            const key = stableKeyOf(r.title, r.startTime);
            const persisted = loadPersistedResultByKey(key, DATA_DIR);
            if (!persisted) return r;
            return {
              ...r,
              status: 'completed',
              transcript: persisted.transcript || r.transcript,
              summary: persisted.summary || r.summary,
              todos: persisted.todos || r.todos,
              audioPath: persisted.audioPath || r.audioPath,
            };
          });
        }
      }
    } catch (error) {
      console.log('im-chat-analyzer API 未运行:', error);
    }

    // 尝试使用保存的认证信息调用 ndmeeting API
    if (this.authInfo?.token) {
      try {
        const records = await this.fetchMeetingListWithToken();
        if (records.length > 0) {
          console.log(`✓ 成功获取 ${records.length} 条会议记录`);
          // 合并本地已转录的结果，确保刷新后状态保持（按 title+startTime 作为稳定键）
          return records.map((r) => {
            const key = stableKeyOf(r.title, r.startTime);
            const persisted = loadPersistedResultByKey(key, DATA_DIR);
            if (!persisted) return r;
            return {
              ...r,
              status: 'completed',
              transcript: persisted.transcript || r.transcript,
              summary: persisted.summary || r.summary,
              todos: persisted.todos || r.todos,
              audioPath: persisted.audioPath || r.audioPath,
            };
          });
        }
      } catch (error) {
        console.log('Token API 获取失败，尝试 MCP 服务:', error);
      }
    }

    try {
      const mcpUrl = 'http://localhost:3003/api/meetings';
      const response = await fetchFn(mcpUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.records) {
          return data.records;
        }
      }
    } catch (error) {
      console.log('MCP 服务未运行');
    }

    return this.getMockRecords();
  }

  private parseMeetingRecords(data: any): MeetingRecord[] {
    if (!data.items && !data.list && !data.data) {
      return [];
    }

    // 平台在 extend_info.mp3_url 中提供独立的纯音频文件，
    // 体积远小于 MP4 录像（约 1/5），转写/下载应优先使用。
    const extractMp3Url = (item: any): string | undefined => {
      try {
        const info = typeof item.extend_info === 'string' ? JSON.parse(item.extend_info) : item.extend_info;
        const url = info?.mp3_url;
        return typeof url === 'string' && url ? url : undefined;
      } catch {
        return undefined;
      }
    };

    const list = data.items || data.list || data.data || [];
    return list.map((item: any) => ({
      meetingId: item.id || item.file_id || item.meetingId || item.recordId,
      title: item.title || item.subject || item.name || item.file_name || '会议',
      startTime: item.startTime || item.start_time || item.begin_time || item.createTime || item.created_at || item.createdAt || '',
      recorder: item.recorder || item.owner || item.creator || item.user_name || item.uid_name || USERNAME,
      duration: item.duration || item.record_time || '00:00:00',
      fileSize: item.fileSize || item.file_size || item.size || '0B',
      videoUrl: item.videoUrl || item.video || item.url,
      audioUrl: item.audioUrl || item.audio || extractMp3Url(item) || item.url,
      status: 'pending',
    }));
  }

  private getMockRecords(): MeetingRecord[] {
    console.log('返回模拟数据（请先登录网龙会议系统）');
    return [
      {
        meetingId: '1001',
        title: '项目周会',
        startTime: new Date().toISOString(),
        recorder: USERNAME,
        duration: '01:30:00',
        fileSize: '256MB',
        status: 'pending',
      },
      {
        meetingId: '1002',
        title: '需求评审会',
        startTime: new Date(Date.now() - 86400000).toISOString(),
        recorder: USERNAME,
        duration: '02:00:00',
        fileSize: '512MB',
        status: 'pending',
      },
    ];
  }

  async downloadMedia(
    meetingId: string,
    format: 'video' | 'audio',
    directUrl?: string,
    options?: { forceRefresh?: boolean },
  ): Promise<string> {
    console.log(`下载会议 ${meetingId} 的${format}文件...`);

    const dataDir = DATA_DIR;
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // 检查本地是否已有有效音频文件（>10KB），有则直接复用；forceRefresh 时删除旧文件强制重新下载
    const existingExts = ['mp3', 'm4a', 'wav', 'mp4'];
    for (const ext of existingExts) {
      const candidate = path.join(dataDir, `${meetingId}_${format}.${ext}`);
      if (fs.existsSync(candidate)) {
        if (options?.forceRefresh) {
          fs.rmSync(candidate, { force: true });
          console.log(`强制刷新：已删除旧文件 ${candidate}`);
          continue;
        }
        const stat = fs.statSync(candidate);
        if (stat.size > 10000) {
          console.log(`✓ 复用已有音频文件: ${candidate} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);
          return candidate;
        }
      }
    }

    const guessExtFromUrl = (url?: string) => {
      try {
        if (!url) return '';
        const u = new URL(url);
        const name = u.searchParams.get('name') || '';
        const m = name.match(/\.([a-zA-Z0-9]{2,5})$/);
        if (m?.[1]) return m[1].toLowerCase();
        const m2 = u.pathname.match(/\.([a-zA-Z0-9]{2,5})$/);
        if (m2?.[1]) return m2[1].toLowerCase();
      } catch {
        // ignore
      }
      return '';
    };

    const extFromContentType = (contentType: string) => {
      const ct = contentType.toLowerCase();
      if (ct.includes('mpeg') || ct.includes('mp3')) return 'mp3';
      if (ct.includes('wav')) return 'wav';
      if (ct.includes('ogg')) return 'ogg';
      if (ct.includes('m4a') || ct.includes('x-m4a') || ct.includes('aac')) return 'm4a';
      return 'mp4';
    };

    // 平台直链没有扩展名，以响应 Content-Type 为准（mp3_url 返回 audio/mpeg）
    const urlExt = directUrl ? guessExtFromUrl(directUrl) : '';
    const ext = urlExt || 'mp4';
    const fileName = `${meetingId}_${format}.${ext}`;
    const filePath = path.join(dataDir, fileName);

    // 1) 如果给了真实直链（例如 gcdncs 下载链接），优先使用直链下载
    if (directUrl) {
      const target = new URL(directUrl);
      console.log(`下载会议媒体: ${target.origin}${target.pathname}`);
      try {
        // 构建下载请求头，gcdncs.101.com 需要 MAC 认证
        const downloadHeaders: Record<string, string> = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': '*/*',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Referer': 'https://ndmeeting-personal-management.sdp.101.com/',
        };

        // 如果有有效认证信息且是 gcdncs 链接，添加 MAC Authorization
        const authForDownload = cachedAuthInfo || loadAuthFromFile();
        if (authForDownload?.accessToken && authForDownload?.macKey && directUrl.includes('gcdncs.101.com')) {
          try {
            const urlObj = new URL(directUrl);
            const uri = urlObj.pathname + urlObj.search;
            const host = urlObj.host;
            downloadHeaders['Authorization'] = generateMacAuth('GET', uri, host, authForDownload);
            console.log('已添加 MAC Authorization header');
          } catch (e) {
            console.log('生成 MAC auth 失败:', e);
          }
        }

        if (sessionCookie) {
          downloadHeaders['Cookie'] = sessionCookie;
        }

        const response = await fetchFn(directUrl, {
          method: 'GET',
          headers: downloadHeaders,
        });

        if (!response.ok) {
          throw new Error(`directUrl 下载失败: ${response.status} ${response.statusText}`);
        }

        if (response.body) {
          const resolvedExt = urlExt || extFromContentType(response.headers.get('content-type') || '');
          const resolvedPath = path.join(dataDir, `${meetingId}_${format}.${resolvedExt}`);
          const nodeStream = Readable.fromWeb(response.body as any);
          await pipeline(nodeStream, fs.createWriteStream(resolvedPath));

          // 验证下载的文件是否是有效音频（防止 HTML 登录页被存为 mp3）
          const stat = fs.statSync(resolvedPath);
          if (stat.size < 10000) {
            // 文件太小，可能是错误响应
            const head = fs.readFileSync(resolvedPath, 'utf-8').slice(0, 200);
            if (head.includes('<!doctype') || head.includes('<html') || head.includes('{')) {
              console.log(`⚠️ 下载的文件不是有效音频（${stat.size} 字节），内容: ${head.slice(0, 100)}`);
              fs.unlinkSync(resolvedPath);
              throw new Error(`音频下载返回了非音频内容（${stat.size} 字节），可能需要重新登录会议系统`);
            }
          }

          console.log(`直链下载完成: ${resolvedPath} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);
          // 直链已成功下载：直接返回，避免继续回退到会议系统下载导致再次写入其它格式文件
          return resolvedPath;
        }
      } catch (e) {
        console.log('直链下载失败，回退到会议系统下载:', e);
      }
    }

    // 2) 会议系统下载（原逻辑）
    try {
      const headers: any = {
        'Cookie': sessionCookie,
      };

      // 如果是 audio 但未提供直链，则会议系统接口可能返回 mp4 容器音频；这里保持原行为。
      const downloadUrl = `${this.baseUrl}/api/v1/recordings/${meetingId}/${format}`;
      const response = await fetchFn(downloadUrl, {
        method: 'GET',
        headers,
      });

      if (response.ok && response.body) {
        const nodeStream = Readable.fromWeb(response.body as any);
        await pipeline(nodeStream, fs.createWriteStream(filePath));
        console.log(`下载完成: ${filePath}`);
        return filePath;
      }
    } catch (error) {
      console.log('API 下载失败，尝试 MCP 扩展:', error);
    }

    try {
      const mcpUrl = 'http://localhost:3003/api/download';
      const response = await fetchFn(mcpUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingId, format }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.filePath && fs.existsSync(data.filePath)) {
          return data.filePath;
        }
      }
    } catch (error) {
      console.log('MCP 下载失败');
    }

    throw new Error(`无法下载会议 ${meetingId} 的真实${format}文件`);
  }

  // 供 API 使用：在 process 成功转录/生成纪要后持久化结果
  async getMeetingResultLatest(params: { title?: string; startTime?: string }) {
    const key = stableKeyOf(params.title, params.startTime);
    if (!key.trim()) return null;
    return (await loadRemoteMeetingResult(key)) || loadPersistedResultByKey(key, DATA_DIR);
  }

  async listMeetingResultVersions(params: { title?: string; startTime?: string }) {
    const latest = await this.getMeetingResultLatest(params);
    return latest?.versions || [];
  }

  async listMeetingResults(limit = 200): Promise<PersistedMeetingResult[]> {
    const [remote, local] = await Promise.all([
      listRemoteMeetingResults(limit),
      Promise.resolve(listLocalPersistedResults(DATA_DIR, limit)),
    ]);
    const results = new Map<string, PersistedMeetingResult>();
    for (const result of local) results.set(result.key, result);
    for (const result of remote) results.set(result.key, result);
    return Array.from(results.values())
      .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
      .slice(0, limit);
  }

  async persistMeetingResult(params: {
    meetingId: string;
    title?: string;
    startTime?: string;
    transcript?: string;
    summary?: string;
    todos?: string[];
    audioPath?: string;
  }) {
    const key = stableKeyOf(params.title, params.startTime);
    if (!key.trim()) return;

    const prev = loadPersistedResultByKey(key, DATA_DIR);
    const version = {
      versionId: newVersionId(),
      createdAt: new Date().toISOString(),
      transcript: params.transcript,
      summary: params.summary,
      todos: params.todos,
    };

    const versions = [version, ...(prev?.versions || [])].slice(0, 20);

    const result: PersistedMeetingResult = {
      key,
      meetingId: params.meetingId,
      title: params.title,
      startTime: params.startTime,
      updatedAt: new Date().toISOString(),
      transcript: params.transcript,
      summary: params.summary,
      todos: params.todos,
      audioPath: params.audioPath,
      versions,
    };
    savePersistedResultByKey(result, DATA_DIR);
    await saveRemoteMeetingResult(result);
  }

  cleanupOldMeetingMedia(params?: { retentionDays?: number }) {
    const retentionDays = params?.retentionDays ?? 90; // 约3个月
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

    try {
      if (!fs.existsSync(DATA_DIR)) return { deleted: 0, scanned: 0 };
      const files = fs.readdirSync(DATA_DIR);

      let deleted = 0;
      let scanned = 0;

      for (const f of files) {
        const full = path.join(DATA_DIR, f);
        scanned++;

        // 保留纪要/版本文件
        if (f.startsWith('result__') && f.endsWith('.json')) continue;

        // 仅清理媒体文件
        const lower = f.toLowerCase();
        const isMedia = ['.mp3', '.mp4', '.m4a', '.wav', '.ogg'].some((ext) => lower.endsWith(ext));
        if (!isMedia) continue;

        const stat = fs.statSync(full);
        if (stat.mtimeMs < cutoff) {
          fs.unlinkSync(full);
          deleted++;
        }
      }

      return { deleted, scanned };
    } catch (e) {
      console.log('清理旧音频失败:', e);
      return { deleted: 0, scanned: 0, error: String((e as any)?.message || e) } as any;
    }
  }
}

export const meetingService = new MeetingAPIService();
export default meetingService;
