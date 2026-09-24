# OpenClaw 双 Agent 系统实施方案

> 创建时间：2026-04-20
> 最后更新：2026-04-20（对齐审核修订版 `agent-coding-task.md`）
> 基于对整个工程的完整分析后制定

---

## 〇、版本说明

本文档为双 Agent 改造的**完整实施方案**，已对齐 `agent-coding-task.md` 修订版的全部审核意见：

| # | 审核问题 | 修正方式 |
|---|----------|----------|
| 1 | 主 Agent 路由过重 | 新增 `agent-chat-service.ts`，路由只保留入参校验 + SSE 头 + 委托 service |
| 2 | `dispatch_exec_agent` 假执行 | `agent-loop.ts` 增加 `overrideExecutor` 机制；主 Agent 对该工具执行真正的 `runExecAgent(...)` |
| 3 | 前端 `SERVER` 硬编码 | Agent 页面禁止写死地址；使用 `NEXT_PUBLIC_API_URL`（项目中无统一 API base 封装） |
| 4 | `agent-tools.ts` 可能超 500 行 | 默认拆分为 `agent-tools-query.ts` + `agent-tools-write.ts` + `agent-tools.ts`（注册表） |
| 5 | `tool_call` / `tool_result` 无唯一 id | SSE 事件增加 `id` / `tool_call_id`，前端按唯一 id 匹配卡片 |
| 6 | `employees/page.tsx` 锚点替换风险高 | 强制先读原文件再精准替换；两个 Dialog 确认在 `return` 语句之后（第 705~821 行，为死代码 bug） |
| 7 | 路由前缀冲突 | 已确认旧路由为 `/api/agent-roles`，与新 `/api/agent/*` 不冲突 |

---

## 一、现状分析

### 已有 Agent 基础设施

| 组件 | 位置 | 现状 |
|------|------|------|
| **Agent SDK 封装** | `server/src/utils/agent-sdk.ts` | ✅ 已有 CodeBuddy Agent SDK 认证 + 会话创建 |
| **Agent 角色模板** | `server/src/services/agent-service.ts` | ✅ 3 个预置角色（项目交付/开发/QA），但工具调用是**声明式**的，未真正实现 |
| **Agent 执行路由** | `server/src/routes/agents.ts` | ✅ 员工 Agent 启用/禁用/执行，SSE 流式，但用的是 CodeBuddy SDK 远程执行 |
| **AI 对话系统** | `server/src/routes/chat.ts` | ✅ 完整的 SSE 对话 + 工具调用展示 + 权限审批 |
| **Moonshot 直连** | 多处 routes | ✅ 各业务模块已有结构化 AI 生成能力 |
| **Function Calling 工具链** | — | ❌ **缺失**：预置角色声明了 tools 列表，但没有真正的工具注册/执行引擎 |
| **前端 API base** | `packages/web/src/` | ❌ **无统一封装**：搜索确认无 `NEXT_PUBLIC_API_URL`、`apiBase`、`API_BASE_URL` 引用 |

### 核心问题

当前的 Agent 体系是「**声明了角色，但没有执行能力**」——角色模板里写了 `tools: ["list_project_initiations", "create_project_initiation", ...]`，但这些工具并没有被注册为 Function Calling 的可调用函数。实际执行时走的是 CodeBuddy Agent SDK 的远程模型，工具调用全托管在 SDK 侧。

### 已确认的关键前置事实

1. **路由前缀无冲突**：旧文件 `agents.ts` 使用 `/api/agent-roles`，新路由使用 `/api/agent/chat`、`/api/agent/status`、`/api/agent/exec`、`/api/agent/tasks`，不冲突
2. **前端无统一 API base**：新增 Agent 页面必须使用 `process.env.NEXT_PUBLIC_API_URL`，不允许写死 `http://localhost:3001`
3. **`employees/page.tsx` Dialog Bug**：文件共 821 行，两个 Dialog 写在 `return` 语句之后（第 705~821 行），属于死代码，需移回 JSX 树内
4. **`db.ts` 末尾锚点**：文件共 944 行，追加新表时需先读取确认真实锚点

---

## 二、目标架构：主 Agent + 执行 Agent

