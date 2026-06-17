# OpenClaw 工作室 - 工程结构与功能清单

> 更新时间：2026-06-11（首页驾驶舱 & 项目自动同步 & 聊天分析原生化）
> 位置：`F:\youxi\app\openclaw`

---

## 一、项目概览

由三个独立项目（Claw Studio / IM Chat Analyzer / MCP 自动下单）合并为统一 Monorepo。

| 子包 | 技术栈 | 端口 | 核心功能 |
|------|--------|------|----------|
| `packages/web` | Next.js 15.2.4 + React 19 + shadcn/ui | 5000 | 中枢平台：今日工作驾驶舱、每日工作、事务管理、工具集合、项目看板 |
| `packages/im-analyzer` | Vite + React 18 + TDesign | 5173 | IM 聊天分析、AI 对话、99U 集成 |
| `packages/server` | Express + TypeScript + SQLite | 3001 | 统一后端（80+ API） |
| `packages/shared` | TypeScript 类型 | - | 共享类型定义 |

### 启动方式（推荐）

> 说明：根目录 `pnpm dev` 默认只启动 `server + web`；`im-analyzer` 需使用 `dev:all` 或单独启动。

```bash
# 安装依赖
pnpm install

# 启动主站 + 后端
pnpm dev
# - web:    http://localhost:5000
# - server: http://localhost:3001

# 启动全部（主站 + 后端 + IM 分析前端）
pnpm dev:all
# - im-analyzer: http://localhost:5173

# 单独启动 IM 分析前端
a) pnpm -F @openclaw/im-analyzer dev
# or
b) cd packages/im-analyzer && pnpm dev
```

### 启动方式（兼容旧习惯）

```bash
# 一键启动（双击）
start.bat

# 模式启动
# start.bat           -> 启动 web + server
# start.bat all       -> 启动 web + server + im-analyzer
# start.bat web       -> 仅启动 web
# start.bat server    -> 仅启动 server
# start.bat im        -> 仅启动 im-analyzer

# 说明：start-server.bat / start-web.bat 已废弃（历史遗留：硬编码路径 + npx 调用），
# 仅保留为提示入口，统一改用 start.bat。
```

> 提示：主站的 IM 聊天分析入口页面为 `/tools/chat-analyzer`，其 iframe 指向的地址来自环境变量：
> - `NEXT_PUBLIC_IM_ANALYZER_URL`（优先）
> - 未设置时默认：`http://localhost:5173`

---

## 二、目录结构

```
openclaw/
├── .env                              ← 统一环境变量（API 密钥、99U 配置、会话映射）
├── .gitignore
├── .npmrc                            ← node-linker=hoisted
├── package.json                      ← monorepo 根配置
├── pnpm-workspace.yaml               ← pnpm 工作空间定义
├── tsconfig.base.json                ← 共享 TypeScript 基础配置
├── start.bat                         ← 一键启动 3 个服务
├── ARCHITECTURE.md                   ← 原始架构设计文档
│
├── data/                             ← 统一数据目录
│   ├── chat.db                       ← SQLite 数据库（10 张表）
│   ├── auth/
│   │   ├── meeting-auth.json         ← 网龙会议系统认证（localStorage 导出）
│   │   └── oa-auth.json              ← OA 系统 Playwright storageState
│   ├── meetings/
│   │   ├── *_audio.mp3               ← 会议音频文件
│   │   ├── result__*.json            ← 会议纪要+转录结果（含版本历史）
│   │   └── meeting-audio-links.json  ← 会议标题→音频 URL 映射（Playwright 抓取）
│   └── uploads/                      ← 上传文件临时目录
│
├── packages/
│   ├── web/                          ← Next.js 主站
│   │   ├── src/app/                  ← 页面路由 + API Routes
│   │   ├── src/components/           ← UI 组件（含业务组件和 shadcn/ui）
│   │   │   ├── project-initiation/   ← 项目立项组件
│   │   │   ├── requirements/         ← 需求分析组件
│   │   │   ├── auto-order/           ← 自动下单组件
│   │   │   ├── agent/  ✨            ← Agent 专属组件（ToolCallCard / ExecAgentCard）
│   │   │   └── ui/                   ← shadcn/ui 基础组件（62 个）
│   │   ├── src/lib/                  ← 前端专用工具库
│   │   └── src/hooks/                ← React Hooks
│   ├── im-analyzer/                  ← IM 分析前端
│   ├── server/                       ← 统一后端
│   │   ├── src/routes/               ← Express 路由（14 个文件）
│   │   ├── src/services/             ← 业务逻辑
│   │   └── src/utils/                ← 纯工具函数
│   └── shared/                       ← 共享类型
│
└── scripts/                          ← 工具脚本（预留）
```

