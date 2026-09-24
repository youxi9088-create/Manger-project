const localJobs = new Map();
function endpoint() {
    const origin = process.env.OPENCLAW_INTERNAL_STORE_ORIGIN;
    const secret = process.env.OPENCLAW_INTERNAL_STORE_SECRET;
    return origin && secret ? `${origin}/api/internal/workflow-jobs` : null;
}
function headers() {
    return { 'x-openclaw-internal-store': process.env.OPENCLAW_INTERNAL_STORE_SECRET || '' };
}
export async function saveWorkflowJob(job) {
    localJobs.set(job.jobId, job);
    const url = endpoint();
    if (!url)
        return;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers() },
        body: JSON.stringify({ job }),
    });
    if (!response.ok)
        throw new Error('工作流任务状态保存失败');
}
export async function loadWorkflowJob(jobId) {
    const url = endpoint();
    if (!url)
        return localJobs.get(jobId) || null;
    try {
        const response = await fetch(`${url}?jobId=${encodeURIComponent(jobId)}`, { headers: headers() });
        if (!response.ok)
            return localJobs.get(jobId) || null;
        const data = await response.json();
        return data.job || localJobs.get(jobId) || null;
    }
    catch {
        return localJobs.get(jobId) || null;
    }
}
//# sourceMappingURL=workflow-job-store.js.map