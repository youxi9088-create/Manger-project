export type MeetingProcessJob = {
    jobId: string;
    meetingId: string;
    title?: string;
    startTime?: string;
    status: 'queued' | 'downloading' | 'transcribing' | 'summarizing' | 'completed' | 'failed';
    createdAt: string;
    updatedAt: string;
    result?: {
        transcript: string;
        summary: string;
        todos: string[];
    };
    error?: string;
};
export declare function saveMeetingProcessJob(job: MeetingProcessJob): Promise<void>;
export declare function loadMeetingProcessJob(jobId: string): Promise<MeetingProcessJob | null>;
//# sourceMappingURL=meeting-process-job-store.d.ts.map