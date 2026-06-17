/**
 * 飞书文档拉取器
 * 
 * 功能：通过飞书开放 API 拉取指定文档(docx)的内容
 * 使用场景：工作流输出到飞书文档 → 本系统定时/手动拉取数据
 * 
 * 飞书文档 API 文档参考：
 * https://open.feishu.cn/document/server-docs/docs/docs/docx-v1/document/list
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 加载 .env 文件
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
const CONFIG = {
  // 飞书应用凭证（与 auto-order 模块共用）
  appId: process.env.FEISHU_APP_ID || '',
  appSecret: process.env.FEISHU_APP_SECRET || '',
  
  // 要拉取的文档 ID（从 URL 提取：https://wy75ubw5kb.feishu.cn/docx/OasIdPqkto5WslxFXhNcWIKun3e）
  documentId: process.env.FEISHU_DOC_ID || 'OasIdPqkto5WslxFXhNcWIKun3e',
  
  // 飞书 API 基础地址
  baseUrl: 'https://open.feishu.cn',
  
  // 数据存储路径
  outputDir: path.resolve(__dirname, '..', 'data', 'feishu-docs'),
};

// ===== 获取 tenant_access_token =====
async function getTenantToken() {
  const res = await fetch(`${CONFIG.baseUrl}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: CONFIG.appId,
      app_secret: CONFIG.appSecret,
    }),
  });
  
  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`获取 token 失败: ${data.msg} (code: ${data.code})`);
  }
  
  console.log('✅ 获取 tenant_access_token 成功');
  return data.tenant_access_token;
}

// ===== 获取文档元信息 =====
async function getDocumentMeta(token, documentId) {
  const res = await fetch(`${CONFIG.baseUrl}/open-apis/docx/v1/documents/${documentId}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  
  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`获取文档元信息失败: ${data.msg} (code: ${data.code})`);
  }
  
  return data.data.document;
}

// ===== 获取文档全部块（blocks）=====
async function getDocumentBlocks(token, documentId) {
  let allBlocks = [];
  let pageToken = '';
  
  do {
    const url = new URL(`${CONFIG.baseUrl}/open-apis/docx/v1/documents/${documentId}/blocks`);
    url.searchParams.set('page_size', '500');
    if (pageToken) url.searchParams.set('page_token', pageToken);
    
    const res = await fetch(url.toString(), {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    
    const data = await res.json();
    if (data.code !== 0) {
      throw new Error(`获取文档块失败: ${data.msg} (code: ${data.code})`);
    }
    
    allBlocks = allBlocks.concat(data.data.items || []);
    pageToken = data.data.page_token || '';
  } while (pageToken);
  
  return allBlocks;
}

// ===== 获取文档纯文本内容 =====
async function getDocumentRawContent(token, documentId) {
  const res = await fetch(`${CONFIG.baseUrl}/open-apis/docx/v1/documents/${documentId}/raw_content`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  
  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`获取文档原始内容失败: ${data.msg} (code: ${data.code})`);
  }
  
  return data.data.content;
}

// ===== 解析 blocks 为结构化数据 =====
function parseBlocks(blocks) {
  const result = [];
  
  for (const block of blocks) {
    const blockType = block.block_type;
    let content = '';
    
    switch (blockType) {
      case 2: // 文本 (text)
        content = extractTextFromElements(block.text?.elements);
        if (content) result.push({ type: 'text', content });
        break;
      case 3: // 标题1 (heading1)
        content = extractTextFromElements(block.heading1?.elements);
        if (content) result.push({ type: 'heading1', content });
        break;
      case 4: // 标题2 (heading2)
        content = extractTextFromElements(block.heading2?.elements);
        if (content) result.push({ type: 'heading2', content });
        break;
      case 5: // 标题3 (heading3)
        content = extractTextFromElements(block.heading3?.elements);
        if (content) result.push({ type: 'heading3', content });
        break;
      case 10: // 有序列表 (ordered)
        content = extractTextFromElements(block.ordered?.elements);
        if (content) result.push({ type: 'ordered_list', content });
        break;
      case 11: // 无序列表 (bullet)
        content = extractTextFromElements(block.bullet?.elements);
        if (content) result.push({ type: 'bullet_list', content });
        break;
      case 12: // 代码块 (code)
        content = extractTextFromElements(block.code?.elements);
        if (content) result.push({ type: 'code', content, language: block.code?.style?.language });
        break;
      case 18: // 表格 (table)
        result.push({ type: 'table', blockId: block.block_id, children: block.children });
        break;
      default:
        // 其他块类型记录原始数据
        result.push({ type: `block_type_${blockType}`, raw: block });
        break;
    }
  }
  
  return result;
}

function extractTextFromElements(elements) {
  if (!elements) return '';
  return elements
    .map(el => {
      if (el.text_run) return el.text_run.content || '';
      if (el.mention_user) return `@${el.mention_user.user_id}`;
      if (el.mention_doc) return `[doc:${el.mention_doc.token}]`;
      return '';
    })
    .join('');
}

// ===== 主逻辑 =====
async function pullDocument(documentId = CONFIG.documentId) {
  console.log(`\n📄 开始拉取飞书文档: ${documentId}`);
  console.log(`   URL: https://wy75ubw5kb.feishu.cn/docx/${documentId}\n`);
  
  if (!CONFIG.appId || !CONFIG.appSecret) {
    console.error('❌ 请设置环境变量 FEISHU_APP_ID 和 FEISHU_APP_SECRET');
    console.log('\n使用方法:');
    console.log('  FEISHU_APP_ID=cli_xxx FEISHU_APP_SECRET=xxx node scripts/feishu-doc-puller.mjs');
    console.log('\n或在 .env 文件中配置');
    process.exit(1);
  }
  
  // 1. 获取 token
  const token = await getTenantToken();
  
  // 2. 获取文档元信息
  const meta = await getDocumentMeta(token, documentId);
  console.log(`📋 文档标题: ${meta.title}`);
  console.log(`   修订版本: ${meta.revision_id}`);
  
  // 3. 获取纯文本内容
  console.log('\n📝 拉取纯文本内容...');
  const rawContent = await getDocumentRawContent(token, documentId);
  
  // 4. 获取结构化块内容
  console.log('🧱 拉取结构化块内容...');
  const blocks = await getDocumentBlocks(token, documentId);
  const parsed = parseBlocks(blocks);
  console.log(`   共 ${blocks.length} 个块，解析出 ${parsed.length} 个内容段`);
  
  // 5. 保存到本地
  if (!fs.existsSync(CONFIG.outputDir)) {
    fs.mkdirSync(CONFIG.outputDir, { recursive: true });
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const output = {
    documentId,
    title: meta.title,
    revision: meta.revision_id,
    fetchedAt: new Date().toISOString(),
    rawContent,
    structured: parsed,
    rawBlocks: blocks,
  };
  
  // 保存最新版本（覆盖）
  const latestFile = path.join(CONFIG.outputDir, `${documentId}_latest.json`);
  fs.writeFileSync(latestFile, JSON.stringify(output, null, 2), 'utf-8');
  
  // 保存带时间戳的版本（归档）
  const archiveFile = path.join(CONFIG.outputDir, `${documentId}_${timestamp}.json`);
  fs.writeFileSync(archiveFile, JSON.stringify(output, null, 2), 'utf-8');
  
  console.log(`\n✅ 拉取完成！`);
  console.log(`   最新文件: ${latestFile}`);
  console.log(`   归档文件: ${archiveFile}`);
  
  return output;
}

// ===== 定时拉取模式 =====
async function startPolling(intervalMs = 60000) {
  console.log(`\n🔄 启动定时拉取模式，间隔: ${intervalMs / 1000}s`);
  
  const poll = async () => {
    try {
      await pullDocument();
    } catch (err) {
      console.error(`❌ 拉取失败: ${err.message}`);
    }
  };
  
  await poll(); // 立即执行一次
  setInterval(poll, intervalMs);
}

// ===== CLI 入口（仅直接运行时执行） =====
const isMainModule = process.argv[1] && (
  process.argv[1].endsWith('feishu-doc-puller.mjs') || 
  process.argv[1].endsWith('feishu-doc-puller')
);

if (isMainModule) {
  const args = process.argv.slice(2);

  if (args.includes('--poll')) {
    const interval = parseInt(args[args.indexOf('--poll') + 1]) || 60;
    startPolling(interval * 1000);
  } else if (args.includes('--help')) {
    console.log(`
飞书文档拉取器 - 将工作流输出的飞书文档同步到本地

用法:
  node scripts/feishu-doc-puller.mjs                  # 单次拉取
  node scripts/feishu-doc-puller.mjs --poll 60        # 每60秒定时拉取
  node scripts/feishu-doc-puller.mjs --doc <docId>    # 指定文档ID

环境变量:
  FEISHU_APP_ID      飞书应用 App ID
  FEISHU_APP_SECRET  飞书应用 App Secret
  FEISHU_DOC_ID      默认文档 ID

注意：
  飞书应用需要开通 "云文档" 相关权限:
  - docx:document:readonly  (读取文档内容)
  - docx:document           (如需写入)
`);
  } else {
    const docIdIdx = args.indexOf('--doc');
    const docId = docIdIdx > -1 ? args[docIdIdx + 1] : CONFIG.documentId;
    pullDocument(docId).catch(err => {
      console.error(`\n❌ 错误: ${err.message}`);
      process.exit(1);
    });
  }
}

export { pullDocument, getTenantToken, getDocumentBlocks, getDocumentRawContent };
