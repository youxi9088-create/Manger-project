import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pullDocument, getTenantToken, getDocumentRawContent } from './feishu-doc-puller.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.WEBHOOK_PORT || 3002;

// 解析 JSON body
app.use(express.json({ limit: '10mb' }));

// Webhook 接收日志
const logFile = path.resolve(__dirname, '..', 'webhook-logs.jsonl');

// ===== Webhook 接收端点 =====
app.post('/webhook/workflow', (req, res) => {
  const timestamp = new Date().toISOString();
  const payload = {
    timestamp,
    headers: req.headers,
    body: req.body,
  };
  
  console.log(`\n📥 [${timestamp}] 收到工作流推送:`);
  console.log(JSON.stringify(req.body, null, 2).substring(0, 1000));
  
  // 追加写入日志文件
  fs.appendFileSync(logFile, JSON.stringify(payload) + '\n');
  
  // 返回成功（AIAE HTTP 节点需要 2xx 响应）
  res.status(200).json({ 
    status: 'received', 
    timestamp,
    message: 'OK' 
  });
});

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// ===== 飞书文档拉取端点 =====
// GET /feishu/doc/:docId - 拉取指定飞书文档内容
app.get('/feishu/doc/:docId', async (req, res) => {
  try {
    const { docId } = req.params;
    console.log(`\n📄 收到文档拉取请求: ${docId}`);
    const result = await pullDocument(docId);
    res.json({ status: 'success', data: result });
  } catch (err) {
    console.error(`❌ 拉取文档失败: ${err.message}`);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// GET /feishu/doc - 拉取默认文档（工作流输出的那个）
app.get('/feishu/doc', async (req, res) => {
  try {
    const docId = process.env.FEISHU_DOC_ID || 'OasIdPqkto5WslxFXhNcWIKun3e';
    console.log(`\n📄 拉取默认工作流文档: ${docId}`);
    const result = await pullDocument(docId);
    res.json({ status: 'success', data: result });
  } catch (err) {
    console.error(`❌ 拉取文档失败: ${err.message}`);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// GET /feishu/doc/:docId/text - 只获取文档纯文本
app.get('/feishu/doc/:docId/text', async (req, res) => {
  try {
    const { docId } = req.params;
    const token = await getTenantToken();
    const content = await getDocumentRawContent(token, docId);
    res.type('text/plain').send(content);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// 查看最近的推送记录
app.get('/webhook/logs', (req, res) => {
  if (!fs.existsSync(logFile)) {
    return res.json([]);
  }
  const lines = fs.readFileSync(logFile, 'utf-8').trim().split('\n').filter(Boolean);
  const recent = lines.slice(-20).map(l => JSON.parse(l));
  res.json(recent);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Webhook 服务已启动: http://localhost:${PORT}`);
  console.log(`\n📋 AIAE 工作流 HTTP 节点配置:`);
  console.log(`   URL:    http://<你的公网IP或域名>:${PORT}/webhook/workflow`);
  console.log(`   Method: POST`);
  console.log(`   Header: Content-Type: application/json`);
  console.log(`   Body:   工作流输出变量（JSON）`);
  console.log(`\n💡 如果没有公网 IP，可以用 ngrok/frp 做内网穿透:`);
  console.log(`   npx ngrok http ${PORT}`);
  console.log(`\n📂 日志保存在: ${logFile}`);
});
