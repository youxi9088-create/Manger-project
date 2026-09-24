# Hermes Agent 接入 OpenClaw

## 集成方式
OpenClaw 后端作为 **MCP Server**，通过 SSE 暴露项目/需求/任务/每日计划等工具；Hermes 作为 **MCP Client**，在自身 Agent Loop 中编排调用。

Web 端的「Hermes Agent」入口（`/tools/agent`）已经切换为 Hermes 驱动：前端发送普通 POST 请求到 `/api/agent/chat`，后端调用本地 Hermes 进程，由 Hermes 决定调用哪些 OpenClaw 工具。

## 已暴露工具

当前共暴露 **24 个工具**（默认 `OPENCLAW_MCP_MODE=full`）：

### 只读查询

| 工具名 | 说明 |
|--------|------|
| `get_system_status` | 系统概览：项目/需求/任务/员工/版本数量 |
| `get_project_by_id` | 按立项 ID 查项目 |
| `query_projects` | 项目立项列表筛选 |
| `get_requirement_by_id` | 按需求 ID 查需求 |
| `query_requirements` | 需求列表筛选 |
| `get_dev_task_by_id` | 按任务 ID 查开发任务 |
| `query_dev_tasks` | 开发任务列表筛选 |
| `query_employees` | 员工列表筛选 |
| `query_versions` | 版本列表筛选 |
| `query_work_cycles` | 工作周期（工单）筛选 |
| `query_chat_records` | IM 聊天记录筛选 |
| `query_reports` | 分析报告列表筛选 |

### 写入/管理

| 工具名 | 说明 |
|--------|------|
| `create_project` | 新建项目立项 |
| `update_project` | 更新立项信息 |
| `transition_project_phase` | 推进项目阶段 |
| `add_project_member` | 添加项目成员 |
| `sync_project_status` | 同步项目状态 |
| `create_requirement` | 创建需求 |
| `update_requirement` | 更新需求 |
| `create_dev_task` | 创建开发任务 |
| `update_dev_task` | 更新开发任务 |
| `assign_employee` | 分配任务给员工 |
| `upsert_daily_plan` | 创建/覆盖每日计划 |
| `update_daily_plan_task` | 更新每日计划任务 |

**默认不暴露的删除工具**：`delete_requirement`、`delete_dev_task`、`delete_daily_plan_task`。如需开放，启动服务器时设置环境变量 `OPENCLAW_MCP_ALLOW_DELETE=1`。

Hermes 会把这些工具前缀为 `mcp_openclaw_<tool>` 注入模型。

## 后端新增/修改文件

- `packages/server/src/mcp/create-mcp-server.ts`：基于 `@modelcontextprotocol/sdk` 创建 MCP Server，复用 `agent-tools.ts` 注册表。
- `packages/server/src/mcp/mcp-sse-route.ts`：Express 路由，暴露 `GET /mcp/sse` 与 `POST /mcp/messages`。
- `packages/server/src/services/hermes-service.ts`：调用本地 Hermes、维护会话历史、保存消息。
- `packages/server/src/routes/agent-main.ts`：`/api/agent/chat` 已改为 Hermes 入口，不再使用自研 Moonshot Loop。

## Hermes 配置

在 `~/.hermes/config.yaml` 中追加：

```yaml
mcp_servers:
  openclaw:
    url: http://localhost:3001/mcp/sse
    transport: sse
    timeout: 120
    connect_timeout: 30
    supports_parallel_tool_calls: false
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `HERMES_PATH` | `E:\Hermes\hermes-agent\.venv\Scripts\hermes.exe` | Hermes 可执行文件路径 |
| `HERMES_TOOLSETS` | `openclaw` | 启用的 Hermes toolsets |
| `OPENCLAW_MCP_MODE` | `full` | `full` 暴露读写工具；`readonly` 只暴露查询工具 |
| `OPENCLAW_MCP_ALLOW_DELETE` | `0` | 设为 `1` 时向 Hermes 开放删除类工具 |

## Web 入口

- 页面：`http://localhost:5000/tools/agent`
- 接口：`POST /api/agent/chat`
- 请求体：`{ sessionId?: string, message: string }`
- 响应：`{ success: true, session_id, response, duration_ms }`

## 验证命令

```bash
# 1. 测试连接与工具发现
hermes mcp test openclaw

# 2. CLI 查询
hermes -z "OpenClaw 系统里目前有多少个项目、多少个需求、多少个开发任务？" --toolsets openclaw

# 3. CLI 写入
hermes -z "在 OpenClaw 里帮我创建一个 quick_validation 项目立项，标题叫'Hermes 接入测试'，负责人写'测试负责人'" --toolsets openclaw

# 4. Web 入口
# 打开 http://localhost:5000/tools/agent 直接对话
```

## 已知限制

- Hermes 调用写入/阶段流转工具时**直接执行**，不再走 Web PM Agent 的二次确认弹窗。Hermes 自身的审批/YOLO 机制负责前置控制。
- 删除工具默认关闭，防止误操作。
- `hermes -z` 是单次调用，前端只能看到最终回答，看不到中间 tool call 过程。
- 当前 `/mcp/*` 与 `/api/agent/chat` 无认证，仅本地使用；若暴露到公网，需增加鉴权。