```
┌──────────────────────────────────────────────────────────────┐
│                     用户界面 (Web)                            │
│           自然语言输入 → SSE 流式输出 → 结果展示              │
│     ToolCallCard（按 tool_call_id 精确匹配）                  │
│     ExecAgentCard（按 task_id 追踪进度）                      │
└────────────────────────┬─────────────────────────────────────┘
                         │ POST /api/agent/chat (SSE)
                         ▼
┌──────────────────────────────────────────────────────────────┐
│              轻量路由层 agent-main.ts                          │
│   仅做：参数校验 → SSE 头 → 委托 service → 返回结果          │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────┐
│         聊天服务层 agent-chat-service.ts                      │
│                                                              │
│  prepareAgentSession()  — 会话管理 + 历史拼装                │
│  runMainAgentChat()     — 调用 AgentLoop + overrideExecutor  │
│                                                              │
│  overrideExecutor 机制：                                      │
│    若 toolName === "dispatch_exec_agent"                      │
│      → 真正调用 runExecAgent(...)（非假返回）                  │
│      → 返回 { handled: true, result: { task_id, summary } }  │
│    否则 → { handled: false }，走普通工具注册表                 │
└──────────┬───────────────────────────┬───────────────────────┘
           │                           │
           ▼                           ▼
┌──────────────────────┐  ┌────────────────────────────────────┐
│  agent-loop.ts       │  │       执行 Agent (exec-agent.ts)    │
│  (核心循环引擎)       │  │                                    │
│                      │  │  1. 创建 agent_tasks 记录           │
│  1. LLM 调用         │  │  2. 发出 exec_start SSE            │
│  2. tool_calls 解析  │  │  3. 调用 runAgentLoop(...)          │
│  3. overrideExecutor │  │  4. 每次工具调用发 exec_progress    │
│  4. 普通工具执行      │  │  5. 写回 result/status/completed   │
│  5. tool_result 回填 │  │  6. 发出 exec_done SSE             │
│  6. 循环/终止判断     │  │                                    │
│                      │  │  工具集 = 全部 - dispatch_exec      │
└──────────────────────┘  └────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────┐
│                    工具注册表（3 文件拆分）                    │
│                                                              │
│  agent-tools.ts          — 注册引擎 + initAgentTools()       │
│  agent-tools-query.ts    — 9 个只读查询工具                   │
│  agent-tools-write.ts    — 5 个写操作工具                     │
│                                                              │
│  📋 get_system_status    📋 query_projects                    │
│  📋 query_requirements   📋 query_dev_tasks                   │
│  📋 query_versions       📋 query_employees                   │
│  📋 query_work_cycles    📋 query_chat_records                │
│  📋 query_reports        ✏️  create_project                    │
│  ✏️  create_requirement   ✏️  create_dev_task                   │
│  ✏️  update_requirement_status  ✏️  assign_employee             │
│  🤖 dispatch_exec_agent（仅定义，执行走 overrideExecutor）    │
└──────────────────────────────────────────────────────────────┘
```

### 设计原则

| 原则 | 说明 |
|------|------|
| **轻量内核** | 不引入 LangChain/LlamaIndex 等重框架，自研 Agent Loop |
| **显式控制** | 工具注册表是静态 Map，每个工具就是一个函数，入参出参清晰 |
| **路由轻量化** | 路由文件不超过 20 行业务逻辑，复杂逻辑全部下沉到 services |
| **overrideExecutor** | `dispatch_exec_agent` 通过 override 机制真正调度执行 Agent，不再是假实现 |
| **唯一 ID 匹配** | SSE 事件 `tool_call.id` 与 `tool_result.tool_call_id` 成对返回，前端按 ID 精确更新 |
| **单 Agent 为主** | 主 Agent 自己能做的事直接做，只有明确的多步骤/长耗时任务才派发 |
| **Moonshot 直连** | 全部走 `api.moonshot.cn`，不经代理，复用 `process.env.MOONSHOT_API_KEY` |
| **不改动现有逻辑** | 所有现有路由和功能保持不变，Agent 系统是**新增模块** |
| **SSE 流式** | 与现有前端 SSE 体系一致 |
| **文件拆分** | 工具层默认拆为 3 个文件，单文件不超过 500 行 |

---

## 三、具体实施方案

### Phase 1：共享类型 + 数据库扩展

#### 3.1 共享类型 — `shared/types/agent.ts`

```typescript
export interface AgentToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
      default?: unknown;
    }>;
    required?: string[];
  };
}

export interface MoonshotTool {
  type: "function";
  function: AgentToolDefinition;
}

export interface AgentTask {
  id: string;
  session_id: string | null;
  parent_message_id: string | null;
  description: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  agent_type: "main" | "exec";
  tool_calls: string | null;
  result: string | null;
  error: string | null;
  iterations: number;
  created_at: string;
  completed_at: string | null;
}

export type AgentSSEEvent =
  | { type: "init"; session_id: string }
  | { type: "thinking"; content: string }
  | { type: "text"; content: string }
  | { type: "tool_call"; id: string; name: string; params: Record<string, unknown> }
  | { type: "tool_result"; tool_call_id: string; name: string; result: unknown; error?: string }
  | { type: "exec_start"; task_id: string; description: string }
  | { type: "exec_progress"; task_id: string; message: string }
  | { type: "exec_done"; task_id: string; result: unknown }
  | { type: "done"; duration_ms: number }
  | { type: "error"; message: string };
```

**关键修正**：`tool_call` 事件增加 `id` 字段，`tool_result` 增加 `tool_call_id` 字段，前端按唯一 ID 匹配卡片。

#### 3.2 数据库新增表 — `db.ts` 追加

```sql
-- ========== Agent 任务执行记录表 ==========
CREATE TABLE IF NOT EXISTS agent_tasks (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  parent_message_id TEXT,
  description TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed','cancelled')),
  agent_type TEXT DEFAULT 'exec' CHECK (agent_type IN ('main','exec')),
  tool_calls TEXT,
  result TEXT,
  error TEXT,
  iterations INTEGER DEFAULT 0,  -- 统计 tool calls count
  created_at TEXT DEFAULT (datetime('now','localtime')),
  completed_at TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_session ON agent_tasks(session_id);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_status ON agent_tasks(status);
```

### Phase 2：工具层（3 文件拆分）

> 解决旧版"单文件工具大杂烩可能超 500 行"的问题

#### 3.3 工具注册引擎 — `server/src/services/agent-tools.ts`

