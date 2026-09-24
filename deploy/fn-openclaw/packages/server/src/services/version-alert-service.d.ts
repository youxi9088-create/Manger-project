export type RiskLevel = 'safe' | 'warning' | 'critical' | 'overdue' | 'unknown';
export interface VersionRiskResult {
    version_id: string;
    computed_risk: RiskLevel;
    risk_reasons: string[];
    strategies: string[];
    stats: {
        total_goals: number;
        converted_goals: number;
        total_requirements: number;
        total_tasks: number;
        done_tasks: number;
        in_progress_tasks: number;
        blocked_tasks: number;
        done_rate: number;
        days_left: number | null;
        total_estimated_hours: number;
        remaining_hours: number;
        estimated_finish_days: number | null;
    };
}
/**
 * 计算单个版本的预警状态，并写回 versions 表
 */
export declare function computeVersionRisk(versionId: string): VersionRiskResult | null;
/** 批量重算所有版本预警 */
export declare function recomputeAllVersionRisks(): {
    total: number;
    ok: number;
};
//# sourceMappingURL=version-alert-service.d.ts.map