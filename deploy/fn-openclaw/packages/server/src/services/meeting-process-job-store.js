import path from "path";
import fs from "fs";
const localJobs = new Map();
const JOBS_DIR = path.join(process.env.MEETING_DATA_DIR || path.resolve(process.cwd(), 'data', 'meetings'), 'process-jobs');
function jobPath(jobId) {
    return path.join(JOBS_DIR, `${jobId}.json`);
}
function storeEndpoint() {
    const origin = process.env.OPENCLAW_INTERNAL_STORE_ORIGIN;
    const secret = process.env.OPENCLAW_INTERNAL_STORE_SECRET;
    if (!origin || !secret)
        return null;
    return `${origin}/api/internal/meeting-process-jobs`;
}
function storeHeaders() {
    return { 'x-openclaw-internal-store': process.env.OPENCLAW_INTERNAL_STORE_SECRET || '' };
}
export async function saveMeetingProcessJob(job) {
    localJobs.set(job.jobId, job);
    try {
        fs.mkdirSync(JOBS_DIR, { recursive: true });
        fs.writeFileSync(jobPath(job.jobId), JSON.stringify(job), 'utf8');
    }
    catch (error) {
        console.error(`[Meeting process ${job.jobId}] 保存任务状态失败`, error);
    }
    const endpoint = storeEndpoint();
    if (!endpoint)
        return;
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'content-type': 'application/json', ...storeHeaders() },
            body: JSON.stringify({ job }),
        });
        if (!response.ok) {
            console.error(`[Meeting process ${job.jobId}] 远端任务状态保存失败: ${response.status}`);
        }
    }
    catch (error) {
        console.error(`[Meeting process ${job.jobId}] 远端任务状态保存异常`, error);
    }
}
export async function loadMeetingProcessJob(jobId) {
    const endpoint = storeEndpoint();
    if (endpoint) {
        try {
            const response = await fetch(`${endpoint}?jobId=${encodeURIComponent(jobId)}`, { headers: storeHeaders() });
            if (response.ok) {
                const data = (await response.json());
                if (data.job) {
                    localJobs.set(jobId, data.job);
                    return data.job;
                }
            }
        }
        catch {
            // 远端不可用时回退本地
        }
    }
    const cached = localJobs.get(jobId);
    if (cached)
        return cached;
    try {
        const job = JSON.parse(fs.readFileSync(jobPath(jobId), 'utf8'));
        localJobs.set(jobId, job);
        return job;
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=meeting-process-job-store.js.map