```typescript
// 仅保留注册表基础设施
export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;  // JSON Schema
  execute: (params: Record<string, unknown>) => Promise<unknown>;
}

const toolRegistry = new Map<string, AgentTool>();

export function registerTool(tool: AgentTool): void { ... }
export function getTool(name: string): AgentTool | undefined { ... }
export function getAllTools(): AgentTool[] { ... }
export function getToolSchemas(): MoonshotTool[] { ... }

// 初始化入口
import { registerQueryTools } from "./agent-tools-query.js";
import { registerWriteTools } from "./agent-tools-write.js";

let initialized = false;
export function initAgentTools(): void {
  if (initialized) return;
  registerQueryTools();
  registerWriteTools();
  initialized = true;
}
```

#### 3.4 只读查询工具 — `server/src/services/agent-tools-query.ts`

| 工具名 | 数据来源 | 功能 |
|--------|----------|------|
| `get_system_status` | `db.ts` 多表统计 | 获取系统整体状态（项目数/任务数/员工数等） |
| `query_projects` | `db.ts` | 查询项目立项列表（支持状态/类型筛选） |
| `query_requirements` | `db.ts` | 查询需求分析列表 |
| `query_dev_tasks` | `db.ts` | 查询开发任务（支持 assignee/status 筛选） |
| `query_versions` | `db.ts` | 查询版本列表 |
| `query_employees` | `db.ts` | 查询员工列表（支持状态筛选） |
| `query_work_cycles` | `db.ts` | 查询工作周期 |
| `query_chat_records` | `db.ts` | 搜索 IM 聊天记录 |
| `query_reports` | `db.ts` | 查询分析报告 |

每个工具本质上封装已有的 `db.ts` CRUD 操作。

#### 3.5 写操作工具 — `server/src/services/agent-tools-write.ts`

| 工具名 | 数据来源 | 功能 |
|--------|----------|------|
| `create_project` | `db.ts` | 创建新的项目立项 |
| `create_requirement` | `db.ts` | 创建需求分析记录 |
| `create_dev_task` | `db.ts` | 创建开发任务 |
| `update_requirement_status` | `db.ts` | 更新需求状态 |
| `assign_employee` | `db.ts` | 为任务指定负责人 |

**注意**：`dispatch_exec_agent` 不在工具层注册，仅在路由侧定义工具 schema，实际执行走 overrideExecutor 机制。

### Phase 3：Agent 核心引擎

#### 3.6 Agent Prompt 管理 — `server/src/services/agent-prompts.ts`

```typescript
export interface SystemStatus {
  projectCount: number;
  activeRequirements: number;
  pendingTasks: number;
  availableEmployees: number;
  recentVersions: number;
}

export function buildMainAgentPrompt(status: SystemStatus): string {
  // PM Agent 系统 prompt：身份 + 当前系统状态 + 可用能力 + 工作原则
}

export function buildExecAgentPrompt(description: string, context?: string): string {
  // 执行 Agent 系统 prompt：任务导向 + 上下文 + 执行规则
}
```

#### 3.7 Agent 循环引擎 — `server/src/services/agent-loop.ts`

**这是本次最关键的文件。**

```typescript
export interface AgentMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
}

export interface OverrideExecutorArgs {
  toolCallId: string;
  toolName: string;
  params: Record<string, unknown>;
  messages: AgentMessage[];
}

export interface OverrideExecutorResult {
  handled: boolean;
  result?: unknown;
  error?: string;
}

export interface AgentLoopOptions {
  systemPrompt: string;
  model?: string;              // 默认 moonshot-v1-128k
  maxIterations?: number;      // 默认 10
  excludeTools?: string[];     // 排除的工具列表
  onEvent?: (event: AgentSSEEvent) => void;
  overrideExecutor?: (args: OverrideExecutorArgs) => Promise<OverrideExecutorResult>;
}

export async function runAgentLoop(
  messages: AgentMessage[],
  options: AgentLoopOptions
): Promise<{ fullResponse: string; toolCallsRecord: Array<...> }>;
```

**核心执行顺序**：

1. 收到模型 `tool_calls` → 发出 `tool_call` SSE 事件（含 `id`）
2. 若存在 `overrideExecutor` → 先调用它
3. 若返回 `handled: true` → 使用其 `result/error`
4. 否则走普通工具注册表 `getTool(toolName)`
5. 发出 `tool_result` SSE 事件（含 `tool_call_id`，与步骤 1 的 `id` 一一对应）

**防护机制**：
- 最大迭代次数：主 Agent 10 轮，执行 Agent 20 轮
- 工具执行超时：每个工具调用 30 秒
- 递归防护：执行 Agent 的工具集中移除 `dispatch_exec_agent`
- 错误重试：工具执行失败自动重试 1 次

#### 3.8 执行 Agent — `server/src/services/exec-agent.ts`

```typescript
interface RunExecAgentParams {
  description: string;
  context?: string;
  session_id: string;
  parent_message_id: string;
  onEvent: (event: AgentSSEEvent) => void;
}

export async function runExecAgent(params: RunExecAgentParams): Promise<{
  taskId: string;
  summary: string;
}>;
```

**职责**：
1. 创建 `agent_tasks` 记录（status=running）
2. 发出 `exec_start` SSE 事件
3. 调用 `runAgentLoop(...)`（excludeTools 包含 `dispatch_exec_agent`，防递归）
4. 每次工具调用时发出 `exec_progress`
5. 完成后写回 `result` / `status=completed` / `completed_at`
6. 失败时写回 `error` / `status=failed`
7. 发出 `exec_done` SSE 事件

**`iterations` 字段含义**：统计的是"工具调用次数"而非"模型回合数"。

### Phase 4：路由层 + 聊天服务层

#### 3.9 聊天服务层 — `server/src/services/agent-chat-service.ts`

