export type WorkflowJob = {
    jobId: string;
    proid: string;
    ask?: string;
    workflowRunId: string;
    status: 'queued' | 'running' | 'completed' | 'failed';
    createdAt: string;
    updatedAt: string;
    result?: Record<string, unknown>;
    error?: string;
};
export declare function saveWorkflowJob(job: WorkflowJob): Promise<void>;
export declare function loadWorkflowJob(jobId: string): Promise<WorkflowJob | null>;
//# sourceMappingURL=workflow-job-store.d.ts.map