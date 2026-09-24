export type AnalysisStats = {
    total_messages: number;
    unique_senders: number;
    unique_groups: number;
    mentioned_count: number;
};
export type TopSender = {
    sender_name: string;
    message_count: number;
};
export declare function extractSummary(markdown: string): string;
export declare function parseMarkdownReport(markdown: string): any;
export declare function buildAnalysisPrompt(date: string, chatRecords: Array<{
    group_name?: string | null;
    sender_name?: string;
    content?: string;
    timestamp?: string;
}>, stats: AnalysisStats, topSenders: TopSender[]): string;
export declare function getTodayDateString(): string;
//# sourceMappingURL=analysis-service.d.ts.map