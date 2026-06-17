# OpenClaw 工作室 - 三项目功能梳理与重构方案

> 创建时间：2026-04-14
> 用途：记录三个项目（Claw Studio / IM Chat Analyzer / MCP）的完整功能清单、代码位置、依赖关系，以及合并为统一工程的重构方案。

---

## 一、项目概览

| 项目 | 技术栈 | 端口 | 核心功能 |
|------|--------|------|----------|
| Claw Studio | Next.js 16 + React 19 + shadcn/ui | 5000 | 中枢平台：每日工作、事务管理、工具集合 |
| IM Chat Analyzer | Vite + React 18 + TDesign + Express | 前端5173 / 后端3001 | IM聊天分析、AI对话、99U集成 |
| MCP | Vite + React 19 + Tailwind CDN | 前端3002 / 后端3001* / 会议桥3003 | 飞书-OA自动下单 |

> *注：MCP automation.js 和 IM Chat Analyzer 后端都使用 3001 端口，存在冲突。

---

## 二、功能模块清单

### 2.1 每日工作管理

| 功能 | 当前文件 | 行数 | 说明 |
|------|----------|------|------|
| 每日任务页面 | `claw studio/src/app/daily/page.tsx` | 507 | 任务CRUD、状态切换、localStorage持久化 |
| AI生成任务API | `claw studio/src/app/api/daily-plan/generate/route.ts` | 269 | 从IM分析报告提取待办 → LLM补充 |
| 从聊天导入 | `claw studio/src/app/daily/page.tsx` importFromAnalysis() | - | 调 im-chat-analyzer `/api/analysis/reports?limit=1` |

### 2.2 事务列表（静态页面）

| 页面 | 当前文件 | 行数 |
|------|----------|------|
| 首页 | `claw studio/src/app/tasks/page.tsx` | 82 |
| 项目立项 | `claw studio/src/app/tasks/project-initiation/page.tsx` | 81 |
| 需求分析 | `claw studio/src/app/tasks/requirements/page.tsx` | 59 |
| 任务拆解 | `claw studio/src/app/tasks/task-breakdown/page.tsx` | 81 |
| 交付管理 | `claw studio/src/app/tasks/delivery/page.tsx` | 86 |

### 2.3 快速搜索（AI对话）

| 功能 | 当前文件 | 行数 | 说明 |
|------|----------|------|------|
| 前端页面 | `claw studio/src/app/tools/quick-search/page.tsx` | 370 | 多会话、流式SSE、localStorage |
| 聊天代理API | `claw studio/src/app/api/quick-search/route.ts` | 98 | 转发到OPENAI_BASE_URL |
| 健康检查API | `claw studio/src/app/api/quick-search/health/route.ts` | 159 | 探测models/chat/responses |

### 2.4 会议助手

#### 前端
| 文件 | 当前位置 | 行数 |
|------|----------|------|
| 页面 | `claw studio/src/app/tools/meeting-assistant/page.tsx` | 434 |

#### Next.js API Routes
| API | 当前文件 | 行数 | 功能 |
|-----|----------|------|------|
| POST /api/meetings | `claw studio/src/app/api/meetings/route.ts` | 16 | 获取列表 |
| POST /api/meetings/process | `claw studio/src/app/api/meetings/process/route.ts` | 439 | 下载+ASR+纪要 |
| GET /api/meetings/download | `claw studio/src/app/api/meetings/download/route.ts` | 49 | 下载音频 |
| GET /api/meetings/versions | `claw studio/src/app/api/meetings/versions/route.ts` | 21 | 版本历史 |
| POST /api/meetings/cleanup | `claw studio/src/app/api/meetings/cleanup/route.ts` | 16 | 清理旧媒体 |

#### 核心服务
| 文件 | 当前位置 | 行数 | 功能 | 状态 |
|------|----------|------|------|------|
| meeting-service.ts | `claw studio/src/lib/meeting-service.ts` | 812 | 认证/下载/持久化/版本 | ✅ 使用中 |
| volc-asr-upload.ts | `claw studio/src/lib/volc-asr-upload.ts` | 160 | 火山ASR v3 base64上传 | ✅ 首选ASR |
| volc-asr.ts | `claw studio/src/lib/volc-asr.ts` | 137 | 火山ASR v3 URL方式 | ❌ 已弃用 |
| tencent-asr.ts | `claw studio/src/lib/tencent-asr.ts` | 146 | 腾讯云短音频ASR | ⚠️ 备选 |
| meeting-api.ts | `claw studio/src/lib/meeting-api.ts` | 262 | Playwright模拟 | ❌ 废弃代码 |