> 解决旧版"路由过重"问题。会话管理、历史拼装、overrideExecutor 真调度等业务逻辑全部放这里。

```typescript
export async function prepareAgentSession(params: {
  sessionId?: string;
  message: string;
}): Promise<{
  sessionId: string;
  userMessageId: string;
  historyMessages: AgentMessage[];
  systemStatus: SystemStatus | undefined;
}>;

export async function runMainAgentChat(params: {
  sessionId: string;
  userMessageId: string;
  message: string;
  historyMessages: AgentMessage[];
  systemStatus: SystemStatus | undefined;
  onEvent: (event: AgentSSEEvent) => void;
}): Promise<{
  fullResponse: string;
  toolCallsRecord: Array<{ id: string; name: string; params: unknown; result: unknown; error?: string }>;
}>;
```

**`runMainAgentChat` 的 overrideExecutor 实现**：

```typescript
overrideExecutor: async ({ toolCallId, toolName, params }) => {
  if (toolName !== "dispatch_exec_agent") return { handled: false };
  
  const description = typeof params.description === "string" ? params.description : "";
  if (!description) return { handled: true, error: "dispatch_exec_agent 缺少 description" };
  
  const result = await runExecAgent({
    description, context, session_id, parent_message_id, onEvent
  });
  return { handled: true, result: { dispatched: true, task_id: result.taskId, summary: result.summary } };
}
```

**这是"假执行 → 真调度"的核心修复。**

#### 3.10 轻量路由 — `server/src/routes/agent-main.ts`

```typescript
// 路由只做：参数校验 → SSE 头 → 委托 service → 返回结果
router.post("/api/agent/chat", async (req, res) => {
  const { sessionId, message } = req.body;
  if (!message) return res.status(400).json({ error: "消息不能为空" });
  setupSSEHeaders(res);
  const send = createSSESender(res);
  const prepared = await prepareAgentSession({ sessionId, message });
  send({ type: "init", session_id: prepared.sessionId });
  const result = await runMainAgentChat({ ...prepared, message, onEvent: send });
  send({ type: "done", duration_ms: Date.now() - startTime });
  res.end();
});

router.get("/api/agent/status", ...);   // Agent 系统状态
router.post("/api/agent/exec", ...);    // 直接执行 Agent（独立入口）
router.get("/api/agent/tasks", ...);    // 查询执行任务列表
```

**禁止在路由中出现**：会话创建、历史拼装、toolCallsRecord 聚合、exec override 等业务逻辑。

### Phase 5：前端 UI

#### 3.11 工具调用卡片 — `web/src/components/agent/ToolCallCard.tsx`

```typescript
interface ToolCallCardProps {
  id: string;                    // tool_call.id，用于精确匹配 tool_result
  name: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: string;
  status: "running" | "completed" | "error";
}
```

UI 要求：折叠卡片、工具中文名标题、`running` 用 `Loader2`、参数/返回值独立代码块、颜色 `sky/emerald/red`。

#### 3.12 执行 Agent 卡片 — `web/src/components/agent/ExecAgentCard.tsx`

```typescript
interface ExecAgentCardProps {
  taskId: string;
  description: string;
  logs: string[];
  status: "running" | "completed" | "failed";
  result?: string;
}
```

UI 要求：`running` 蓝色边框+动态 icon、`completed` 绿色态、`failed` 红色态、日志最多 8 条。

#### 3.13 PM Agent 对话页 — `web/src/app/tools/agent/page.tsx`

**API base 规则**：
```typescript
const API_BASE = process.env.NEXT_PUBLIC_API_URL;
// 如果缺失，页面显示："未配置 NEXT_PUBLIC_API_URL，请先补充前端环境变量"
// 禁止再写：const SERVER = "http://localhost:3001"
```

**SSE 事件处理必须按唯一 ID 对齐**：
- `tool_call` → 插入 `{ id, name, params, status: "running" }`
- `tool_result` → 按 `tool_call_id === id` 精确更新对应卡片（**不再按工具名匹配第一个 running 卡片**）
- `exec_start` → 新增执行卡片
- `exec_progress` → 按 `task_id` 追加日志
- `exec_done` → 按 `task_id` 更新完成态

**页面布局**：左侧会话列表 + 右侧消息区（工具卡片 + 执行卡片 + 输入区），首屏空状态展示 3 个快捷问题按钮。

### Phase 6：现有文件小改动

#### 3.14 修复 `employees/page.tsx` Dialog Bug + 新增"对话"按钮

**执行规则**：必须先读原文件，再替换。不允许盲改。

当前问题（已确认）：
- 文件 821 行，两个 Dialog（头像预览 + Agent 配置）写在 `return` 语句之后（第 705~821 行）
- 这是**死代码 bug**，Dialog 永远不会渲染

修复方案：
1. **第一次替换**：将两个 Dialog 移回 list tab 的 JSX 树内部
2. **第二次替换**：在 Agent 员工卡片 hover 操作区新增"对话"按钮，跳转至 `/tools/agent?employeeId=${emp.id}`

#### 3.15 侧边栏新增入口 — `app-sidebar.tsx`

在"工具清单"组内（"自动下单"之前）插入：
```typescript
{ title: "AI Agent", url: "/tools/agent", icon: Bot }
```

#### 3.16 注册路由 — `server/src/index.ts`

追加：
```typescript
import agentMainRoutes from "./routes/agent-main.js";
app.use(agentMainRoutes);  // 在 app.use(agentRoutes) 后
```