---

## 三、packages/server — 统一后端

### 3.1 入口

| 文件 | 说明 |
|------|------|
| `src/index.ts` | Express 入口（~110 行），注册所有路由、CORS、静态文件、SPA 回退 |

### 3.2 路由文件（src/routes/）

| 路由文件 | API 路径 | API 数 | 功能 |
|----------|----------|--------|------|
| `health.ts` | `/api/health` | 1 | 健康检查 |
| `auth.ts` | `/api/check-login`, `/api/save-env-config`, `/api/models` | 3 | CodeBuddy 认证、环境变量保存、模型列表 |
| `chat.ts` | `/api/sessions/*`, `/api/chat`, `/api/permission-response` | 6 | AI Agent 对话（SSE 流式）、会话 CRUD、权限审批 |
| `im-sources.ts` | `/api/im/sources/*`, `/api/im/sources/:id/conversations/*` | 6 | IM 数据源 CRUD、数据源会话管理 |
| `im-records.ts` | `/api/im/chat-records/*`, `/api/im/stats`, `/api/im/fix-mentioned` | 6 | 聊天记录查询/导入/统计、@我 标记修复 |
| `im-u9.ts` | `/api/im/u9-*`, `/api/im/refresh-*`, `/api/im/auto-setup/*` | 9 | 99U API 集成、会话列表、自动配置（Playwright）、短信验证码 |
| `im-fetch-today.ts` | `/api/im/fetch-today` | 1 | 获取当天所有会话聊天记录（SSE 流式） |
| `im-local-db.ts` | `/api/im/local/*` | 7 | 本地 IM 数据库连接/查询/导入 |
| `analysis.ts` | `/api/analysis/*`, `/api/analysis-reports/latest` | 4 | 分析报告 CRUD、AI 分析运行（SSE 流式） |
| `meetings.ts` | `/api/meetings`, `/api/meetings/audio-url`, `/api/meetings/process`, `/api/meetings/intelligence` | 4 | Playwright 会议列表、音频 URL 抓取、会议处理、AI 智能分析（决策/风险/行动项）、已保存结果查询 |
| `schedules.ts` | `/api/schedules/*` | 4 | 定时任务 CRUD + cron 管理（含项目状态自动同步任务） |
| `automation.ts` | `/execute` | 1 | OA 自动下单（Playwright 表单填报） |
| `project-initiation.ts` | `/api/project-initiation/*` | 8 | 项目立项 CRUD、ID 生成（PI-YYYYMMDD-NNN）、AI 生成立项文档（Moonshot SSE） |
| `requirements.ts` | `/api/requirements/*`, `/api/dev-tasks/*` | 11 | 需求分析 CRUD（RA-ID）、AI 分析需求（UE5 3D 领域知识）、AI 拆解任务（DT-ID）、开发任务 CRUD + 状态流转 |
| `projects.ts` | `/api/projects`, `/api/projects/:id`, `/api/projects/:id/transition`, `/api/projects/:id/phase-status`, `/api/projects/:id/sync`, `/api/projects/sync-all`, `/api/projects/:id/sprint-tasks`, `/api/projects/:id/knowledge-base` | 8 | 项目列表/详情/状态流转/阶段进度/手动同步/批量同步/冲刺任务/知识库 |
| `agents.ts` | `/api/agent-roles`, `/api/employees/*/agent` | 5 | Agent 角色模板管理（现映射为 main/exec 两个真实 Agent）、员工升级/禁用 Agent |
| `agent-main.ts` ✨ | `/api/agent/chat`, `/api/agent/exec`, `/api/agent/tasks`, `/api/agent/status`, `/api/agent/runtime-status`, `/api/agent/tasks/kanban` | 6 | **双 Agent 系统主路由**：主 Agent SSE 对话、执行 Agent 派发、任务记录查询、运行时状态查询、看板数据查询 |
| **总计** | | **80+** | |

