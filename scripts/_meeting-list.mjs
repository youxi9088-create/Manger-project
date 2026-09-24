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

const all = [];
for (let offset = 0; offset < 500; offset += 100) {
  const u = new URL(`https://nd-meeting-extend.sdp.101.com/v2/api/files?$limit=100&$offset=${offset}&status=all`);
  const res = await fetch(u, {
    headers: { Authorization: macAuth('GET', u.pathname, u.host), 'nd-meeting-token': meetingToken, 'accept-language': 'zh-CN' },
  });
  const json = await res.json();
  const items = json.items || [];
  all.push(...items);
  if (items.length < 100) break;
}
console.log('total:', all.length);
for (const it of all.slice(0, 30)) {
  const ext = (() => { try { return JSON.parse(it.extend_info || '{}'); } catch { return {}; } })();
  console.log([
    it.begin_time,
    'conf=' + it.conference_id,
    'file=' + it.file_id,
    'dur=' + it.duration + 's',
    (it.file_size / 1048576).toFixed(0) + 'MB',
    'name=' + it.name,
    'file_name=' + it.file_name,
    'mp3=' + (ext.mp3_url ? 'Y' : 'N'),
  ].join(' | '));
}