#### im-chat-analyzer中的会议相关（server/index.ts内）
| 功能 | 行号 | 说明 |
|------|------|------|
| downloadMeetingAudio | 119-181 | 音频下载辅助 |
| downloadViaBrowser | 183-218 | 浏览器下载 |
| ensureMeetingLogin | 511-631 | Playwright登录会议系统 |
| POST /api/meetings | 634-730 | Playwright爬取列表 |
| POST /api/meetings/audio-url | 751-800 | Playwright获取真实链接 |
| POST /api/meetings/process | 801-939 | SSE处理流 |

#### MCP中的会议相关
| 文件 | 说明 | 状态 |
|------|------|------|
| `mcp/meeting-bridge-server.mjs` | 纯占位501 | ❌ 删除 |

### 2.5 IM聊天记录分析

#### 前端页面
| 文件 | 当前位置 | 行数 | 说明 |
|------|----------|------|------|
| App.tsx | `im-chat-analyzer/src/App.tsx` | 218 | 路由分发 |
| AnalysisPage.tsx | `im-chat-analyzer/src/pages/AnalysisPage.tsx` | 2210 | **需拆分** |
| ChatPage.tsx | `im-chat-analyzer/src/pages/ChatPage.tsx` | 127 | AI对话 |
| SettingsPage.tsx | `im-chat-analyzer/src/components/SettingsPage.tsx` | 921 | Agent配置 |

#### 前端Hooks
| Hook | 行数 | 功能 |
|------|------|------|
| useImAnalysis.ts | 694 | 7个hook合集 |
| useChat.ts | 392 | AI Agent对话 |
| useAutoSetup.ts | 166 | 99U自动配置 |
| useSessions.ts | 130 | 会话管理 |
| useModels.ts | 33 | 模型列表 |
| useAgents.ts | 70 | Agent CRUD |
| useTheme.ts | 34 | 主题切换 |

#### 前端Components
| 组件 | 行数 |
|------|------|
| ToolCallsCollapse.tsx | 761 |
| AgentConfigDialog.tsx | 369 |
| NewChatDialog.tsx | 199 |
| PermissionDialog.tsx | 198 |
| ChatMessages.tsx | 185 |
| NewChatView.tsx | 168 |
| ChatInput.tsx | 161 |
| Sidebar.tsx | 151 |
| InlinePermissionCard.tsx | 121 |
| Header.tsx | 88 |

### 2.6 IM分析后端（server/index.ts 3370行 55个API）

