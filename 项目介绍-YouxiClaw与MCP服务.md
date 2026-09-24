# 项目介绍：YouxiClaw AI 工作流平台 & MCP 服务

> 适用于简历/面试的项目经历描述，突出技术栈与个人职责。

---

## 一、YouxiClaw 工作室 —— 个人 AI 工作流平台

### 项目概述

YouxiClaw 是一套自研的 **AI 驱动型项目管理与工作流平台**，目标是把日常工作中重复的信息整合、会议处理、任务跟进、项目立项等流程工具化、自动化。项目采用 Monorepo 架构，由三个子系统合并演进而来，目前已形成统一的中枢平台 + 独立 IM 分析前端 + 统一后端。

### 技术架构

```
Monorepo（pnpm workspace）
├── packages/web/          Next.js 15 + React 19 + shadcn/ui + Tailwind CSS
├── packages/im-analyzer/  Vite + React 18 + TDesign
├── packages/server/       Express + TypeScript + SQLite + Playwright
└── packages/shared/       TypeScript 共享类型
```

### 核心技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | Next.js 15、React 19、Vite |
| UI 组件 | shadcn/ui、Radix UI、TDesign、Tailwind CSS |
| 后端框架 | Express 5、TypeScript 5、tsx |
| 数据库 | SQLite（better-sqlite3）、Drizzle ORM |
| AI / LLM | Moonshot-v1-128k、OpenAI 兼容接口、Function Calling |
| 语音识别 | 火山引擎 ASR v3、腾讯云 ASR |
| 自动化 | Playwright（会议系统 / 99U IM / OA 三端 RPA）|
| 实时通信 | SSE 流式接口 |
| 工程化 | pnpm workspace、concurrently、Prettier、TypeScript |

### 核心功能模块

1. **今日工作驾驶舱**：聚合今日关注、今日会议、今日任务、项目健康度，一屏掌握全天工作重点。
2. **IM Chat Analyzer**：集成 99U IM API，自动抓取并解析本地加密聊天记录，AI 生成工作日报、待办提取、风险识别。
3. **会议助手**：Playwright 自动抓取会议音频 → 火山引擎 ASR 转录 → Moonshot 生成结构化纪要 → 提取决策/待办/风险。
4. **项目管理系统**：覆盖「立项 → 需求分析 → 任务拆解 → 交付管理」全流程，采用 PI-/RA-/DT- 全局唯一 ID 串联各环节。
5. **OA 自动下单**：Playwright RPA 将飞书多维表格任务自动填报到 OA 系统，减少重复人工操作。
6. **PM Agent**：基于 Moonshot Function Calling 自研 Agent Loop，支持风险扫描、任务派发、每日计划生成。

### 个人职责

- 独立完成整体架构设计、技术选型与 Monorepo 重构。
- 负责前后端核心模块开发，包括会议助手、项目管理、IM 分析、自动下单等。
- 设计并实现 PI/RA/DT 全局唯一 ID 体系与项目状态机流转。
- 对接 Moonshot、火山 ASR、99U、飞书、OA 等内外部系统。
- 沉淀 SSE 流式接口规范与业务 ID 规范，保证前后端一致性与可维护性。

---

## 二、YouxiClaw MCP 服务 —— 面向外部 Agent 的工具暴露层

### 项目概述

为了让外部 AI Agent（如 Hermes）能够安全、标准地调用 YouxiClaw 内部的项目/需求/任务/每日计划等能力，我基于 **Model Context Protocol（MCP）** 规范，在统一后端上实现了一套 MCP Server。它把 YouxiClaw 已有的 Agent 工具注册表以 MCP 协议暴露出去，支持只读/读写两种权限模式，并通过 SSE 长连接与 API Key 认证保障安全性。

### 技术栈

- **协议规范**：Model Context Protocol（MCP）
- **核心 SDK**：`@modelcontextprotocol/sdk`
- **传输层**：SSE（Server-Sent Events）
- **后端框架**：Express + TypeScript
- **认证机制**：API Key（Authorization Header / Query 参数），支持只读/读写权限分级
- **AI 编排**：Hermes Agent 作为 MCP Client 调用

### 核心能力

目前共暴露 **24 个工具**（默认 `YOUXICLAW_MCP_MODE=full`）：

| 类型 | 工具示例 | 说明 |
|------|----------|------|
| 只读查询 | `query_projects`、`get_requirement_by_id`、`query_dev_tasks`、`query_chat_records` | 查询项目、需求、任务、聊天记录等 |
| 写入管理 | `create_project`、`update_requirement`、`create_dev_task`、`transition_project_phase` | 创建/更新项目、需求、任务，推进项目阶段 |
| 每日计划 | `upsert_daily_plan`、`update_daily_plan_task` | 创建和更新每日工作计划 |

安全设计：
- 删除类工具默认不对外暴露，需显式开启 `YOUXICLAW_MCP_ALLOW_DELETE=1`。
- 支持 `readonly` 模式，只开放查询类工具。
- SSE 连接必须通过 API Key 认证，防止未授权访问。

### 接入方式

```yaml
# Hermes 配置示例
mcp_servers:
  youxiclaw:
    url: http://localhost:3001/mcp/sse
    transport: sse
    timeout: 120
    connect_timeout: 30
```

### 个人职责

- 设计 MCP Server 的整体架构，选型 `@modelcontextprotocol/sdk` 作为实现基础。
- 实现 `create-mcp-server.ts` 工具注册与 `mcp-sse-route.ts` SSE 路由。
- 复用并扩展已有的 `agent-tools.ts` 工具注册表，完成 MCP 协议适配。
- 设计 API Key 认证与权限分级机制（只读/读写/删除控制）。
- 对接 Hermes Agent，实现 Web 端 `/tools/agent` 入口由外部 Agent 驱动。

---

## 三、项目成果与亮点

| 维度 | 成果 |
|------|------|
| 工程能力 | 独立完成 Monorepo 架构设计与重构，沉淀统一后端 80+ API。 |
| 全栈能力 | 覆盖 Next.js 前端、Express 后端、SQLite 数据库、Playwright 自动化、AI 接口对接。 |
| AI 应用 | 将 LLM Function Calling、ASR、RPA 深度结合，实现会议转录、需求分析、任务拆解等自动化流程。 |
| 协议规范 | 基于 MCP 标准实现对外开放能力，支持外部 Agent 安全调用内部工具。 |
| 业务价值 | 将日常重复的信息整合、会议处理、任务跟进、OA 填报等工作效率大幅提升。 |

---

## 四、一句话总结

**YouxiClaw 是我独立设计并实现的 AI 工作流平台，整合了 LLM、ASR、RPA 和项目管理；MCP 服务则基于 Model Context Protocol 将其核心能力安全开放给外部 Agent，是我从“工具开发者”向“平台能力设计者”演进的关键实践。**
