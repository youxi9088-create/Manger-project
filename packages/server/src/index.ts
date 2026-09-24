import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 加载项目根目录的 .env
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

// 加载运行时配置（data/server-config.json）到 process.env
try {
  const configPath = path.resolve(__dirname, '..', '..', '..', 'data', 'server-config.json');
  if (fs.existsSync(configPath)) {
    const runtimeConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    for (const [k, v] of Object.entries(runtimeConfig)) {
      if (typeof v === 'string') process.env[k] = v;
    }
    console.log(`[Init] 已加载运行时配置 (${Object.keys(runtimeConfig).length} 项)`);
  }
} catch (e) {
  console.error('[Init] 加载运行时配置失败:', e);
}

console.log('========== 环境变量检查 ==========');
console.log('PORT:', process.env.SERVER_PORT || process.env.PORT || '3001');
console.log('CODEBUDDY_API_KEY:', process.env.CODEBUDDY_API_KEY ? `${process.env.CODEBUDDY_API_KEY.substring(0, 15)}...` : 'N/A');
console.log('===================================');

import express from "express";

// 导入路由
import healthRoutes from "./routes/health.js";
import authRoutes from "./routes/auth.js";
import chatRoutes from "./routes/chat.js";
import imSourcesRoutes from "./routes/im-sources.js";
import imRecordsRoutes from "./routes/im-records.js";
import analysisRoutes from "./routes/analysis.js";
import schedulesRoutes, { initScheduledTasks, ensureDefaultScheduledTask } from "./routes/schedules.js";
import imU9Routes from "./routes/im-u9.js";
import imFetchTodayRoutes from "./routes/im-fetch-today.js";
import imLocalDbRoutes from "./routes/im-local-db.js";
import meetingsRoutes from "./routes/meetings.js";
import automationRoutes from "./routes/automation.js";
import projectInitiationRoutes from "./routes/project-initiation.js";
import requirementsRoutes from "./routes/requirements.js";
import employeeRoutes from "./routes/employees.js";
import workCycleRoutes from "./routes/work-cycles.js";
import versionRoutes from "./routes/versions.js";
import agentRoutes from "./routes/agents.js";
import agentMainRoutes from "./routes/agent-main.js";
import dailyPlanRoutes from "./routes/daily-plans.js";
import projectRoutes from "./routes/projects.js";
import projectRequirementsRoutes from "./routes/project-requirements.js";
import projectTasksRoutes from "./routes/project-tasks.js";
import projectDeliveriesRoutes from "./routes/project-deliveries.js";
import peopleRoutes from "./routes/people.js";
import workflowRoutes from "./routes/workflow.js";
import autoOrderConfigRoutes from "./routes/auto-order-config.js";
import mcpKeysRoutes from "./routes/mcp-keys.js";
import mcpApplyRoutes from "./routes/mcp-apply.js";
import mcpToolsListRoutes from "./routes/mcp-tools-list.js";
import mcpCallRoutes from "./routes/mcp-call.js";
import mcpSseRoutes from "./mcp/mcp-sse-route.js";

export const app = express();
const PORT = process.env.SERVER_PORT || process.env.PORT || 3001;

// MCP SSE 路由必须在 express.json() 之前挂载，以便 POST /mcp/messages 能读取原始请求体
app.use(mcpSseRoutes);

// 确保数据目录存在
const DATA_DIR = process.env.OPENCLAW_DATA_DIR || path.resolve(__dirname, '..', '..', '..', 'data');
const MEETINGS_DIR = path.join(DATA_DIR, 'meetings');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
for (const dir of [DATA_DIR, MEETINGS_DIR, UPLOADS_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// 中间件（MCP 路由已提前挂载，避免 JSON 解析器消耗原始请求体）
app.use(express.json());

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// 静态文件（生产环境）
const distPath = path.resolve(__dirname, '..', '..', 'im-analyzer', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}

// 注册路由
app.use(healthRoutes);
app.use(authRoutes);
app.use(chatRoutes);
app.use(imSourcesRoutes);
app.use(imRecordsRoutes);
app.use(analysisRoutes);
app.use(schedulesRoutes);
app.use(imU9Routes);
app.use(imFetchTodayRoutes);
app.use(imLocalDbRoutes);
app.use(meetingsRoutes);
app.use(automationRoutes);
app.use(projectInitiationRoutes);
app.use(requirementsRoutes);
app.use(employeeRoutes);
app.use(workCycleRoutes);
app.use(versionRoutes);
app.use(agentRoutes);
app.use(agentMainRoutes);
app.use(dailyPlanRoutes);
app.use(projectRoutes);
app.use(projectRequirementsRoutes);
app.use(projectTasksRoutes);
app.use(projectDeliveriesRoutes);
app.use(peopleRoutes);
app.use(workflowRoutes);
app.use(autoOrderConfigRoutes);
app.use(mcpKeysRoutes);
app.use(mcpApplyRoutes);
app.use(mcpToolsListRoutes);
app.use(mcpCallRoutes);

// SPA 回退
app.get("*", (req, res) => {
  const indexPath = path.join(distPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(200).json({
      message: 'OpenClaw 统一后端服务运行中',
      api: `http://localhost:${PORT}`,
      routes: [
        '/api/health', '/api/check-login', '/api/models',
        '/api/sessions', '/api/chat',
        '/api/im/sources', '/api/im/chat-records', '/api/im/stats',
        '/api/im/u9-conversations', '/api/im/auto-setup', '/api/im/fetch-today',
        '/api/im/local/connect', '/api/im/local/messages',
        '/api/analysis/reports', '/api/analysis/run',
        '/api/meetings', '/api/meetings/audio-url', '/api/meetings/process',
        '/api/schedules',
        '/api/project-initiation',
      ]
    });
  }
});

export function startServer() {
  return app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════╗
║         OpenClaw 统一后端服务已启动               ║
║                                                  ║
║   地址: http://localhost:${PORT}                    ║
║   数据: ${DATA_DIR}
║                                                  ║
║   已注册路由:                                     ║
║   - health / auth / chat                          ║
║   - im-sources / im-records / im-u9               ║
║   - im-fetch-today / im-local-db                  ║
║   - analysis / schedules / meetings               ║
╚══════════════════════════════════════════════════╝
  `);

    initScheduledTasks();
    ensureDefaultScheduledTask();
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  startServer();
}
