export type PersistedMeetingIntelligence = {
  meetingId: string;
  title?: string;
  startTime?: string;
  result: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

function storeEndpoint(): string | null {
  const origin = process.env.OPENCLAW_INTERNAL_STORE_ORIGIN;
  const secret = process.env.OPENCLAW_INTERNAL_STORE_SECRET;
  if (!origin || !secret) return null;
  return `${origin}/api/internal/meeting-intelligence`;
}

function storeHeaders() {
  return { 'x-openclaw-internal-store': process.env.OPENCLAW_INTERNAL_STORE_SECRET || '' };
}

export async function loadRemoteMeetingIntelligence(meetingId: string): Promise<PersistedMeetingIntelligence | null> {
  const endpoint = storeEndpoint();
  if (!endpoint || !meetingId) return null;
  try {
    const response = await fetch(`${endpoint}?meetingId=${encodeURIComponent(meetingId)}`, { headers: storeHeaders() });
    if (!response.ok) return null;
    const data = await response.json() as { intelligence?: PersistedMeetingIntelligence | null };
    return data.intelligence || null;
  } catch {
    return null;
  }
}

export async function saveRemoteMeetingIntelligence(intelligence: PersistedMeetingIntelligence): Promise<boolean> {
  const endpoint = storeEndpoint();
  if (!endpoint) return false;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...storeHeaders() },
    body: JSON.stringify({ intelligence }),
  });
  if (!response.ok) throw new Error('会议深度分析持久化失败，请稍后重试。');
  return true;
}

export async function deleteRemoteMeetingIntelligence(meetingId: string): Promise<boolean> {
  const endpoint = storeEndpoint();
  if (!endpoint || !meetingId) return false;
  const response = await fetch(`${endpoint}?meetingId=${encodeURIComponent(meetingId)}`, {
    method: 'DELETE',
    headers: storeHeaders(),
  });
  return response.ok;
}
