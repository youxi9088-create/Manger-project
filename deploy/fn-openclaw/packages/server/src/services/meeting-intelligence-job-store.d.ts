export type MeetingIntelligenceJob = {
    jobId: string;
    meetingId: string;
    status: 'queued' | 'analyzing' | 'completed' | 'failed';
    createdAt: string;
    updatedAt: string;
    error?: string;
};
export declare function saveMeetingIntelligenceJob(job: MeetingIntelligenceJob): Promise<void>;
export declare function loadMeetingIntelligenceJob(jobId: string): Promise<MeetingIntelligenceJob | null>;
//# sourceMappingURL=meeting-intelligence-job-store.d.ts.map