| 功能域 | 行号范围 | API数 | 说明 |
|--------|----------|-------|------|
| 初始化/配置 | 1-105 | 0 | dotenv、CORS、静态文件 |
| 会议音频下载 | 119-218 | 0 | downloadMeetingAudio |
| 认证/模型 | 220-465 | 4 | getAuthToken、check-login、models |
| Playwright会议 | 506-631 | 0 | ensureMeetingLogin |
| 会议API | 634-800 | 3 | meetings列表、audio-url、process |
| AI Agent对话 | 940-1183 | 5 | sessions CRUD、chat SSE |
| IM数据源 | 1184-1278 | 6 | sources CRUD+conversations |
| 聊天记录 | 1279-1505 | 5 | chat-records查询/导入 |
| 99U API | 1544-1779 | 5 | u9-conversations、refresh |
| 99U自动配置 | 1780-2241 | 2 | auto-setup（460行）、sms |
| 获取当天记录 | 2242-2434 | 1 | fetch-today（190行） |
| 本地数据库 | 2435-2877 | 10 | local/* + local-db/* |
| 分析报告 | 2878-3160 | 4 | stats、reports、run |
| 定时任务 | 3161-3310 | 3 | schedules CRUD |
| SPA回退+启动 | 3310-3370 | 1 | listen |

#### 后端模块文件
| 文件 | 行数 | 功能 | 状态 |
|------|------|------|------|
| db.ts | 781 | SQLite数据库层 | ✅ |
| analysis.ts | 168 | 分析提示词+解析 | ✅ |
| u9-api.ts | 411 | 99U IM API | ✅ |
| im-db.ts | 294 | 本地加密DB | ✅ |
| local-db-parser.ts | 309 | 本地DB解析 | ⚠️ 与im-db.ts重复 |
| routes/analysis-routes.ts | 204 | 分析路由模块 | ❌ 未注册使用 |

### 2.7 自动下单（MCP）

#### 前端
| 文件 | 当前位置 | 行数 | 功能 |
|------|----------|------|------|
| App.tsx | `mcp/App.tsx` | 484 | 五Tab：仪表盘/任务队列/字段映射/配置/日志 |
| Dashboard.tsx | `mcp/components/Dashboard.tsx` | 122 | 统计卡片+图表+日志 |
| TaskList.tsx | `mcp/components/TaskList.tsx` | 361 | 任务列表+批量执行 |
| MappingPanel.tsx | `mcp/components/MappingPanel.tsx` | 121 | 字段映射配置 |
| ConfigPanel.tsx | `mcp/components/ConfigPanel.tsx` | 201 | 飞书/OA系统配置 |
| TerminalOutput.tsx | `mcp/components/TerminalOutput.tsx` | 77 | 实时日志 |

#### 后端
| 文件 | 当前位置 | 行数 | 端口 | 功能 |
|------|----------|------|------|------|
| automation.js | `mcp/automation.js` | 455 | 3001 | Playwright RPA自动填单 |
| meeting-bridge-server.mjs | `mcp/meeting-bridge-server.mjs` | 41 | 3003 | ❌ 纯占位 |
| save_auth.mjs | `mcp/save_auth.mjs` | 30 | - | 手动登录保存auth.json |
| open-oa.js | `mcp/open-oa.js` | 31 | - | 打开OA自动登录 |

#### 配置存储
- 系统配置：`localStorage['mcp_automation_config_v1']`
- 字段映射：`localStorage['mcp_mapping_{tableId}']`
- 任务数据：`localStorage['mcp_tasks_{tableId}']`
- OA认证：`mcp/auth.json`

#### 类型定义（重复）
- `mcp/types.ts` (65行) = `claw studio/src/lib/mcp-types.ts` (65行)

---

## 三、跨项目依赖关系

```
┌─────────────────────────────────────────────────────┐
│              Claw Studio (:5000)                     │
│                                                      │
│  /tools/chat-analyzer ──iframe──→ IM Analyzer :5173  │
│  /tools/auto-order ────iframe──→ MCP :3002           │
│                                                      │
│  /api/daily-plan/generate ─HTTP─→ IM :3001           │
│    GET /api/analysis-reports/latest                   │
│                                                      │
│  /daily importFromAnalysis ─HTTP─→ IM :3001          │
│    GET /api/analysis/reports?limit=1                  │
│                                                      │
│  /api/meetings/process ────HTTP─→ IM :3001           │
│    POST /api/meetings/audio-url                      │
│                                                      │
│  meeting-service.ts 读取:                            │
│    im-chat-analyzer/meeting-auth.json                │
│    im-chat-analyzer/meeting-audio-links.json         │
└──────────────────────────────────────────────────────┘
```

---

## 四、需要清理的文件

### Claw Studio 根目录
- test-download.mjs, test-final.mjs, test-integration.sh, test-manual-transcribe.mjs, test-meeting-api.mjs, test-meeting.mjs, test-transcribe-final.mjs, test-transcribe-with-directurl.mjs, test-transcribe.mjs, test-volc-transcribe.mjs
- TRANSCRIBE_FINAL_SOLUTION.md, TRANSCRIBE_ISSUE_ANALYSIS.md, TRANSCRIBE_WITH_VOLC_ASR.md
- MEETING_REAL_DATA_CONFIRMED.md, MEETING_SERVICE_SETUP.md
- DAILY_TASKS_INTEGRATION.md, DATA_PERSISTENCE.md, DATA_SAFETY_CONFIRMATION.md
- INTEGRATION_SUMMARY.md, FIX_DATETIME_INPUT.md, TEST_IMPORT_TASKS.md
- tunnel.log, start-tunnel.sh

### IM Chat Analyzer 根目录
- test-*.mjs/mts/cjs (~30个)
- analyze-db*.mjs (5个)
- verify-*.mts (4个), capture-*.mts (3个)
- *.log, *.txt (日志), temp-*.json, fix-*.cjs
- exhaustive-test*.mts, extract-message-apis.mts, brute-force-key.mts

### MCP
- meeting-bridge-server.mjs (纯占位)
- popup-code.txt (110KB, 调试数据)
- capture-popup.spec.ts, sync-bitable-to-oa.spec.ts (旧测试)
- open-oa.cjs (重复)

### 废弃/重复代码
- `claw studio/src/lib/meeting-api.ts` → 废弃（纯mock）
- `claw studio/src/lib/volc-asr.ts` → 被 volc-asr-upload.ts 替代
- `im-chat-analyzer/server/local-db-parser.ts` → 与 im-db.ts 重复
- `im-chat-analyzer/server/routes/analysis-routes.ts` → 未注册使用
- 所有 `server/*.js` + `server/*.d.ts` → 编译产物

---

## 五、重构后目标结构

```
openclaw/
├── packages/
│   ├── web/                          ← Next.js 主站 (原 Claw Studio)
│   │   └── src/
│   │       ├── app/
│   │       │   ├── daily/            ← 每日工作
│   │       │   ├── tasks/            ← 事务列表
│   │       │   ├── tools/
│   │       │   │   ├── auto-order/   ← 自动下单（直接集成，不再iframe）
│   │       │   │   ├── meeting-assistant/
│   │       │   │   ├── quick-search/
│   │       │   │   └── chat-analyzer/ ← 直接集成或保持iframe
│   │       │   └── api/              ← Next.js API Routes
│   │       ├── components/
│   │       │   ├── ui/               ← shadcn/ui 组件
│   │       │   └── auto-order/       ← MCP的5个组件搬入
│   │       └── lib/
│   │
│   ├── im-analyzer/                  ← IM分析前端 (原 im-chat-analyzer 前端)
│   │   └── src/                      ← 保持 Vite + TDesign 不变
│   │       ├── pages/
│   │       │   ├── AnalysisPage/     ← 拆分为多个子组件
│   │       │   │   ├── index.tsx
│   │       │   │   ├── DashboardTab.tsx
│   │       │   │   ├── RecordsTab.tsx
│   │       │   │   ├── ReportsTab.tsx
│   │       │   │   └── SettingsTab.tsx
│   │       │   └── ChatPage.tsx
│   │       ├── hooks/
│   │       └── components/
│   │
│   ├── server/                       ← 统一 Express 后端
│   │   └── src/
│   │       ├── index.ts              ← Express入口（<100行）
│   │       ├── routes/               ← 按功能拆分路由
│   │       │   ├── health.ts
│   │       │   ├── auth.ts
│   │       │   ├── chat.ts
│   │       │   ├── im-sources.ts
│   │       │   ├── im-records.ts
│   │       │   ├── im-u9.ts
│   │       │   ├── im-local-db.ts
│   │       │   ├── im-fetch-today.ts
│   │       │   ├── analysis.ts
│   │       │   ├── meetings.ts
│   │       │   ├── schedules.ts
│   │       │   └── automation.ts
│   │       ├── services/
│   │       │   ├── db.ts
│   │       │   ├── analysis-service.ts
│   │       │   ├── u9-api.ts
│   │       │   ├── im-db.ts
│   │       │   ├── meeting-service.ts
│   │       │   ├── meeting-playwright.ts
│   │       │   ├── volc-asr.ts
│   │       │   ├── tencent-asr.ts
│   │       │   ├── oa-automation.ts
│   │       │   └── agent-sdk.ts
│   │       └── utils/
│   │
│   └── shared/                       ← 共享类型
│       └── types/
│           ├── automation.ts
│           ├── meeting.ts
│           ├── analysis.ts
│           └── im.ts
│
├── data/                             ← 统一数据目录
│   ├── chat.db                       ← SQLite
│   ├── meetings/                     ← 音频+纪要
│   ├── uploads/
│   └── auth/
│       ├── meeting-auth.json
│       └── oa-auth.json
│
├── scripts/
│   └── save-oa-auth.ts
│
├── .env                              ← 统一环境变量
├── pnpm-workspace.yaml
├── package.json
├── ARCHITECTURE.md                   ← 本文档
└── start.bat                         ← 一键启动
```

---

## 六、环境变量统一

```bash
# ====== 服务端口 ======
WEB_PORT=5000
SERVER_PORT=3001
IM_ANALYZER_PORT=5173

# ====== 99U IM ======
U9_API_BASE_URL=https://im-message-search.sdp.101.com
U9_API_AUTH_ID=...
U9_API_AUTH_KEY=...
U9_SDP_APP_ID=...
U9_API_DIFF=-68
U9_CONVERSATIONS=...
U9_MY_NAME=游浠

# ====== AI/LLM ======
CODEBUDDY_API_KEY=...
CODEBUDDY_INTERNET_ENVIRONMENT=internal
MOONSHOT_API_KEY=...
MOONSHOT_BASE_URL=https://api.moonshot.cn/v1
OPENAI_API_KEY=...
OPENAI_BASE_URL=https://z.apiyihe.org/v1
OPENAI_CHAT_MODEL=moonshot-v1-128k

# ====== ASR ======
VOLC_ASR_API_KEY=...
VOLC_ASR_RESOURCE_ID=volc.seedasr.auc
VOLC_ASR_SUBMIT_URL=https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit
VOLC_ASR_QUERY_URL=https://openspeech.bytedance.com/api/v3/auc/bigmodel/query
VOLC_ASR_TIMEOUT_MS=600000

# ====== 会议系统 ======
MEETING_USERNAME=986916
MEETING_PASSWORD=Youxi0921

# ====== 数据 ======
DB_PATH=./data/chat.db
MEETING_DATA_DIR=./data/meetings
```