#### 3.17 导出共享类型 — `shared/types/index.ts`

末尾追加：
```typescript
export * from "./agent.js";
```

---

## 四、文件清单与影响范围

### 新增文件（12 个）

| # | 文件路径 | 预估行数 | 功能 |
|---|----------|---------|------|
| 1 | `shared/types/agent.ts` | ~60 行 | Agent 相关共享类型（SSE 事件、任务、工具定义） |
| 2 | `server/src/services/agent-tools.ts` | ~80 行 | 工具注册引擎 + `initAgentTools()` |
| 3 | `server/src/services/agent-tools-query.ts` | ~250 行 | 9 个只读查询工具实现 |
| 4 | `server/src/services/agent-tools-write.ts` | ~180 行 | 5 个写操作工具实现 |
| 5 | `server/src/services/agent-prompts.ts` | ~100 行 | 主/执行 Agent 的 System Prompt 管理 |
| 6 | `server/src/services/agent-loop.ts` | ~200 行 | 核心 Agent Loop 引擎（含 overrideExecutor） |
| 7 | `server/src/services/exec-agent.ts` | ~120 行 | 执行 Agent 封装 |
| 8 | `server/src/services/agent-chat-service.ts` | ~150 行 | 主聊天服务（会话管理 + 真调度） |
| 9 | `server/src/routes/agent-main.ts` | ~100 行 | 轻量主 Agent 路由（4 个端点） |
| 10 | `web/src/components/agent/ToolCallCard.tsx` | ~120 行 | 工具调用可视化卡片组件 |
| 11 | `web/src/components/agent/ExecAgentCard.tsx` | ~100 行 | 执行 Agent 进度卡片组件 |
| 12 | `web/src/app/tools/agent/page.tsx` | ~400 行 | PM Agent 对话页面 |

### 修改文件（5 个，仅精准小改动）

| # | 文件 | 改动量 | 说明 |
|---|------|--------|------|
| 1 | `server/src/services/db.ts` | +15 行 | 追加 `agent_tasks` 表 DDL（精准定位锚点） |
| 2 | `server/src/index.ts` | +2 行 | 导入并注册 `agent-main` 路由 |
| 3 | `web/src/components/app-sidebar.tsx` | +5 行 | 侧边栏新增"AI Agent"导航项 |
| 4 | `web/src/app/company/employees/page.tsx` | ~20 行改动 | 修复 Dialog 死代码 Bug + 新增"对话"按钮 |
| 5 | `shared/types/index.ts` | +1 行 | 追加 `export * from "./agent.js"` |

### 不改动的文件

所有现有的 18 个路由文件、9 个服务文件均不做任何修改。

---

## 五、实施步骤与工时评估

### 执行顺序（严格按序，每步完成后再进入下一步）

| 步骤 | 内容 | 复杂度 | 预估工时 | 依赖 | 关键风险 |
|------|------|--------|---------|------|----------|
| **Step 0** | 预检 3 项（db.ts 锚点、employees/page.tsx 片段、API base 搜索） | 低 | 5 min | 无 | — |
| **Step 1** | 新增 `shared/types/agent.ts` + 导出 | 低 | 3 min | 无 | — |
| **Step 2** | `db.ts` 追加 `agent_tasks` 表 | 低 | 3 min | Step 0 | 锚点定位需准确 |
| **Step 3** | 工具层 3 文件拆分（query/write/registry） | **高** | 40~50 min | Step 1 | 需读懂 db.ts 944 行中的所有 CRUD 操作 |
| **Step 4** | `agent-prompts.ts` | 中 | 15 min | 无 | — |
| **Step 5** | `agent-loop.ts`（核心引擎 + overrideExecutor） | **高** | 30~40 min | Step 3 | Moonshot API 格式、多轮循环边界 |
| **Step 6** | `exec-agent.ts` | 中 | 15~20 min | Step 5 | — |
| **Step 7** | `agent-chat-service.ts` | 中高 | 20~25 min | Step 5,6 | overrideExecutor 真调度逻辑 |
| **Step 8** | `agent-main.ts` 路由 | 中 | 15 min | Step 7 | 确保路由轻量 |
| **Step 9** | `index.ts` 注册路由 | 低 | 2 min | Step 8 | — |
| **Step 10** | `ToolCallCard.tsx` 组件 | 中 | 15~20 min | Step 1 | — |
| **Step 11** | `ExecAgentCard.tsx` 组件 | 中 | 10~15 min | Step 1 | — |
| **Step 12** | Agent 对话页 `page.tsx` | **高** | 40~50 min | Step 10,11 | SSE 解析、状态管理、ID 匹配 |
| **Step 13** | 修复 `employees/page.tsx` Dialog + 对话按钮 | 中高 | 15~20 min | Step 0 | JSX 嵌套深，替换风险最高 |
| **Step 14** | 侧边栏新增入口 | 低 | 3 min | 无 | — |
| **Step 15** | 更新 `PROJECT_STRUCTURE.md` | 低 | 5 min | 全部完成 | — |

### 工时汇总

| 阶段 | 预估时间 |
|------|----------|
| **Phase 1 主体改造**（Step 0~15） | **3.5 ~ 4.5 小时** |
| **Phase 2 Skill 注入**（附录） | **15~20 分钟** |
| **调试 & 联调修复** | **30~60 分钟** |
| **总计** | **约 4.5 ~ 5.5 小时** |

### 关键风险分析

