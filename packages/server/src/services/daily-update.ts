/**
 * 每日项目信息更新流水线
 *
 * 编排：飞书文档拉取 → 知识库同步 → 项目状态同步 → 生成更新日志
 * 供定时调度器（schedules.ts）调用，也可通过 API 手动触发
 */

import { syncAll, getDocMappings } from './kb-sync.js';
import { syncAllProjectStatuses, createDailyUpdateLog, getRecentDailyUpdateLogs } from './db.js';

const API_BASE = process.env.NEXT_PUBLIC_SERVER_API || 'http://localhost:3001';

export interface DailyUpdateResult {
  success: boolean;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  steps: {
    feishuPull: { success: boolean; message: string; details?: any };
    kbSync: { success: boolean; message: string; details?: any };
    projectSync: { success: boolean; message: string; details?: any };
    report: { success: boolean; message: string; details?: any };
  };
}

// ===== 步骤 1：拉取飞书文档 =====
async function stepFeishuPull(): Promise<{ success: boolean; message: string; details?: any }> {
  try {
    // 调用 feishu-doc-puller 的 pullDocument 函数
    // 动态导入以避免启动时依赖
    const pullerPath = new URL('../../../../scripts/feishu-doc-puller.mjs', import.meta.url).href;
    const { pullDocument } = await import(pullerPath);

    const mappings = getDocMappings();
    const docIds = Object.keys(mappings);

    if (docIds.length === 0) {
      return { success: true, message: '无配置文档映射，跳过拉取' };
    }

    const results: any[] = [];
    for (const docId of docIds) {
      try {
        await pullDocument(docId);
        results.push({ docId, status: 'success' });
      } catch (err: any) {
        results.push({ docId, status: 'error', error: err.message });
      }
    }

    const successCount = results.filter((r) => r.status === 'success').length;
    return {
      success: successCount > 0,
      message: `拉取完成: ${successCount}/${docIds.length} 个文档`,
      details: results,
    };
  } catch (err: any) {
    // 如果动态导入失败（比如 feishu-doc-puller 不存在），降级为提示
    console.warn('[DailyUpdate] 飞书拉取模块不可用:', err.message);
    return {
      success: false,
      message: `飞书拉取失败: ${err.message}`,
      details: err.message,
    };
  }
}

// ===== 步骤 2：同步知识库 =====
function stepKbSync(): { success: boolean; message: string; details?: any } {
  try {
    const result = syncAll();
    return {
      success: result.success > 0,
      message: `知识库同步: ${result.success} 成功, ${result.failed} 失败`,
      details: result,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `知识库同步失败: ${err.message}`,
      details: err.message,
    };
  }
}

// ===== 步骤 3：同步项目状态 =====
function stepProjectSync(): { success: boolean; message: string; details?: any } {
  try {
    const results = syncAllProjectStatuses();
    const updated = results.filter((r) => r.result?.updated);
    return {
      success: true,
      message: `项目状态同步: ${updated.length}/${results.length} 个项目已更新`,
      details: results.map((r) => ({
        projectId: r.projectId,
        updated: r.result?.updated,
        phase: r.result?.newPhase,
      })),
    };
  } catch (err: any) {
    return {
      success: false,
      message: `项目状态同步失败: ${err.message}`,
      details: err.message,
    };
  }
}

// ===== 步骤 4：生成更新日志 =====
function stepReport(
  feishuResult: any,
  kbResult: any,
  syncResult: any
): { success: boolean; message: string; details?: any } {
  try {
    const ts = new Date().toISOString();
    const report = {
      timestamp: ts,
      feishuPull: feishuResult,
      kbSync: kbResult,
      projectSync: syncResult,
    };

    const today = ts.split('T')[0];
    const hasError = !feishuResult.success || !kbResult.success || !syncResult.success;

    createDailyUpdateLog(today, hasError ? 'partial' : 'success', JSON.stringify(report));

    return {
      success: true,
      message: `日报已生成 (${hasError ? '部分成功' : '全部成功'})`,
      details: report,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `日报生成失败: ${err.message}`,
      details: err.message,
    };
  }
}

// ===== 执行完整流水线 =====
export async function runDailyUpdatePipeline(): Promise<DailyUpdateResult> {
  const startedAt = new Date().toISOString();
  console.log(`[DailyUpdate] 流水线开始: ${startedAt}`);

  // Step 1: 飞书拉取
  const feishuResult = await stepFeishuPull();
  console.log(`[DailyUpdate] 飞书拉取: ${feishuResult.message}`);

  // Step 2: 知识库同步
  const kbResult = stepKbSync();
  console.log(`[DailyUpdate] 知识库同步: ${kbResult.message}`);

  // Step 3: 项目状态同步
  const syncResult = stepProjectSync();
  console.log(`[DailyUpdate] 项目状态同步: ${syncResult.message}`);

  // Step 4: 生成日报
  const reportResult = stepReport(feishuResult, kbResult, syncResult);
  console.log(`[DailyUpdate] 日报: ${reportResult.message}`);

  const finishedAt = new Date().toISOString();
  const durationMs = new Date(finishedAt).getTime() - new Date(startedAt).getTime();

  const overallSuccess = feishuResult.success && kbResult.success && syncResult.success;
  console.log(`[DailyUpdate] 流水线结束: ${overallSuccess ? '✅ 成功' : '⚠️ 部分失败'} (${durationMs}ms)`);

  return {
    success: overallSuccess,
    startedAt,
    finishedAt,
    durationMs,
    steps: {
      feishuPull: feishuResult,
      kbSync: kbResult,
      projectSync: syncResult,
      report: reportResult,
    },
  };
}

// ===== 仅同步知识库（不拉取飞书，用于已手动拉取的场景）=====
export function runKbSyncOnly(): { success: boolean; message: string; details?: any } {
  return stepKbSync();
}

// ===== 仅同步项目状态 =====
export function runProjectSyncOnly(): { success: boolean; message: string; details?: any } {
  return stepProjectSync();
}

// ===== 获取最近更新日志 =====
export function getRecentUpdateLogs(limit: number = 7): any[] {
  try {
    return getRecentDailyUpdateLogs(limit);
  } catch {
    return [];
  }
}
