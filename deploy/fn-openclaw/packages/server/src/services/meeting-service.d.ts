import { PersistedMeetingResult } from './meeting-result-store.js';
export interface MeetingRecord {
    meetingId: string;
    title: string;
    startTime: string;
    recorder: string;
    duration: string;
    fileSize: string;
    videoUrl?: string;
    audioUrl?: string;
    status: 'pending' | 'transcribing' | 'completed';
    transcript?: string;
    summary?: string;
    todos?: string[];
    audioPath?: string;
}
declare class MeetingAPIService {
    private baseUrl;
    private extendUrl;
    private authKey;
    private authInfo;
    constructor();
    fetchWithAuth(url: string, options?: any): Promise<Response>;
    login(): Promise<boolean>;
    browserLogin(): Promise<boolean>;
    manualLogin(): Promise<boolean>;
    fetchMeetingListWithToken(): Promise<MeetingRecord[]>;
    fetchMeetingList(): Promise<MeetingRecord[]>;
    fetchMeetingListFromWeb(): Promise<MeetingRecord[]>;
    private parseMeetingRecords;
    private getMockRecords;
    downloadMedia(meetingId: string, format: 'video' | 'audio', directUrl?: string, options?: {
        forceRefresh?: boolean;
    }): Promise<string>;
    getMeetingResultLatest(params: {
        title?: string;
        startTime?: string;
    }): Promise<PersistedMeetingResult | null>;
    listMeetingResultVersions(params: {
        title?: string;
        startTime?: string;
    }): Promise<{
        versionId: string;
        createdAt: string;
        transcript?: string;
        summary?: string;
        todos?: string[];
    }[]>;
    listMeetingResults(limit?: number): Promise<PersistedMeetingResult[]>;
    persistMeetingResult(params: {
        meetingId: string;
        title?: string;
        startTime?: string;
        transcript?: string;
        summary?: string;
        todos?: string[];
        audioPath?: string;
    }): Promise<void>;
    cleanupOldMeetingMedia(params?: {
        retentionDays?: number;
    }): any;
}
export declare const meetingService: MeetingAPIService;
export default meetingService;
//# sourceMappingURL=meeting-service.d.ts.map