| 风险项 | 说明 | 应对措施 |
|--------|------|----------|
| **工具层工作量隐含** | Step 3 文档只给了工具名，实际需从 db.ts 的 944 行中提取 SQL 逻辑 | 先通读 db.ts 导出函数，列出可复用的 |
| **Moonshot API 兼容** | Function Calling 流式响应格式需严格对齐 | 参考现有 `chat.ts` 的 Moonshot 调用方式 |
| **前端 SSE 状态爆炸** | 对话页需同时管理消息、工具卡片、执行卡片 3 种状态 | 使用 useReducer 或拆分 hooks |
| **employees/page.tsx 破坏性** | Dialog 移位可能破坏 JSX 闭合结构 | 必须先读、分两次替换、每次只改一处 |
| **前端无 API base** | 项目中确认无统一封装 | 直接使用 `NEXT_PUBLIC_API_URL`，缺失时给错误提示 |

---

## 六、对话示例（预期效果）

### 场景 1：简单查询（主 Agent 直接处理）

```
用户：现在有几个进行中的需求？
主Agent：[调用 query_requirements({status: 'in_progress'})]
主Agent：当前有 3 个进行中的需求：
1. RA-20260418-001 - 角色系统改版（3/8 任务完成）
2. RA-20260419-001 - Nanite 地形优化（1/5 任务完成）
3. RA-20260420-001 - UI 交互重构（0/4 任务完成）
```

### 场景 2：简单操作（主 Agent 直接执行）

```
用户：把"角色系统改版"的第一个前端任务标记为开发中
主Agent：[调用 query_dev_tasks({requirement_id: 'RA-20260418-001', category: 'frontend'})]
主Agent：[调用 update_task_status({id: 'DT-20260418-001', status: 'in_progress'})]
主Agent：✅ 已将任务「DT-20260418-001 - 角色选择界面」状态更新为"开发中"
```

### 场景 3：复杂任务（派发给执行 Agent）

```
用户：帮我分析一下最近3天的聊天记录，生成今日工作报告
主Agent：好的，这个任务比较复杂，我会派发给执行 Agent 处理。

[执行中...] 📋 正在搜索最近 3 天的聊天记录...
[执行中...] 📊 找到 247 条记录，分析关键信息...
[执行中...] 📝 正在生成结构化工作报告...
[执行中...] ✅ 分析报告已生成

主Agent：执行 Agent 已完成分析，以下是今日工作报告：
[报告内容...]
```

---

## 七、技术要点

### 7.1 Moonshot Function Calling 格式

```typescript
// 请求
{
  model: "moonshot-v1-128k",
  messages: [...],
  tools: [{
    type: "function",
    function: {
      name: "query_projects",
      description: "查询项目立项列表",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["draft", "pending", "submitted", "approved"] },
          type: { type: "string", enum: ["quick_validation", "pre_to_formal"] }
        }
      }
    }
  }],
  tool_choice: "auto",
  stream: true
}

// 响应中的 tool_call
{
  role: "assistant",
  tool_calls: [{
    id: "call_xxx",           // ← 唯一 ID，必须传递到前端
    type: "function",
    function: {
      name: "query_projects",
      arguments: '{"status": "pending"}'
    }
  }]
}

// 工具执行结果回填
{
  role: "tool",
  tool_call_id: "call_xxx",  // ← 必须与上面的 id 一一对应
  content: '{"projects": [...]}'
}
```

### 7.2 overrideExecutor 机制（审核修正核心）

```
tool_calls 收到后 → 发出 tool_call SSE（含 id）
      │
      ▼
  有 overrideExecutor?
      │
  ┌───┴───┐
  │ Yes   │ No
  │       │
  ▼       ▼
调用 override   调用 getTool()
  │               │
  ├─ handled:true │
  │   → 使用其    │
  │     result    │
  │               │
  ├─ handled:false│
  │   → fallback ─┘
  │
  ▼
发出 tool_result SSE（含 tool_call_id = id）
```

这个机制保证 `dispatch_exec_agent` 走真正的 `runExecAgent()` 调度，而非返回一个假的 `{ dispatched: true }`。

### 7.3 流式 SSE 事件类型（修订版）

```typescript
type AgentSSEEvent =
  | { type: "init"; session_id: string }
  | { type: "thinking"; content: string }
  | { type: "text"; content: string }
  | { type: "tool_call"; id: string; name: string; params: Record<string, unknown> }
  | { type: "tool_result"; tool_call_id: string; name: string; result: unknown; error?: string }
  | { type: "exec_start"; task_id: string; description: string }
  | { type: "exec_progress"; task_id: string; message: string }
  | { type: "exec_done"; task_id: string; result: unknown }
  | { type: "done"; duration_ms: number }
  | { type: "error"; message: string };
```

**关键修正**（对比旧版）：
- `tool_call` 增加 `id` 字段
- `tool_result` 增加 `tool_call_id` 字段（取代旧版仅靠 `name` 匹配）
- `done` 的 `duration` 改为 `duration_ms`（语义更明确）

### 7.4 前端 SSE 匹配逻辑（修订版）

```typescript
// ❌ 旧版错误做法：按工具名匹配第一个 running 卡片
// 同一工具连续调用多次时，结果会串到第一张卡片上

// ✅ 修订版正确做法：按唯一 ID 精确匹配
if (evt.type === "tool_result") {
  updateToolCalls((draft) =>
    draft.map((item) =>
      item.id === evt.tool_call_id
        ? { ...item, result: evt.result, error: evt.error, status: evt.error ? "error" : "completed" }
        : item
    )
  );
}
```

