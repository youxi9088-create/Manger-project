export type PersistedMeetingIntelligence = {
    meetingId: string;
    title?: string;
    startTime?: string;
    result: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
};
export declare function loadRemoteMeetingIntelligence(meetingId: string): Promise<PersistedMeetingIntelligence | null>;
export declare function saveRemoteMeetingIntelligence(intelligence: PersistedMeetingIntelligence): Promise<boolean>;
export declare function deleteRemoteMeetingIntelligence(meetingId: string): Promise<boolean>;
//# sourceMappingURL=meeting-intelligence-store.d.ts.map