### 3.3 服务文件（src/services/）

| 文件 | 行数 | 来源 | 功能 |
|------|------|------|------|
| `db.ts` | ~1760 | im-chat-analyzer | SQLite 数据库层（14+ 张表 + CRUD，含 project_initiations / requirement_analyses / dev_tasks / agent_tasks / project_members / project_stakeholders / project_phase_logs / meeting_intelligence） |
| `u9-api.ts` | 411 | im-chat-analyzer | 99U IM API（MAC 认证、消息搜索、好友/群组列表） |
| `im-db.ts` | 294 | im-chat-analyzer | 99U 本地加密数据库读取 |
| `analysis-service.ts` | 168 | im-chat-analyzer | 分析提示词构建 + Markdown 报告解析 |
| `meeting-service.ts` | 812 | claw studio | 会议认证加载、MAC 签名、音频下载、纪要持久化、版本管理 |
| `volc-asr.ts` | 160 | claw studio | 火山引擎 ASR v3（base64 上传，首选） |
| `tencent-asr.ts` | 146 | claw studio | 腾讯云短音频 ASR（≤60 秒，备选） |
| `oa-automation.js` | 455 | mcp | OA 自动填单原始脚本（参考备份） |
| `agent-tools.ts` ✨ | ~40 | 新增 | Agent 工具注册表（toolRegistry Map + initAgentTools） |
| `agent-tools-query.ts` ✨ | ~200 | 新增 | 只读查询工具：9 个工具（系统状态/项目/需求/任务/员工/版本/工作周期/聊天/报告） |
| `agent-tools-write.ts` ✨ | ~150 | 新增 | 写操作工具：5 个工具（创建立项/需求/开发任务/更新状态/分配员工） |
| `agent-loop.ts` ✨ | ~170 | 新增 | 自研 Agent Loop 引擎（Moonshot 直连 Function Calling + overrideExecutor 机制） |
| `agent-prompts.ts` ✨ | ~80 | 新增 | 主/执行 Agent system prompt 管理（SystemStatus 接口 + 两个 prompt 构建函数） |
| `agent-chat-service.ts` ✨ | ~130 | 新增 | 主 Agent 聊天业务逻辑（会话准备 + dispatch_exec_agent 真调度 + overrideExecutor） |
| `exec-agent.ts` ✨ | ~110 | 新增 | 执行 Agent（agent_tasks 记录写入 + 多步骤工具调用 + SSE 进度回传） |

### 3.4 工具文件（src/utils/）

| 文件 | 功能 |
|------|------|
| `env.ts` | .env 文件读写（`readEnvFileContent`、`persistEnvVar`） |
| `agent-sdk.ts` | CodeBuddy Agent SDK 封装（认证 token 缓存、会话创建） |

---

## 四、packages/web — Next.js 主站

### 4.1 页面路由