### 7.5 防护机制

| 机制 | 说明 |
|------|------|
| **最大迭代次数** | 主 Agent 10 轮，执行 Agent 20 轮 |
| **工具执行超时** | 每个工具调用 30 秒超时 |
| **递归防护** | 执行 Agent 的工具集中移除 `dispatch_exec_agent` |
| **Token 控制** | 对话历史超过 50k tokens 时自动摘要压缩 |
| **错误重试** | 工具执行失败自动重试 1 次，仍失败则回报错误 |
| **API base 安全** | 前端禁止写死 `http://localhost:3001`，缺少环境变量时给明确提示 |

---

## 八、与现有系统的关系

```
现有系统（保持不变）                    新增 Agent 系统
──────────────────                    ──────────────────
                                     
/api/chat         → 通用 AI 对话      /api/agent/chat    → PM Agent 对话（SSE）
/api/agents/*     → 员工 Agent 管理    /api/agent/status  → Agent 系统状态
/api/agent-roles  → 角色模板查询       /api/agent/exec    → 直接执行 Agent
                                     /api/agent/tasks   → 查询执行任务
                                     
共享基础设施：
  - db.ts（数据库操作 — 工具层复用其导出函数）
  - .env（MOONSHOT_API_KEY）
  - SSE 事件体系
  - sessions + messages 表

新增分层：
  路由层:  agent-main.ts（轻量）
  服务层:  agent-chat-service.ts → agent-loop.ts → exec-agent.ts
  工具层:  agent-tools.ts ← agent-tools-query.ts + agent-tools-write.ts
  提示层:  agent-prompts.ts
```

新 Agent 系统是**完全独立的新增模块**，与现有的 `/api/chat`（CodeBuddy SDK 对话）和 `/api/agents/*`（员工 Agent 管理）并行存在，互不干扰。

---

## 九、验收 Checklist

### 后端
- [ ] `agent_tasks` 表已创建
- [ ] `agent-main.ts` 路由每个 handler 的业务逻辑 ≤ 20 行
- [ ] `dispatch_exec_agent` 会真实触发 `runExecAgent(...)`（非假返回）
- [ ] `tool_call.id` 与 `tool_result.tool_call_id` 成对返回
- [ ] 主 Agent 与执行 Agent 都可通过 SSE 回传进度

### 前端
- [ ] `/tools/agent` 页面可打开
- [ ] 不再写死 `http://localhost:3001`
- [ ] 同一工具连续调用多次时，结果不会串到第一张卡片上
- [ ] 执行 Agent 卡片可显示进度与完成态
- [ ] `employees/page.tsx` 的 Dialog 可以正常渲染
- [ ] 员工卡片出现"对话"按钮并可跳转
- [ ] 侧边栏出现 "AI Agent" 入口

### 规则合规
- [ ] 无单文件超过 500 行
- [ ] 无新增重框架
- [ ] 无 `any`（除显式注释豁免）
- [ ] 无硬编码密钥/端口/绝对本地临时路径
- [ ] `PROJECT_STRUCTURE.md` 已更新

---

## 十、禁止事项

1. **禁止**在 `agent-main.ts` 内重新堆 30~50 行业务逻辑
2. **禁止**让 `dispatch_exec_agent` 继续停留在 `{ dispatched: true }` 的假实现
3. **禁止**在新前端页面写 `const SERVER = "http://localhost:3001"`
4. **禁止**不读原文件就直接改 `employees/page.tsx`
5. **禁止**把全部工具继续塞回一个超长 `agent-tools.ts`
6. **禁止**沿用"按工具名匹配第一个 running 卡片"的前端更新方式
7. **禁止**修改现有业务逻辑以迁就本次改造

---

## 十一、后续扩展方向

| 方向 | 说明 | 优先级 |
|------|------|--------|
| **Phase 2: Hermes Skill 注入** | 按需注入执行 Agent 的领域知识（UE5/PM 工作流等），详见 `agent-coding-task.md` 附录 | **P0**（主体完成后立即执行） |
| **Playwright RPA 工具** | 让执行 Agent 能触发 OA 下单、会议抓取等 RPA 操作 | P1 |
| **定时 Agent** | 每天定时让 Agent 分析聊天记录、生成日报 | P1 |
| **多 Agent 协作** | 项目交付 Agent 分配任务给开发 Agent，开发完后通知 QA Agent | P2 |
| **知识库接入** | 让 Agent 能检索项目文档、ARCHITECTURE.md 等 | P2 |
| **Agent Memory** | 跨会话记忆（偏好、历史决策） | P3 |

### Phase 2 概要（Hermes Skill 注入）

> 前置条件：Step 0~15 全部完成并通过验收 Checklist

**新增文件**：
- `server/src/services/skill-loader.ts` — 轻量 Skill 加载器（扫描 skills/ 目录，按关键词匹配）
- `server/src/skills/ue5-dev/SKILL.md` — UE5 开发领域知识
- `server/src/skills/pm-workflow/SKILL.md` — PM 项目管理工作流

**修改文件**：
- `agent-prompts.ts` — 追加 `buildExecAgentPromptWithSkills()`（async，含 Skill 注入）
- `exec-agent.ts` — 将 `buildExecAgentPrompt` 替换为 `buildExecAgentPromptWithSkills`

