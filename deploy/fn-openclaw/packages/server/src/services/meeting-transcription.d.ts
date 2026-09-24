export declare function transcribeMeetingAudio(filePath: string, options?: {
    audioUrl?: string;
}): Promise<string>;
export declare function generateMeetingMinutes(transcript: string, meta: {
    title?: string;
    startTime?: string;
}): Promise<{
    summary: string;
    todos: any;
}>;
//# sourceMappingURL=meeting-transcription.d.ts.map