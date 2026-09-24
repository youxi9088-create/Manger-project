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
export declare function loadRemoteMeetingResult(key: string): Promise<PersistedMeetingResult | null>;
export declare function saveRemoteMeetingResult(result: PersistedMeetingResult): Promise<boolean>;
export declare function listRemoteMeetingResults(limit: number): Promise<PersistedMeetingResult[]>;
//# sourceMappingURL=meeting-result-store.d.ts.map