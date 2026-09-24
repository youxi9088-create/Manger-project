/**
 * 知识库同步服务
 * 将飞书文档数据同步到 ~/.hermes/knowledge-base/ 中
 * 从 scripts/sync-to-knowledge.mjs 提取，服务化后可供服务器调度
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 加载 .env（服务启动时已加载，这里作为后备）
const rootDir = path.resolve(__dirname, '..', '..', '..', '..');
const envPath = path.join(rootDir, '.env');
if (fs.existsSync(envPath) && !process.env.FEISHU_APP_ID) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    for (const line of envContent.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#'))
            continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
            const key = trimmed.slice(0, eqIdx).trim();
            const val = trimmed.slice(eqIdx + 1).trim();
            if (!process.env[key])
                process.env[key] = val;
        }
    }
}
const KNOWLEDGE_BASE = path.resolve(process.env.KNOWLEDGE_BASE_PATH || 'C:/Users/986916/.hermes/knowledge-base');
const FEISHU_DOCS_DIR = path.resolve(rootDir, 'data', 'feishu-docs');
// 文档 ID → 知识库路径 映射（可扩展，优先从环境变量读取）
function getDocMapping() {
    // 优先从 FEISHU_DOC_MAPPING 环境变量解析（JSON格式）
    if (process.env.FEISHU_DOC_MAPPING) {
        try {
            return JSON.parse(process.env.FEISHU_DOC_MAPPING);
        }
        catch {
            console.warn('[KB-Sync] FEISHU_DOC_MAPPING 解析失败，使用默认映射');
        }
    }
    // 默认映射（保持向后兼容）
    return {
        'OasIdPqkto5WslxFXhNcWIKun3e': {
            project: '3D交互体验及表现效果优化',
            type: 'project-report',
        },
    };
}
// ===== 将结构化 blocks 转为 Markdown =====
function blocksToMarkdown(structured, rawContent, meta) {
    const lines = [];
    lines.push(`# ${meta.title}`);
    lines.push('');
    lines.push(`> 来源: 飞书文档 (工作流自动生成)`);
    lines.push(`> 文档ID: ${meta.documentId}`);
    lines.push(`> 同步时间: ${new Date().toISOString()}`);
    lines.push(`> 版本: rev.${meta.revision}`);
    lines.push('');
    lines.push('---');
    lines.push('');
    const sections = rawContent.split('\n');
    for (const line of sections) {
        lines.push(line);
    }
    return lines.join('\n');
}
// ===== 从文档内容中提取关键摘要 =====
function extractSummary(rawContent, meta) {
    const summary = {
        documentId: meta.documentId,
        title: meta.title,
        revision: meta.revision,
        syncedAt: new Date().toISOString(),
        source: 'feishu-workflow',
    };
    const statusMatch = rawContent.match(/健康状态[：:\s]*([^\n]+)/);
    if (statusMatch)
        summary.healthStatus = statusMatch[1].trim();
    const phaseMatch = rawContent.match(/当前阶段[：:\s]*([^\n]+)/);
    if (phaseMatch)
        summary.currentPhase = phaseMatch[1].trim();
    const risks = [];
    const riskRegex = /风险\d*[：:]\s*([^\n]+)/g;
    let m;
    while ((m = riskRegex.exec(rawContent)) !== null) {
        risks.push(m[1].trim());
    }
    if (risks.length > 0)
        summary.risks = risks;
    const progressMatch = rawContent.match(/当前进度[：:\s]*([^\n]+)/);
    if (progressMatch)
        summary.progress = progressMatch[1].trim();
    return summary;
}
// ===== 同步单个文档到知识库 =====
export function syncDocument(docId) {
    const latestFile = path.join(FEISHU_DOCS_DIR, `${docId}_latest.json`);
    if (!fs.existsSync(latestFile)) {
        console.error(`[KB-Sync] 未找到文档数据: ${latestFile}`);
        return false;
    }
    const data = JSON.parse(fs.readFileSync(latestFile, 'utf-8'));
    const mapping = getDocMapping()[docId];
    if (!mapping) {
        // 未配置映射，存到 archive
        const archiveDir = path.join(KNOWLEDGE_BASE, 'archive', 'feishu-docs');
        if (!fs.existsSync(archiveDir))
            fs.mkdirSync(archiveDir, { recursive: true });
        const mdFile = path.join(archiveDir, `${data.title || docId}.md`);
        const markdown = blocksToMarkdown(data.structured, data.rawContent, data);
        fs.writeFileSync(mdFile, markdown, 'utf-8');
        console.log(`[KB-Sync] 已保存到 archive: ${mdFile}`);
        return true;
    }
    const projectDir = path.join(KNOWLEDGE_BASE, 'projects', mapping.project);
    if (!fs.existsSync(projectDir))
        fs.mkdirSync(projectDir, { recursive: true });
    const today = new Date().toISOString().split('T')[0];
    const raw = data.rawContent;
    switch (mapping.type) {
        case 'project-report': {
            const mdFileName = `project-report-${today}.md`;
            const mdFile = path.join(projectDir, mdFileName);
            const markdown = blocksToMarkdown(data.structured, data.rawContent, data);
            fs.writeFileSync(mdFile, markdown, 'utf-8');
            console.log(`[KB-Sync] 项目报告已同步: ${mdFile}`);
            // 更新 summary.json
            const summaryFile = path.join(projectDir, 'summary.json');
            let summaryData = {};
            if (fs.existsSync(summaryFile)) {
                summaryData = JSON.parse(fs.readFileSync(summaryFile, 'utf-8'));
            }
            const healthMatch = raw.match(/健康状态[：:\s\n]*([^\n]+)/);
            if (healthMatch) {
                if (!summaryData.project)
                    summaryData.project = {};
                summaryData.project.status = healthMatch[1].trim();
            }
            const phaseMatch = raw.match(/当前阶段[：:\s\n]*([^\n]+)/);
            if (phaseMatch) {
                if (!summaryData.project)
                    summaryData.project = {};
                summaryData.project.phase = phaseMatch[1].trim();
            }
            const overviewMatch = raw.match(/项目定位[：:\s\n]*([^\n]+)/);
            if (overviewMatch && summaryData.summary) {
                summaryData.summary.overview = `健康状态: ${healthMatch?.[1]?.trim() || '未知'}。${overviewMatch[1].trim()}`;
            }
            // 周版本信息提取
            const weekSectionMatch = raw.match(/周版本推进[（(][^)）]*[)）]?\n([\s\S]*?)(?=\n[一二三四五六七八九十]+、|$)/);
            const weekSection = weekSectionMatch ? weekSectionMatch[1] : '';
            const newWeekly = [];
            if (weekSection) {
                const weeklyRegex = /(\d+月\d+日)[（(]([^)）]*)[)）]?[：:\s]*([^\n]+)/g;
                let wm;
                while ((wm = weeklyRegex.exec(weekSection)) !== null) {
                    const dateStr = wm[1];
                    const label = wm[2] || '';
                    const planSummary = wm[3].trim();
                    const afterIdx = weeklyRegex.lastIndex;
                    const nextDateIdx = weekSection.indexOf('月', afterIdx + 5);
                    const blockEnd = nextDateIdx > 0 ? nextDateIdx - 2 : weekSection.length;
                    const blockContent = weekSection.slice(afterIdx, blockEnd);
                    newWeekly.push({
                        week: `2026-${dateStr.replace('月', '-').replace('日', '')}`,
                        plan: planSummary,
                        completion: blockContent.replace(/\n/g, ' ').trim().substring(0, 300),
                        progress: label.includes('最新') ? '进行中' : '100%',
                    });
                }
            }
            if (newWeekly.length > 0 && Array.isArray(summaryData.weekly_versions)) {
                const existingWeeks = new Set(summaryData.weekly_versions.map((w) => w.week));
                for (const nw of newWeekly) {
                    if (nw.plan.length < 5 || nw.plan.includes('我需要') || nw.plan.includes('用户'))
                        continue;
                    if (!existingWeeks.has(nw.week)) {
                        summaryData.weekly_versions.push(nw);
                        existingWeeks.add(nw.week);
                    }
                }
                summaryData.weekly_versions.sort((a, b) => (a.week || '').localeCompare(b.week || ''));
            }
            // 风险信息
            const risks = [];
            const riskRegex = /[⚠🔴❗].*?风险\d*[：:]\s*([^\n]+)/g;
            let rm;
            while ((rm = riskRegex.exec(raw)) !== null) {
                risks.push({ level: '高', description: rm[1].trim() });
            }
            const riskRegex2 = /风险\d+[：:]\s*([^\n]+)/g;
            while ((rm = riskRegex2.exec(raw)) !== null) {
                if (!risks.find((r) => r.description.includes(rm[1].substring(0, 20)))) {
                    risks.push({ level: '高', description: rm[1].trim() });
                }
            }
            if (risks.length > 0)
                summaryData.risks = risks;
            const reportSummary = extractSummary(data.rawContent, data);
            summaryData.latestReport = reportSummary;
            summaryData.lastSyncedAt = new Date().toISOString();
            summaryData.metadata = {
                ...(summaryData.metadata || {}),
                sync_time: new Date().toISOString(),
                source: 'feishu-workflow',
                feishu_doc_id: data.documentId,
                feishu_revision: data.revision,
            };
            fs.writeFileSync(summaryFile, JSON.stringify(summaryData, null, 2), 'utf-8');
            console.log(`[KB-Sync] summary.json 已更新: ${summaryFile}`);
            // 兼容旧格式
            const dataFile = path.join(projectDir, `project-data-${today}.md`);
            if (!fs.existsSync(dataFile)) {
                fs.writeFileSync(dataFile, markdown, 'utf-8');
            }
            break;
        }
        case 'meeting-notes': {
            const mdFile = path.join(projectDir, `meeting-${today}.md`);
            const markdown = blocksToMarkdown(data.structured, data.rawContent, data);
            fs.writeFileSync(mdFile, markdown, 'utf-8');
            console.log(`[KB-Sync] 会议纪要已同步: ${mdFile}`);
            break;
        }
        case 'spec': {
            const mdFile = path.join(projectDir, `spec-${today}.md`);
            const markdown = blocksToMarkdown(data.structured, data.rawContent, data);
            fs.writeFileSync(mdFile, markdown, 'utf-8');
            console.log(`[KB-Sync] 需求规格已同步: ${mdFile}`);
            break;
        }
        default: {
            const mdFile = path.join(projectDir, `doc-${today}.md`);
            const markdown = blocksToMarkdown(data.structured, data.rawContent, data);
            fs.writeFileSync(mdFile, markdown, 'utf-8');
            console.log(`[KB-Sync] 文档已同步: ${mdFile}`);
        }
    }
    return true;
}
// ===== 同步全部已拉取的文档 =====
export function syncAll() {
    const result = { success: 0, failed: 0, details: [] };
    if (!fs.existsSync(FEISHU_DOCS_DIR)) {
        result.details.push('文档数据目录不存在');
        return result;
    }
    const files = fs.readdirSync(FEISHU_DOCS_DIR).filter((f) => f.endsWith('_latest.json'));
    if (files.length === 0) {
        result.details.push('没有找到已拉取的文档');
        return result;
    }
    for (const file of files) {
        const docId = file.replace('_latest.json', '');
        try {
            if (syncDocument(docId)) {
                result.success++;
                result.details.push(`${docId}: 成功`);
            }
            else {
                result.failed++;
                result.details.push(`${docId}: 失败`);
            }
        }
        catch (err) {
            result.failed++;
            result.details.push(`${docId}: 错误 - ${err.message}`);
        }
    }
    return result;
}
// ===== 获取所有已配置的文档映射 =====
export function getDocMappings() {
    return getDocMapping();
}
// ===== 更新文档映射（运行时动态配置）=====
export function updateDocMapping(docId, mapping) {
    const current = getDocMapping();
    current[docId] = mapping;
    // 注意：这里只更新内存，持久化需要通过环境变量或数据库配置
    console.log(`[KB-Sync] 文档映射已更新: ${docId} -> ${mapping.project} (${mapping.type})`);
}
//# sourceMappingURL=kb-sync.js.map