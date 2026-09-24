export type PersistedMeetingResult = {
  key: string;
  meetingId?: string;
  title?: string;
  startTime?: string;
  updatedAt: string;
  transcript?: string;
  summary?: string;
  todos?: string[];
  audioPath?: string;
  versions?: Array<{
    versionId: string;
    createdAt: string;
    transcript?: string;
    summary?: string;
    todos?: string[];
  }>;
};

function storeEndpoint(): string | null {
  const origin = process.env.OPENCLAW_INTERNAL_STORE_ORIGIN;
  const secret = process.env.OPENCLAW_INTERNAL_STORE_SECRET;
  if (!origin || !secret) return null;
  return `${origin}/api/internal/meeting-results`;
}

async function readStore(path = ''): Promise<Response | null> {
  const endpoint = storeEndpoint();
  if (!endpoint) return null;
  try {
    return await fetch(`${endpoint}${path}`, {
      headers: { 'x-openclaw-internal-store': process.env.OPENCLAW_INTERNAL_STORE_SECRET || '' },
    });
  } catch {
    return null;
  }
}

export async function loadRemoteMeetingResult(key: string): Promise<PersistedMeetingResult | null> {
  const response = await readStore(`?key=${encodeURIComponent(key)}`);
  if (!response?.ok) return null;
  const data = await response.json() as { result?: PersistedMeetingResult | null };
  return data.result || null;
}

export async function saveRemoteMeetingResult(result: PersistedMeetingResult): Promise<boolean> {
  const endpoint = storeEndpoint();
  if (!endpoint) return false;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-openclaw-internal-store': process.env.OPENCLAW_INTERNAL_STORE_SECRET || '',
    },
    body: JSON.stringify({ result }),
  });
  if (!response.ok) throw new Error('会议转录持久化失败，请稍后重试。');
  return true;
}

export async function listRemoteMeetingResults(limit: number): Promise<PersistedMeetingResult[]> {
  const response = await readStore(`?limit=${Math.min(Math.max(limit, 1), 1000)}`);
  if (!response?.ok) return [];
  const data = await response.json() as { results?: PersistedMeetingResult[] };
  return Array.isArray(data.results) ? data.results : [];
}
