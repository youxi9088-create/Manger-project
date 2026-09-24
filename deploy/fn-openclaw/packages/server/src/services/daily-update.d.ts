/**
 * 每日项目信息更新流水线
 *
 * 编排：飞书文档拉取 → 知识库同步 → 项目状态同步 → 生成更新日志
 * 供定时调度器（schedules.ts）调用，也可通过 API 手动触发
 */
export interface DailyUpdateResult {
    success: boolean;
    startedAt: string;
    finishedAt: string;
    durationMs: number;
    steps: {
        feishuPull: {
            success: boolean;
            message: string;
            details?: any;
        };
        kbSync: {
            success: boolean;
            message: string;
            details?: any;
        };
        projectSync: {
            success: boolean;
            message: string;
            details?: any;
        };
        report: {
            success: boolean;
            message: string;
            details?: any;
        };
    };
}
export declare function runDailyUpdatePipeline(): Promise<DailyUpdateResult>;
export declare function runKbSyncOnly(): {
    success: boolean;
    message: string;
    details?: any;
};
export declare function runProjectSyncOnly(): {
    success: boolean;
    message: string;
    details?: any;
};
export declare function getRecentUpdateLogs(limit?: number): any[];
//# sourceMappingURL=daily-update.d.ts.map