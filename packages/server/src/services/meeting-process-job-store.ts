import path from "path";
import fs from "fs";

export type MeetingProcessJob = {
  jobId: string;
  meetingId: string;
  title?: string;
  startTime?: string;
  status: 'queued' | 'downloading' | 'transcribing' | 'summarizing' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
  result?: { transcript: string; summary: string; todos: string[] };
  error?: string;
};

const localJobs = new Map<string, MeetingProcessJob>();

const JOBS_DIR = path.join(
  process.env.MEETING_DATA_DIR || path.resolve(process.cwd(), 'data', 'meetings'),
  'process-jobs',
);

function jobPath(jobId: string) {
  return path.join(JOBS_DIR, `${jobId}.json`);
}

function storeEndpoint(): string | null {
  const origin = process.env.OPENCLAW_INTERNAL_STORE_ORIGIN;
  const secret = process.env.OPENCLAW_INTERNAL_STORE_SECRET;
  if (!origin || !secret) return null;
  return `${origin}/api/internal/meeting-process-jobs`;
}

function storeHeaders() {
  return { 'x-openclaw-internal-store': process.env.OPENCLAW_INTERNAL_STORE_SECRET || '' };
}

export async function saveMeetingProcessJob(job: MeetingProcessJob): Promise<void> {
  localJobs.set(job.jobId, job);
  try {
    fs.mkdirSync(JOBS_DIR, { recursive: true });
    fs.writeFileSync(jobPath(job.jobId), JSON.stringify(job), 'utf8');
  } catch (error) {
    console.error(`[Meeting process ${job.jobId}] 保存任务状态失败`, error);
  }
  const endpoint = storeEndpoint();
  if (!endpoint) return;
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...storeHeaders() },
      body: JSON.stringify({ job }),
    });
    if (!response.ok) {
      console.error(`[Meeting process ${job.jobId}] 远端任务状态保存失败: ${response.status}`);
    }
  } catch (error) {
    console.error(`[Meeting process ${job.jobId}] 远端任务状态保存异常`, error);
  }
}

export async function loadMeetingProcessJob(jobId: string): Promise<MeetingProcessJob | null> {
  const endpoint = storeEndpoint();
  if (endpoint) {
    try {
      const response = await fetch(`${endpoint}?jobId=${encodeURIComponent(jobId)}`, { headers: storeHeaders() });
      if (response.ok) {
        const data = (await response.json()) as { job?: MeetingProcessJob | null };
        if (data.job) {
          localJobs.set(jobId, data.job);
          return data.job;
        }
      }
    } catch {
      // 远端不可用时回退本地
    }
  }
  const cached = localJobs.get(jobId);
  if (cached) return cached;
  try {
    const job = JSON.parse(fs.readFileSync(jobPath(jobId), 'utf8')) as MeetingProcessJob;
    localJobs.set(jobId, job);
    return job;
  } catch {
    return null;
  }
}
