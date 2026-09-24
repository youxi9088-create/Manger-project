import fs from 'node:fs';
import crypto from 'node:crypto';

const content = fs.readFileSync('./packages/server/data/auth/meeting-auth.json', 'utf-8');
const authData = JSON.parse(content);
let accessToken = '', macKey = '', meetingToken = '';
for (const origin of authData.origins || []) {
  if (!origin.origin?.includes('ndmeeting')) continue;
  for (const item of origin.localStorage || []) {
    if (item.name?.includes('ND_UC_AUTH') && item.name?.includes('token')) {
      const tokenData = JSON.parse(item.value);
      const inner = typeof tokenData.value === 'string' ? JSON.parse(tokenData.value) : tokenData.value;
      accessToken = inner.access_token || '';
      macKey = inner.mac_key || '';
      if (typeof inner.diff === 'number') globalThis.__uc_diff = inner.diff;
    }
    if (item.name?.includes('personal_meeting_user_info')) {
      const userInfoData = JSON.parse(item.value);
      const innerData = typeof userInfoData.value === 'string' ? JSON.parse(userInfoData.value) : (userInfoData.value || userInfoData);
      meetingToken = innerData.token || '';
    }
  }
}

function macAuth(method, uri, host) {
  const timestamp = Date.now() + (globalThis.__uc_diff || 0);
  const nonce = `${timestamp}:${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const mac = crypto.createHmac('sha256', macKey).update(`${nonce}\n${method.toUpperCase()}\n${uri}\n${host}\n`).digest('base64');
  return `MAC id="${accessToken}",nonce="${nonce}",mac="${mac}"`;
}

async function apiGet(url) {
  const u = new URL(url);
  const res = await fetch(u, {
    headers: { Authorization: macAuth('GET', u.pathname, u.host), 'nd-meeting-token': meetingToken, 'accept-language': 'zh-CN' },
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

// 1) 文件完整详情（全部字段）
const detail = await apiGet('https://nd-meeting-extend.sdp.101.com/v2/api/files/849701838534475776-0-0-382');
console.log('=== FILE DETAIL', detail.status, '===');
if (typeof detail.json === 'object') {
  for (const [k, v] of Object.entries(detail.json)) {
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    console.log(`  ${k}: ${String(s).slice(0, 300)}`);
  }
} else console.log(String(detail.json).slice(0, 500));

// 2) 探测平台是否有转写/字幕/纪要类接口
const probes = [
  '/v2/api/files/849701838534475776-0-0-382/transcript',
  '/v2/api/files/849701838534475776-0-0-382/subtitle',
  '/v2/api/files/849701838534475776-0-0-382/minutes',
  '/v2/api/transcripts?file_id=849701838534475776-0-0-382',
  '/v2/api/subtitles?file_id=849701838534475776-0-0-382',
  '/v2/api/minutes?conference_id=740269448',
  '/v2/api/conferences/740269448',
  '/v2/api/conferences/740269448/transcript',
  '/v2/api/conferences/740269448/files',
];
for (const p of probes) {
  const { status, json } = await apiGet('https://nd-meeting-extend.sdp.101.com' + p);
  const body = typeof json === 'string' ? json.slice(0, 150) : JSON.stringify(json).slice(0, 400);
  console.log(`--- GET ${p} -> ${status}: ${body}`);
}