| 路由 | 文件 | 功能 |
|------|------|------|
| `/` | `src/app/page.tsx` | **今日工作驾驶舱**（今日关注、今日会议、今日任务、项目健康度、一键处理） |
| `/daily` | `src/app/daily/page.tsx` | 每日工作安排（任务 CRUD、状态切换、localStorage 持久化） |
| `/tasks` | `src/app/tasks/page.tsx` | 事务列表首页 |
| `/tasks/project-initiation` | `src/app/tasks/project-initiation/page.tsx` | 项目立项（Tab 切换：快速验证 / 预立项转立项；列表+详情；AI 生成立项文档；PI-ID 全局唯一串联后续环节） |
| `/tasks/requirements` | `src/app/tasks/requirements/page.tsx` | 需求分析（需求列表 + 左右布局详情页：需求输入/AI 分析结果/开发任务看板；支持 Figma/蓝湖链接；关联立项 ID） |
| `/tasks/task-breakdown` | `src/app/tasks/task-breakdown/page.tsx` | 任务拆解（待开发） |
| `/projects` | `src/app/projects/page.tsx` | 我的项目（项目列表、统计卡片、搜索、阶段筛选、批量同步状态） |
| `/projects/[id]` | `src/app/projects/[id]/page.tsx` | 项目详情（执行/规划/成员/任务/**收尾** 五 Tab，项目健康度、冲刺时间轴、待收尾项） |
| `/tasks/delivery` | `src/app/tasks/delivery/page.tsx` | 交付管理（待开发） |
| `/tools/quick-search` | `src/app/tools/quick-search/page.tsx` | 快速搜索（AI 对话，SSE 流式） |
| `/tools/meeting-assistant` | `src/app/tools/meeting-assistant/page.tsx` | 会议助手（录制列表、转录、纪要生成、AI 深度分析、确认→同步到 Daily Plan） |
| `/tools/chat-analyzer` | `src/app/tools/chat-analyzer/page.tsx` | 聊天情报中心（原生页面：与我相关/全部待办/关键决策/完整日报四 Tab） |
| `/tools/auto-order` | `src/app/tools/auto-order/page.tsx` | 自动下单（直接渲染 MCP 组件） |
| `/agents` | `src/app/agents/page.tsx` | Agent 列表（独立页面：用于查看/管理 Agent 相关信息，与员工列表分离） |
| `/company/employees` | `src/app/company/employees/page.tsx` | 员工管理（真实员工列表：卡片列表、Agent Badge 映射 main/exec、Agent 状态面板 Dialog） |
| `/company/kanban` | `src/app/company/kanban/page.tsx` | 员工看板（四列状态区、工作计划表、Agent 任务面板：正在执行/近期完成/待执行） |
| `/tools/agent` | `src/app/tools/agent/page.tsx` | PM Agent 对话页（SSE 流式、ToolCallCard、ExecAgentCard） |

### 4.2 API Routes（Next.js）

| API | 文件 | 功能 |
|-----|------|------|
| `POST /api/meetings` | `src/app/api/meetings/route.ts` | 获取会议列表（调 meeting-service + Playwright） |
| `POST /api/meetings/process` | `src/app/api/meetings/process/route.ts` | 完整转录流程：下载→ASR→纪要生成（含 rowIndex 传参、音频映射匹配优化） |
| `GET /api/meetings/download` | `src/app/api/meetings/download/route.ts` | 下载音频文件 |
| `GET /api/meetings/versions` | `src/app/api/meetings/versions/route.ts` | 版本历史查询 |
| `POST /api/meetings/cleanup` | `src/app/api/meetings/cleanup/route.ts` | 清理旧媒体文件 |
| `POST /api/daily-plan/generate` | `src/app/api/daily-plan/generate/route.ts` | AI 生成每日任务 |
| `POST /api/quick-search` | `src/app/api/quick-search/route.ts` | 转发到 Moonshot/OpenAI 兼容 API（带 ProxyAgent 代理） |
| `GET /api/quick-search/health` | `src/app/api/quick-search/health/route.ts` | 探测 AI 服务健康状态 |

### 4.3 业务组件（src/components/）

| 组件目录 | 文件 | 功能 |
|----------|------|------|
| `project-initiation/` | `QuickValidationForm.tsx` | 快速验证表单（5 大区块：基本信息/原始需求/立项初衷/项目定义/启动思考自检；AI 生成 + 手动编辑；保存/提交 → 状态"去立项"） |
| `requirements/` | `RequirementDetail.tsx` | 需求详情（左侧子导航 + 右侧内容区三页：需求输入/AI 分析结果/开发任务四列看板；自动跳转；支持 Figma + 蓝湖链接识别） |
| `auto-order/` | `AutoOrderApp.tsx` | 自动下单主应用（5 Tab） |
| `auto-order/` | `Dashboard.tsx` | 统计卡片 + 图表 + 日志 |
| `auto-order/` | `TaskList.tsx` | 任务列表 + 批量执行 |
| `auto-order/` | `MappingPanel.tsx` | 字段映射配置 |
| `auto-order/` | `ConfigPanel.tsx` | 飞书/OA 配置 |
| `auto-order/` | `TerminalOutput.tsx` | 实时日志输出 |
| `app-sidebar.tsx` | — | 全局侧边栏导航（4 组：每日工作/事务列表(4 子)/工具清单(4 子)） |

### 4.4 核心库（src/lib/）

| 文件 | 功能 |
|------|------|
| `meeting-service.ts` | 会议服务（认证、MAC 签名、下载、持久化、版本管理） |
| `volc-asr-upload.ts` | 火山引擎 ASR（base64 上传 + AbortController 超时控制） |
| `tencent-asr.ts` | 腾讯云短音频 ASR |
| `utils.ts` | 通用工具函数 |

---

## 五、packages/im-analyzer — IM 聊天分析前端

### 5.1 页面

| 文件 | 功能 |
|------|------|
| `src/App.tsx` | 路由分发（/、/chat、/analysis、/settings） |
| `src/pages/AnalysisPage.tsx` | 工作台 + 聊天记录 + 分析报告 + 定时任务 + 数据源管理（2210 行） |
| `src/pages/ChatPage.tsx` | AI Agent 对话页 |
| `src/components/SettingsPage.tsx` | Agent 配置管理 |

### 5.2 Hooks

| 文件 | 功能 |
|------|------|
| `useImAnalysis.ts` | 7 个 hook 合集（数据源、会话、记录、99U、报告、统计、定时任务） |
| `useChat.ts` | AI Agent 对话（SSE 流式、工具调用、权限审批） |
| `useAutoSetup.ts` | 99U 自动配置 + 获取当天聊天记录 |
| `useSessions.ts` | 对话会话管理 |
| `useModels.ts` | AI 模型列表 |
| `useAgents.ts` | 自定义 Agent CRUD |
| `useTheme.ts` | 主题切换 |

### 5.3 组件

| 文件 | 功能 |
|------|------|
| `ChatMessages.tsx` | 对话消息列表 |
| `ChatInput.tsx` | 输入框 + 模型选择 |
| `ToolCallsCollapse.tsx` | 工具调用折叠面板（761 行） |
| `Header.tsx` | 顶部栏 |
| `Sidebar.tsx` | 侧边栏 |
| `NewChatView.tsx` | 新对话视图 |
| `NewChatDialog.tsx` | 新建对话弹窗 |
| `AgentConfigDialog.tsx` | Agent 配置弹窗 |
| `PermissionDialog.tsx` | 权限确认弹窗 |
| `InlinePermissionCard.tsx` | 内联权限卡片 |

---

## 六、packages/shared — 共享类型

| 文件 | 功能 |
|------|------|
| `types/automation.ts` | 自动下单类型（Task、AutomationConfig、FieldMapping） |
| `types/meeting.ts` | 会议类型（MeetingRecord、MeetingResult、MeetingVersion） |
| `types/index.ts` | 统一导出 |

---

## 七、环境变量（.env）

| 分类 | 变量 | 说明 |
|------|------|------|
| 端口 | `SERVER_PORT=3001` | 统一后端 |
| | `WEB_PORT=5000` | Next.js 主站 |
| | `IM_ANALYZER_PORT=5173` | IM 分析前端 |
| 99U IM | `U9_API_AUTH_ID/KEY` | MAC 认证信息 |
| | `U9_SDP_APP_ID` | 应用标识 |
| | `U9_CONVERSATIONS` | 会话 ID 列表 |
| | `U9_CONVERSATION_NAMES_*` | ~100 条会话名称映射 |
| | `U9_MY_NAME` | 当前用户昵称（用于 @我 判断） |
| AI/LLM | `CODEBUDDY_API_KEY` | CodeBuddy Agent SDK |
| | `MOONSHOT_API_KEY` | Moonshot/Kimi（纪要生成 + 立项文档 + 需求分析 + 任务拆解 + 会议智能分析） |
| | `OPENAI_API_KEY` | OpenAI 兼容接口（备用） |
| | `OPENAI_BASE_URL` | 自定义 API 地址 |
| | `OPENAI_CHAT_MODEL` | 默认模型（如 moonshot-v1-128k） |
| ASR | `VOLC_ASR_API_KEY` | 火山引擎语音识别 |
| | `VOLC_ASR_TIMEOUT_MS=600000` | ASR 轮询超时 10 分钟 |
| | `VOLC_ASR_SUBMIT_TIMEOUT_MS=300000` | ASR 提交超时 5 分钟（大文件上传） |
| 会议 | `MEETING_USERNAME/PASSWORD` | 网龙会议系统登录 |
| 数据 | `DB_PATH=./data/chat.db` | SQLite 数据库路径 |
| | `MEETING_DATA_DIR=./data/meetings` | 会议数据目录 |

---

## 八、数据架构

### SQLite 数据库（chat.db）— 10 张表

| 表 | 关联关系 | 功能 |
|----|----------|------|
| `sessions` | — | AI 对话会话 |
| `messages` | FK → sessions | 对话消息 |
| `im_sources` | — | IM 数据源配置 |
| `im_source_conversations` | FK → im_sources | 数据源关联的会话 |
| `chat_records` | — | 聊天记录（来自 99U API / 本地数据库） |
| `analysis_reports` | — | 分析报告（AI 生成的工作日报） |
| `scheduled_tasks` | — | 定时任务配置 |
| `project_initiations` | — | 项目立项记录（PI-ID 主键、type/status/phase_status/current_phase/risk_level/last_synced_at） |
| `project_members` | FK → project_initiations | 项目成员（employee_id/role/status） |
| `project_stakeholders` | FK → project_initiations | 项目干系人（person_name/category/role_in_project） |
| `project_phase_logs` | FK → project_initiations | 阶段流转日志（from_phase/to_phase/triggered_by/reason） |
| `requirement_analyses` | FK → project_initiations(id) 可选 | 需求分析记录（RA-ID 主键、输入类型 text/figma/mixed/lahu、AI 分析 JSON、status） |
| `dev_tasks` | FK → requirement_analyses(id) | 开发任务（DT-ID 主键、category 含 interaction/rendering、priority、status 四态流转 todo→in_progress→testing→done） |
| `meeting_intelligence` | — | 会议深度分析结果（meeting_id/title/result JSON） |

#### 核心业务 ID 规则

| 实体 | 格式 | 示例 | 用途 |
|------|------|------|------|
| 项目立项 | `PI-{YYYYMMDD}-{NNN}` | `PI-20260416-001` | 全局唯一，串联需求分析→任务拆解→交付管理全流程 |
| 需求分析 | `RA-{YYYYMMDD}-{NNN}` | `RA-20260416-001` | 关联立项 ID（可选），绑定开发任务 |
| 开发任务 | `DT-{YYYYMMDD}-{NNN}` | `DT-20260416-001` | 属于某条需求分析，独立状态流转 |

### 文件存储

| 目录/文件 | 功能 |
|-----------|------|
| `data/meetings/*.mp3` | 下载的会议音频 |
| `data/meetings/result__*.json` | 转录结果 + 纪要 + 版本历史 |
| `data/meetings/meeting-audio-links.json` | 会议标题→音频 URL 映射（Playwright 抓取，需定期刷新） |
| `data/auth/meeting-auth.json` | 网龙会议系统 localStorage（有效期约 7 天） |
| `data/auth/oa-auth.json` | OA 系统 Playwright storageState |

---

## 九、关键流程

### 9.1 项目立项流程

```
用户点"新建快速验证" → POST /api/project-initiation → 自动生成 PI-ID（草稿）
  → 填写原始需求描述 → 点击"AI 生成立项文档"
    → POST /api/project-initiation/generate (SSE，Moonshot)
      → AI 返回结构化 JSON → 自动填充 5 大区块：
        ├─ 基本信息（项目名/负责人/部门/类型/业务领域等）
        ├─ 原始需求来源（提出者/日期/备选池承接）
        ├─ 立项初衷（为什么做/预期效果）
        ├─ 项目定义（概述/目标市场）
        └─ 启动思考（8 题自检是/否）
  → 用户编辑调整 → 点"保存并提交"
    → PATCH /api/project-initiation/:id（保存）
    → POST /api/project-initiation/:id/submit（提交）
    → status: draft → pending（去立项）
  → PI-ID 作为全局唯一标识，供后续环节引用
```

### 9.2 需求分析与任务拆解流程

```
需求列表页 → "新建需求" → POST /api/requirements → 生成 RA-ID（草稿）
  → 【子页面 1: 需求输入】
    → 输入文本 / Figma 链接 / 蓝湖链接（自动识别标签展示）
    → 点击"AI 分析需求"（SSE，Moonshot）
      → AI 以资深 3D/UE5 工程师视角输出：
        ├─ 功能点拆解（含 UE5 技术实现思路）
        ├─ 用户故事
        ├─ 技术要点（前端 Blueprint/Widget、后端 C++ 架构、渲染方案、交互系统）
        └─ 风险与依赖
    → status: draft → analyzed
    → 【子页面 2: AI 需求分析结果】展示（可编辑）
  → 点"确认并拆解任务"（SSE，Moonshot）
    → AI 按 7 种分类拆解开发任务（frontend/backend/design/interaction/rendering/test/other）
    → 每个任务含标题/描述/分类/优先级/预估工时/排序
    → status: analyzed → tasked
    → 【子页面 3: 开发任务看板】展示
  → 四列看板操作：
    → 待开发(todo) → 开发中(in_progress) → 测试中(testing) → 已完成(done)
    → 支持回退（testing → in_progress）
    → 支持跳过（todo → done）
    → 实时进度条显示完成比例
```

### 9.3 会议转录与智能分析流程

```
用户点"刷新列表" → POST /api/meetings（Playwright 登录抓取最新会议列表）
  用户点某条会议的"转录" → POST /api/meetings/process (Next.js)
    → 传入 rowIndex → 后端 Playwright 精准点击对应行获取音频 URL
    → meeting-service.downloadMedia（MAC 认证下载 mp3）
    → volc-asr-upload（火山引擎 base64 上传 + AbortController 5分钟超时 + 轮询等待）
    → Moonshot 生成结构化纪要 JSON（summary/todos/transcript）
    → persistMeetingResult（落盘 data/meetings/result__*.json）
  → 弹窗查看纪要（总结 + 待办 + 转录原文）

  用户点"AI 深度分析"按钮 → POST /api/meetings/intelligence (SSE)
    → 将 transcript 发给 Moonshot（temperature=0.3 低随机度）
    → AI 输出 Meeting Intelligence 结构化结果：
      ├─ 关键决策（决策内容/拍板人/影响范围）
      ├─ 行动项（任务/负责人/截止日期/优先级 high/medium/low）
      ├─ 风险评估（风险/严重程度/影响/应对措施）
      ├─ 阻塞项（描述/负责人/解决建议）
      ├─ 核心议题标签
      ├─ 整体氛围判断
      └─ 后续跟进建议
    → 纪要弹窗顶部四宫格渲染展示
```

### 9.4 99U 自动配置流程

```
用户点击"自动配置" → POST /api/im/auto-setup (SSE)
  → Playwright 启动 Chrome → 打开 ndim.101.com
  → 扫码登录 / 密码登录（支持短信验证码）
  → 提取 localStorage ND_UC_AUTH token
  → 获取会话列表（data-convid 属性）
  → 写入 .env（U9_API_AUTH_ID/KEY、U9_CONVERSATIONS 等）
  → 刷新 process.env
```

### 9.5 OA 自动下单流程

```
用户点击"执行" → POST /execute (统一后端)
  → Playwright 启动 Chrome（加载 oa-auth.json）
  → 打开 OA 业务页面 → 弹窗处理
  → 菜单导航【全需求列表】
  → UUID 搜索 → 滚动定位 → 点击"@增加子任务链接"
  → 接管新标签页 → 草稿弹窗处理
  → 点击"添加新数据" → 精准填报（标题、详情、负责人、日期、工时）
  → 提交保存 → 返回 URL → 刷新凭证
```

---

## 十、注意事项

1. **Next.js 版本**：已从 16.1.1 降级至 15.2.4（修复 `entryCSSFiles` 构建错误），并移除了 turbopack.root 配置
2. **Playwright 操作**（会议列表、99U 自动配置、OA 下单）需要 Server 在**前台终端**运行，后台进程会导致浏览器卡死
3. **每日工作数据**存在浏览器 localStorage（`dailyPlan.{date}.v1`），换浏览器会丢失；支持从会议/聊天分析一键导入待办
4. **自动下单配置**（飞书 appToken、tableId、OA URL）存在浏览器 localStorage
5. **99U 认证**有效期约 7 天，过期需重新自动配置
6. **会议认证**有效期约 7 天，过期需重新导出 meeting-auth.json
7. **会议音频映射** (`meeting-audio-links.json`) 需定期通过"刷新列表"更新，否则新会议无法正确匹配音频
8. **火山引擎 ASR 大文件**（>30MB 音频）上传可能较慢，已设置 5 分钟提交超时防止卡死
9. **AI 调用**统一走 Moonshot 直连（`api.moonshot.cn`），不走代理中转（公司网络 ECONNRESET 问题）
11. **项目状态自动同步**：每日 9:00 和 18:00 自动根据 dev_tasks 完成状态更新 project_initiations 的 phase_status 和 current_phase
12. **立项 ID / 需求 ID / 任务 ID** 是全局唯一的串联主键，删除需谨慎
