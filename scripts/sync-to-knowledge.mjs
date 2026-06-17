/**
 * 飞书文档 → 知识库同步器
 * 
 * 功能：将 feishu-doc-puller 拉取到的文档数据，同步到 ~/.hermes/knowledge-base/ 中
 * 支持：自动识别项目、生成 Markdown、更新 summary.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 加载 .env
const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

// ===== 配置 =====
const KNOWLEDGE_BASE = path.resolve(process.env.KNOWLEDGE_BASE_PATH || 'C:/Users/986916/.hermes/knowledge-base');
const FEISHU_DOCS_DIR = path.resolve(__dirname, '..', 'data', 'feishu-docs');

// 文档 ID → 知识库路径 映射（可扩展）
const DOC_MAPPING = {
  'OasIdPqkto5WslxFXhNcWIKun3e': {
    project: '3D交互体验及表现效果优化',
    type: 'project-report',  // project-report | meeting-notes | spec | general
  },
  // 后续可添加更多文档映射
  // 'docId2': { project: '结晶密室', type: 'meeting-notes' },
};

// ===== 将结构化 blocks 转为 Markdown =====
function blocksToMarkdown(structured, rawContent, meta) {
  const lines = [];
  const today = new Date().toISOString().split('T')[0];
  
  lines.push(`# ${meta.title}`);
  lines.push('');
  lines.push(`> 来源: 飞书文档 (工作流自动生成)`);
  lines.push(`> 文档ID: ${meta.documentId}`);
  lines.push(`> 同步时间: ${new Date().toISOString()}`);
  lines.push(`> 版本: rev.${meta.revision}`);
  lines.push('');
  lines.push('---');
  lines.push('');
  
  // 用 rawContent 作为主体（已经是结构化的纯文本）
  // 按段落分割并格式化
  const sections = rawContent.split('\n');
  for (const line of sections) {
    lines.push(line);
  }
  
  return lines.join('\n');
}

// ===== 从文档内容中提取关键摘要（用于 summary.json） =====
function extractSummary(rawContent, meta) {
  const summary = {
    documentId: meta.documentId,
    title: meta.title,
    revision: meta.revision,
    syncedAt: new Date().toISOString(),
    source: 'feishu-workflow',
  };
  
  // 提取核心信息
  const lines = rawContent.split('\n');
  
  // 找项目状态
  const statusMatch = rawContent.match(/健康状态[：:\s]*([^\n]+)/);
  if (statusMatch) summary.healthStatus = statusMatch[1].trim();
  
  // 找当前阶段
  const phaseMatch = rawContent.match(/当前阶段[：:\s]*([^\n]+)/);
  if (phaseMatch) summary.currentPhase = phaseMatch[1].trim();
  
  // 找核心风险
  const risks = [];
  const riskRegex = /风险\d+[：:]\s*([^\n]+)/g;
  let m;
  while ((m = riskRegex.exec(rawContent)) !== null) {
    risks.push(m[1].trim());
  }
  if (risks.length > 0) summary.risks = risks;
  
  // 找进度信息
  const progressMatch = rawContent.match(/当前进度[：:\s]*([^\n]+)/);
  if (progressMatch) summary.progress = progressMatch[1].trim();
  
  // 找建议
  const suggestions = [];
  const sugRegex = /(?:immediate|short-term|mid-term)[（(]([^)）]+)[)）]\s*\n([^\n]+)/gi;
  while ((m = sugRegex.exec(rawContent)) !== null) {
    suggestions.push({ timeframe: m[1].trim(), action: m[2].trim() });
  }
  if (suggestions.length > 0) summary.suggestions = suggestions;
  
  return summary;
}

// ===== 同步单个文档到知识库 =====
function syncDocument(docId) {
  const latestFile = path.join(FEISHU_DOCS_DIR, `${docId}_latest.json`);
  
  if (!fs.existsSync(latestFile)) {
    console.error(`❌ 未找到文档数据: ${latestFile}`);
    console.log('   请先运行: node scripts/feishu-doc-puller.mjs');
    return false;
  }
  
  const data = JSON.parse(fs.readFileSync(latestFile, 'utf-8'));
  const mapping = DOC_MAPPING[docId];
  
  if (!mapping) {
    console.warn(`⚠️  文档 ${docId} 未配置映射，使用默认存储路径`);
    // 默认存到 archive 目录
    const archiveDir = path.join(KNOWLEDGE_BASE, 'archive', 'feishu-docs');
    if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });
    
    const mdFile = path.join(archiveDir, `${data.title || docId}.md`);
    const markdown = blocksToMarkdown(data.structured, data.rawContent, data);
    fs.writeFileSync(mdFile, markdown, 'utf-8');
    console.log(`📁 已保存到: ${mdFile}`);
    return true;
  }
  
  // 根据类型同步到对应位置
  const projectDir = path.join(KNOWLEDGE_BASE, 'projects', mapping.project);
  if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir, { recursive: true });
  
  const today = new Date().toISOString().split('T')[0];
  
  switch (mapping.type) {
    case 'project-report': {
      // 1. 生成 Markdown 报告
      const mdFileName = `project-report-${today}.md`;
      const mdFile = path.join(projectDir, mdFileName);
      const markdown = blocksToMarkdown(data.structured, data.rawContent, data);
      fs.writeFileSync(mdFile, markdown, 'utf-8');
      console.log(`📄 项目报告已同步: ${mdFile}`);
      
      // 2. 更新 summary.json — 用飞书最新数据覆盖核心字段
      const summaryFile = path.join(projectDir, 'summary.json');
      let summaryData = {};
      if (fs.existsSync(summaryFile)) {
        summaryData = JSON.parse(fs.readFileSync(summaryFile, 'utf-8'));
      }
      
      // 从纯文本中提取并更新核心信息
      const raw = data.rawContent;
      
      // 更新健康状态
      const healthMatch = raw.match(/健康状态[：:\s\n]*([^\n]+)/);
      if (healthMatch) {
        if (!summaryData.project) summaryData.project = {};
        summaryData.project.status = healthMatch[1].trim();
      }
      
      // 更新当前阶段
      const phaseMatch = raw.match(/当前阶段[：:\s\n]*([^\n]+)/);
      if (phaseMatch) {
        if (!summaryData.project) summaryData.project = {};
        summaryData.project.phase = phaseMatch[1].trim();
      }
      
      // 更新概述
      const overviewMatch = raw.match(/项目定位[：:\s\n]*([^\n]+)/);
      if (overviewMatch && summaryData.summary) {
        summaryData.summary.overview = `健康状态: ${healthMatch?.[1]?.trim() || '未知'}。${overviewMatch[1].trim()}`;
      }
      
      // 更新周版本信息 — 仅从正式"周版本推进"段落中提取
      // 先截取文档中"周版本推进"到下一个一级标题之间的内容，避免从AI推理文本中误提取
      const weekSectionMatch = raw.match(/周版本推进[（(][^)）]*[)）]?\n([\s\S]*?)(?=\n[一二三四五六七八九十]+、|$)/);
      const weekSection = weekSectionMatch ? weekSectionMatch[1] : '';
      
      const newWeekly = [];
      if (weekSection) {
        // 在周版本段落中按日期分块提取
        const weeklyRegex = /(\d+月\d+日)[（(]([^)）]*)[)）]?[：:\s]*([^\n]+)/g;
        let wm;
        while ((wm = weeklyRegex.exec(weekSection)) !== null) {
          const dateStr = wm[1];
          const label = wm[2] || '';  // 如"最新"
          const planSummary = wm[3].trim();
          
          // 提取该日期块后续的完成情况（到下一个日期或段落结束）
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
      
      // 如果解析出新的周数据，合并到 weekly_versions
      if (newWeekly.length > 0 && Array.isArray(summaryData.weekly_versions)) {
        const existingWeeks = new Set(summaryData.weekly_versions.map(w => w.week));
        for (const nw of newWeekly) {
          // 验证：plan 至少5个字符且不含明显噪声
          if (nw.plan.length < 5 || nw.plan.includes('我需要') || nw.plan.includes('用户')) continue;
          if (!existingWeeks.has(nw.week)) {
            summaryData.weekly_versions.push(nw);
            existingWeeks.add(nw.week);
          }
        }
        // 按日期排序
        summaryData.weekly_versions.sort((a, b) => (a.week || '').localeCompare(b.week || ''));
      }
      
      // 更新风险信息
      const risks = [];
      const riskRegex = /[⚠🔴❗].*?风险\d*[：:]\s*([^\n]+)/g;
      let rm;
      while ((rm = riskRegex.exec(raw)) !== null) {
        risks.push({ level: '高', description: rm[1].trim() });
      }
      // 备选格式
      const riskRegex2 = /风险\d+[：:]\s*([^\n]+)/g;
      while ((rm = riskRegex2.exec(raw)) !== null) {
        if (!risks.find(r => r.description.includes(rm[1].substring(0, 20)))) {
          risks.push({ level: '高', description: rm[1].trim() });
        }
      }
      if (risks.length > 0) {
        summaryData.risks = risks;
      }
      
      // 更新 latestReport 摘要
      const reportSummary = extractSummary(data.rawContent, data);
      summaryData.latestReport = reportSummary;
      summaryData.lastSyncedAt = new Date().toISOString();
      
      // 更新 metadata
      summaryData.metadata = {
        ...(summaryData.metadata || {}),
        sync_time: new Date().toISOString(),
        source: 'feishu-workflow',
        feishu_doc_id: data.documentId,
        feishu_revision: data.revision,
      };
      
      fs.writeFileSync(summaryFile, JSON.stringify(summaryData, null, 2), 'utf-8');
      console.log(`📊 summary.json 已更新（含最新风险、周版本等）: ${summaryFile}`);
      
      // 3. 同时更新 project-data（兼容旧格式）
      const dataFile = path.join(projectDir, `project-data-${today}.md`);
      if (!fs.existsSync(dataFile)) {
        fs.writeFileSync(dataFile, markdown, 'utf-8');
        console.log(`📝 项目数据已更新: ${dataFile}`);
      }
      
      break;
    }
    
    case 'meeting-notes': {
      const mdFile = path.join(projectDir, `meeting-${today}.md`);
      const markdown = blocksToMarkdown(data.structured, data.rawContent, data);
      fs.writeFileSync(mdFile, markdown, 'utf-8');
      console.log(`📋 会议纪要已同步: ${mdFile}`);
      break;
    }
    
    case 'spec': {
      const mdFile = path.join(projectDir, `spec-${today}.md`);
      const markdown = blocksToMarkdown(data.structured, data.rawContent, data);
      fs.writeFileSync(mdFile, markdown, 'utf-8');
      console.log(`📐 需求规格已同步: ${mdFile}`);
      break;
    }
    
    default: {
      const mdFile = path.join(projectDir, `doc-${today}.md`);
      const markdown = blocksToMarkdown(data.structured, data.rawContent, data);
      fs.writeFileSync(mdFile, markdown, 'utf-8');
      console.log(`📁 文档已同步: ${mdFile}`);
    }
  }
  
  return true;
}

// ===== 同步全部已拉取的文档 =====
function syncAll() {
  console.log(`\n🔄 开始同步飞书文档到知识库...`);
  console.log(`   知识库路径: ${KNOWLEDGE_BASE}`);
  console.log(`   文档数据目录: ${FEISHU_DOCS_DIR}\n`);
  
  if (!fs.existsSync(FEISHU_DOCS_DIR)) {
    console.error('❌ 文档数据目录不存在，请先运行 feishu-doc-puller.mjs');
    process.exit(1);
  }
  
  // 找所有 *_latest.json
  const files = fs.readdirSync(FEISHU_DOCS_DIR).filter(f => f.endsWith('_latest.json'));
  
  if (files.length === 0) {
    console.log('📭 没有找到已拉取的文档，请先运行:');
    console.log('   node scripts/feishu-doc-puller.mjs');
    return;
  }
  
  let success = 0;
  let failed = 0;
  
  for (const file of files) {
    const docId = file.replace('_latest.json', '');
    console.log(`\n--- 同步文档: ${docId} ---`);
    try {
      if (syncDocument(docId)) {
        success++;
      } else {
        failed++;
      }
    } catch (err) {
      console.error(`❌ 同步失败: ${err.message}`);
      failed++;
    }
  }
  
  console.log(`\n✅ 同步完成: 成功 ${success} 个, 失败 ${failed} 个`);
}

// ===== 一键拉取+同步 =====
async function pullAndSync(docId) {
  // 动态导入拉取器
  const { pullDocument } = await import('./feishu-doc-puller.mjs');
  
  console.log('📥 Step 1: 拉取飞书文档...');
  await pullDocument(docId);
  
  console.log('\n📤 Step 2: 同步到知识库...');
  syncDocument(docId);
  
  console.log('\n🎉 全部完成！');
}

// ===== CLI =====
const isMainModule = process.argv[1] && (
  process.argv[1].endsWith('sync-to-knowledge.mjs') ||
  process.argv[1].endsWith('sync-to-knowledge')
);

if (isMainModule) {
  const args = process.argv.slice(2);
  
  if (args.includes('--help')) {
    console.log(`
飞书文档 → 知识库同步器

用法:
  node scripts/sync-to-knowledge.mjs              # 同步所有已拉取的文档
  node scripts/sync-to-knowledge.mjs --pull       # 先拉取再同步（默认文档）
  node scripts/sync-to-knowledge.mjs --pull <id>  # 拉取指定文档并同步
  node scripts/sync-to-knowledge.mjs --doc <id>   # 只同步指定文档（需已拉取）

知识库路径: ${KNOWLEDGE_BASE}
`);
  } else if (args.includes('--pull')) {
    const pullIdx = args.indexOf('--pull');
    const docId = args[pullIdx + 1] || process.env.FEISHU_DOC_ID || 'OasIdPqkto5WslxFXhNcWIKun3e';
    pullAndSync(docId).catch(err => {
      console.error(`\n❌ 错误: ${err.message}`);
      process.exit(1);
    });
  } else if (args.includes('--doc')) {
    const docIdx = args.indexOf('--doc');
    const docId = args[docIdx + 1];
    if (!docId) {
      console.error('❌ 请指定文档 ID');
      process.exit(1);
    }
    syncDocument(docId);
  } else {
    syncAll();
  }
}

export { syncDocument, syncAll, pullAndSync };
