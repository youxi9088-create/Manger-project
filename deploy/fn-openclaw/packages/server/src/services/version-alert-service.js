// packages/server/src/services/version-alert-service.ts
// 版本预警自动计算服务 v2：基于任务/目标完成时间、版本阶段倒推风险等级
import dbInstance from "./db.js";
// 版本阶段应处于的最低完成率基准线
const STAGE_BASELINE = {
    pending_confirm: 0,
    confirmed: 0,
    in_progress: 0.3, // 进行中至少 30% 任务完成
    testing: 0.8, // 测试阶段至少 80% 开发完成
    ready_release: 0.95, // 待发布至少 95%
    released: 1.0,
    delayed: 0, // 延期不适用基准
};
function daysBetween(dateStr) {
    if (!dateStr)
        return null;
    const target = new Date(dateStr);
    if (isNaN(target.getTime()))
        return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);
    return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}
/**
 * 计算单个版本的预警状态，并写回 versions 表
 */
export function computeVersionRisk(versionId) {
    const version = dbInstance.prepare(`SELECT id, status, goals, expected_release_date FROM versions WHERE id = ?`).get(versionId);
    if (!version)
        return null;
    // 解析目标
    let goals = [];
    try {
        goals = JSON.parse(version.goals || '[]');
    }
    catch {
        goals = [];
    }
    const totalGoals = goals.length;
    const convertedGoals = goals.filter(g => g.requirement_id).length;
    // 该版本下的需求
    const requirements = dbInstance.prepare(`SELECT id, version_id, status FROM requirement_analyses WHERE version_id = ?`).all(versionId);
    const totalRequirements = requirements.length;
    // 该版本下的所有 dev_tasks
    let tasks = [];
    if (requirements.length > 0) {
        const placeholders = requirements.map(() => '?').join(',');
        tasks = dbInstance.prepare(`SELECT id, status, requirement_id, estimated_hours FROM dev_tasks WHERE requirement_id IN (${placeholders})`).all(...requirements.map(r => r.id));
    }
    const totalTasks = tasks.length;
    const doneTasks = tasks.filter(t => t.status === 'done').length;
    const inProgressTasks = tasks.filter(t => t.status === 'in_progress').length;
    const blockedTasks = tasks.filter(t => t.status === 'blocked').length;
    const doneRate = totalTasks > 0 ? doneTasks / totalTasks : 0;
    // 工时统计
    const totalEstimatedHours = tasks.reduce((sum, t) => sum + (t.estimated_hours || 0), 0);
    const remainingHours = tasks
        .filter(t => t.status !== 'done')
        .reduce((sum, t) => sum + (t.estimated_hours || 0), 0);
    // 按每天 8h 预估还需几个工作日完成
    const estimatedFinishDays = remainingHours > 0 ? Math.ceil(remainingHours / 8) : 0;
    const daysLeft = daysBetween(version.expected_release_date);
    // ---- 计算预警 ----
    const reasons = [];
    const strategies = [];
    let level = 'safe';
    const promote = (to) => {
        const order = ['safe', 'warning', 'critical', 'overdue'];
        if (order.indexOf(to) > order.indexOf(level))
            level = to;
    };
    const isReleased = version.status === 'released';
    const isDelayed = version.status === 'delayed';
    if (!isReleased) {
        // ===== 1. 逾期检测 =====
        if (daysLeft !== null && daysLeft < 0) {
            promote('overdue');
            reasons.push(`已逾期 ${-daysLeft} 天`);
            strategies.push(`建议立即评估剩余工作量（${remainingHours}h），考虑调整上线日期或砍掉低优先级任务`);
        }
        // ===== 2. 工时倒推 vs 剩余日期 =====
        if (daysLeft !== null && daysLeft >= 0 && remainingHours > 0) {
            if (estimatedFinishDays > daysLeft) {
                // 按工时预估完不成
                const gapDays = estimatedFinishDays - daysLeft;
                if (gapDays >= 5 || daysLeft <= 3) {
                    promote('critical');
                    reasons.push(`剩余工时 ${remainingHours}h（约 ${estimatedFinishDays} 工作日），但仅剩 ${daysLeft} 天`);
                    strategies.push(`工时缺口 ${gapDays} 天，建议：增加人力投入、并行推进，或砍掉 ${gapDays * 8}h 的低优先级任务`);
                }
                else {
                    promote('warning');
                    reasons.push(`剩余工时 ${remainingHours}h（约 ${estimatedFinishDays} 工作日），距上线 ${daysLeft} 天，时间略紧`);
                    strategies.push(`预留 buffer 不足，建议关注关键路径任务，非核心功能可延后`);
                }
            }
        }
        // ===== 3. 阶段基准线检测 =====
        const baseline = STAGE_BASELINE[version.status] ?? 0;
        if (totalTasks > 0 && baseline > 0 && doneRate < baseline) {
            const gap = Math.round((baseline - doneRate) * 100);
            promote('warning');
            reasons.push(`当前阶段「${getStageLabel(version.status)}」要求完成率 ≥ ${Math.round(baseline * 100)}%，实际 ${Math.round(doneRate * 100)}%，差距 ${gap}%`);
            strategies.push(`需加速推进 ${Math.ceil(gap / 100 * totalTasks)} 个任务到完成状态，或考虑回退版本阶段`);
        }
        // ===== 4. 进度预警（经典规则） =====
        if (daysLeft !== null && daysLeft >= 0 && daysLeft <= 3 && totalTasks > 0 && doneRate < 0.8) {
            promote('critical');
            if (!reasons.some(r => r.includes('完成率'))) {
                reasons.push(`距发布仅 ${daysLeft} 天，完成率 ${Math.round(doneRate * 100)}%（${doneTasks}/${totalTasks}）`);
                strategies.push(`紧急：聚焦核心功能，非必须特性延后至下一版本`);
            }
        }
        else if (daysLeft !== null && daysLeft >= 0 && daysLeft <= 7 && totalTasks > 0 && doneRate < 0.5) {
            promote('warning');
            if (!reasons.some(r => r.includes('完成率'))) {
                reasons.push(`距发布 ${daysLeft} 天，完成率 ${Math.round(doneRate * 100)}%（${doneTasks}/${totalTasks}）`);
                strategies.push(`建议每日站会同步阻塞点，优先推进高优先级任务`);
            }
        }
        // ===== 5. 目标转化预警 =====
        if (totalGoals > 0) {
            const unconverted = totalGoals - convertedGoals;
            if (unconverted > 0) {
                if (daysLeft !== null && daysLeft >= 0 && daysLeft <= 7) {
                    promote('warning');
                    reasons.push(`仍有 ${unconverted}/${totalGoals} 个目标未转化为需求`);
                    strategies.push(`建议尽快将未转化目标拆解为需求并分配任务，否则上线范围不可控`);
                }
                else if (daysLeft !== null && daysLeft >= 0 && daysLeft <= 14 && unconverted === totalGoals) {
                    promote('warning');
                    reasons.push(`所有 ${totalGoals} 个目标均未转化为需求`);
                    strategies.push(`版本规划尚未进入执行阶段，建议尽快明确需求范围`);
                }
            }
        }
        // ===== 6. 阻塞预警 =====
        if (blockedTasks > 0) {
            promote('warning');
            reasons.push(`${blockedTasks} 个任务处于阻塞状态`);
            strategies.push(`立即排查阻塞原因并指定责任人，阻塞任务是最大延期风险`);
        }
        // ===== 7. 版本为空预警 =====
        if (totalGoals === 0 && totalRequirements === 0) {
            if (daysLeft !== null && daysLeft >= 0 && daysLeft <= 14) {
                promote('warning');
                reasons.push('版本尚未定义任何目标和需求');
                strategies.push(`建议立即定义版本目标，明确交付范围`);
            }
        }
        // ===== 8. 无工时估算预警 =====
        if (totalTasks > 0) {
            const noEstimate = tasks.filter(t => t.status !== 'done' && (!t.estimated_hours || t.estimated_hours <= 0)).length;
            if (noEstimate > 0 && noEstimate >= totalTasks * 0.3) {
                // 超过 30% 未完成任务没有工时估算
                if (level === 'safe')
                    promote('warning');
                reasons.push(`${noEstimate} 个未完成任务缺少工时估算，风险不可量化`);
                strategies.push(`优先补全工时估算，否则无法准确预测上线时间`);
            }
        }
    }
    // 已延期
    if (isDelayed && level === 'safe') {
        level = 'overdue';
        if (reasons.length === 0)
            reasons.push('版本被手动标记为延期');
        if (strategies.length === 0)
            strategies.push('建议评估延期原因并制定恢复计划');
    }
    // 已发布
    if (isReleased) {
        level = 'safe';
        reasons.length = 0;
        strategies.length = 0;
        reasons.push('版本已发布');
    }
    const result = {
        version_id: versionId,
        computed_risk: level,
        risk_reasons: reasons,
        strategies,
        stats: {
            total_goals: totalGoals,
            converted_goals: convertedGoals,
            total_requirements: totalRequirements,
            total_tasks: totalTasks,
            done_tasks: doneTasks,
            in_progress_tasks: inProgressTasks,
            blocked_tasks: blockedTasks,
            done_rate: Math.round(doneRate * 100) / 100,
            days_left: daysLeft,
            total_estimated_hours: totalEstimatedHours,
            remaining_hours: remainingHours,
            estimated_finish_days: estimatedFinishDays,
        },
    };
    // 将 computed_risk 映射为 risk_level（手动风险等级跟随自动计算结果）
    const riskLevelMap = {
        safe: 'low',
        warning: 'medium',
        critical: 'high',
        overdue: 'high',
        unknown: 'medium',
    };
    const mappedRiskLevel = riskLevelMap[level] || 'medium';
    // 写回数据库（strategies 合入 risk_reasons JSON，同时同步 risk_level）
    try {
        const reasonsWithStrategies = {
            reasons,
            strategies,
            stats: {
                remaining_hours: remainingHours,
                estimated_finish_days: estimatedFinishDays,
                done_rate: Math.round(doneRate * 100),
            },
        };
        dbInstance.prepare(`UPDATE versions SET computed_risk = ?, risk_reasons = ?, risk_level = ?, last_check_at = datetime('now','localtime') WHERE id = ?`).run(level, JSON.stringify(reasonsWithStrategies), mappedRiskLevel, versionId);
    }
    catch { /* 写回失败不影响返回 */ }
    return result;
}
function getStageLabel(status) {
    const map = {
        pending_confirm: '待确认', confirmed: '已确认', in_progress: '进行中',
        testing: '测试中', ready_release: '待发布', released: '已发布', delayed: '已延期',
    };
    return map[status] || status;
}
/** 批量重算所有版本预警 */
export function recomputeAllVersionRisks() {
    const rows = dbInstance.prepare(`SELECT id FROM versions`).all();
    let ok = 0;
    for (const r of rows) {
        try {
            computeVersionRisk(r.id);
            ok++;
        }
        catch { /* ignore */ }
    }
    return { total: rows.length, ok };
}
//# sourceMappingURL=version-alert-service.js.map