**设计原则**：Skill 本质是按需注入执行 Agent system prompt 的领域知识文档，不是 MCP Server，不需要引入 Hermes 框架本体。只增强执行 Agent（多轮迭代，值得注入），不增强主 Agent（轮次浅，加了浪费 Token）。


---

## 附录：后续待改造清单（记录于 2026-06-24）

> 以下改造待整个系统完善后再统一实施，当前先记录，不立即改动代码。

### 1. 完全解耦 CodeBuddy 依赖

**现状**：PM Agent（`/api/agent/chat`）已切换为自研 Moonshot Function Calling Loop，不再调用 CodeBuddy SDK。但以下模块仍依赖 `@tencent-ai/agent-sdk`：

- `packages/server/src/routes/chat.ts`：通用 AI 对话 `/api/chat` 仍走 CodeBuddy SDK
- `packages/server/src/routes/auth.ts` + `packages/server/src/utils/agent-sdk.ts`：`/api/check-login`、环境配置保存仍以 CodeBuddy 认证为核心

**可选方案**：

- **方案 A（最小解耦）**：把 `/api/chat` 切到自研 Loop 做纯 Moonshot 聊天；`/api/check-login` 改为校验 `MOONSHOT_API_KEY` / `OPENAI_API_KEY`；删除 `utils/agent-sdk.ts` 并将 `@tencent-ai/agent-sdk` 从 server 依赖移除。代价：失去 CodeBuddy 原生的文件/终端/搜索工具。
- **方案 B（彻底替换 + 补齐工具）**：在自研 Loop 中实现 `read_file` / `write_file` / `bash` / `grep` / `web_search` 等通用工具，再迁移 `/api/chat`，实现完全自研。
- **方案 C（保持现状）**：PM Agent 已解耦，仅保留 `/api/chat` 作为 CodeBuddy 通用对话入口。

**建议**：系统整体完善后按 **方案 A 或 B** 执行，彻底去掉外部 SDK 依赖。

### 2. Agent 自然语言动作识别调优

**现状**：明确说出工具名或动作词（如“调用 create_project”）时稳定；部分自然语言指令（如“创建一个项目立项”）模型会先查询列表，而不是直接执行写操作。

**后续方向**：

- 继续优化 `agent-prompts.ts` 的 system prompt，加入更多 few-shot 示例
- 必要时在路由层做轻量意图识别，直接路由到对应工具
- 根据实际使用数据迭代工具描述和示例

### 3. 前端每日计划完全单一事实源

**现状**：已改为“后端优先 + localStorage 一次性迁移”，但自动保存仍为双写（localStorage + 后端）。

**后续方向**：当确认用户不再需要本地离线兜底后，移除 localStorage 双写，让后端成为唯一数据源。


### 4. Hermes Agent 接入 OpenClaw（已完成）

**方案**：OpenClaw 后端作为 MCP Server，通过 SSE 暴露查询/写入工具；Hermes 作为 MCP Client 进行高层决策与工具编排。Web 对话入口已完全切换为 Hermes 驱动。

**已实现**：

- 安装 `@modelcontextprotocol/sdk`。
- 新增 `packages/server/src/mcp/create-mcp-server.ts` 与 `packages/server/src/mcp/mcp-sse-route.ts`。
- 在 `packages/server/src/index.ts` 中提前挂载 `/mcp/sse` 与 `/mcp/messages` 路由。
- 新增 `packages/server/src/services/hermes-service.ts`：调用本地 Hermes、维护会话历史。
- 默认暴露 24 个工具：12 个只读查询 + 12 个写入/管理（`create_project`、`transition_project_phase`、`assign_employee`、`upsert_daily_plan` 等）。
- 删除类工具（`delete_requirement`、`delete_dev_task`、`delete_daily_plan_task`）默认不暴露，需设置 `OPENCLAW_MCP_ALLOW_DELETE=1` 才启用。
- 可通过 `OPENCLAW_MCP_MODE=readonly` 切回只读模式。
- `packages/server/src/routes/agent-main.ts`：`/api/agent/chat` 已改为 Hermes JSON 入口，不再走自研 Moonshot Loop；删除 `/api/agent/permission-response`。
- 重写 `packages/web/src/app/tools/agent/page.tsx`：改为 Hermes 对话页（左侧会话列表 + 右侧聊天）。
- `packages/web/src/components/app-sidebar.tsx`：「AI Agent」改为「Hermes Agent」。
- 修复 `routes/schedules.ts` 定时任务重复注册问题，并清理 `data/chat.db` 中重复的 `scheduled_tasks` 记录。
- 在 `~/.hermes/config.yaml` 中配置 `mcp_servers.openclaw`。
- 已验证：
  - `hermes mcp test openclaw` → 24 tools discovered
  - `hermes -z "...查询..." --toolsets openclaw` → 正常返回数据
  - `hermes -z "创建一个项目立项..." --toolsets openclaw` → 成功创建立项
  - `hermes -z "把立项 PI-20260624-002 提交审批" --toolsets openclaw` → 阶段成功流转
  - `POST /api/agent/chat` + Web 页面 → Hermes 正常返回并执行工具

**配置片段**：

```yaml
mcp_servers:
  openclaw:
    url: http://localhost:3001/mcp/sse
    transport: sse
    timeout: 120
    connect_timeout: 30
    supports_parallel_tool_calls: false
```

**后续**：

- 若需要 Hermes 调用删除工具，按需设置 `OPENCLAW_MCP_ALLOW_DELETE=1`。
- 若对外暴露，需为 MCP 路由增加鉴权。

详细文档见 `docs/hermes-integration.md`。
