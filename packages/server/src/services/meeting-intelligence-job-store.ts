export type MeetingIntelligenceJob = {
  jobId: string;
  meetingId: string;
  status: 'queued' | 'analyzing' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
  error?: string;
};

const localJobs = new Map<string, MeetingIntelligenceJob>();

function storeEndpoint(): string | null {
  const origin = process.env.OPENCLAW_INTERNAL_STORE_ORIGIN;
  const secret = process.env.OPENCLAW_INTERNAL_STORE_SECRET;
  if (!origin || !secret) return null;
  return `${origin}/api/internal/meeting-intelligence-jobs`;
}

function storeHeaders() {
  return { 'x-openclaw-internal-store': process.env.OPENCLAW_INTERNAL_STORE_SECRET || '' };
}

export async function saveMeetingIntelligenceJob(job: MeetingIntelligenceJob): Promise<void> {
  localJobs.set(job.jobId, job);
  const endpoint = storeEndpoint();
  if (!endpoint) return;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...storeHeaders() },
    body: JSON.stringify({ job }),
  });
  if (!response.ok) throw new Error('会议分析任务状态保存失败');
}

export async function loadMeetingIntelligenceJob(jobId: string): Promise<MeetingIntelligenceJob | null> {
  const endpoint = storeEndpoint();
  if (!endpoint) return localJobs.get(jobId) || null;
  try {
    const response = await fetch(`${endpoint}?jobId=${encodeURIComponent(jobId)}`, { headers: storeHeaders() });
    if (!response.ok) return localJobs.get(jobId) || null;
    const data = await response.json() as { job?: MeetingIntelligenceJob | null };
    return data.job || localJobs.get(jobId) || null;
  } catch {
    return localJobs.get(jobId) || null;
  }
}
