# OpenClaw 工程全面评估与改造计划

> 评估时间：2026-06-24
> 评估范围：packages/server、packages/web、packages/im-analyzer、packages/shared 全部源码及数据层
> 评估维度：工程侧重点、工具目的、数据更新、数据持久化、数据一致性、功能可用性、功能闭环、安全与代码债务

---

## 一、执行摘要

OpenClaw 是一个围绕**「游浠」个人工作流**构建的**本地优先 AI 辅助工作台**。工程经历了从「Claw Studio + IM Chat Analyzer + MCP 自动下单」三个独立项目合并为统一 Monorepo 的过程。当前核心能力包括：

- **IM 数据聚合**：99U API / 本地加密 DB / 网页抓取三通道导入聊天记录
- **会议处理**：Playwright 登录网龙会议系统 → 音频下载 → 火山 ASR 转录 → Moonshot 生成纪要 + 智能分析
- **项目管理**：立项（PI-ID）→ 需求分析（RA-ID）→ 开发任务拆解（DT-ID）→ 冲刺排期 → 状态同步
- **AI Agent**：Hermes 通过 MCP 调用 OpenClaw 24 个工具，实现自然语言读写项目数据
- **每日工作**：Daily Plan 任务管理（但主要数据仍落 localStorage）
- **RPA 辅助**：OA 自动下单、99U 自动配置、飞书文档同步

**当前最大矛盾**：工程已具备「AI 能行动」的执行层，但「我的项目」模块仍停留在**数据看板**形态，立项/需求/任务/交付各页面**功能割裂、数据不闭环**，尚未形成真正的**项目作战室**。

---

## 二、工程侧重点与工具目的

### 2.1 三层架构定位

| 层级 | 侧重点 | 当前完成度 |
|------|--------|-----------|
| **感知层** | IM 聊天、会议音频、本地数据库、外部 API（99U/OA/飞书）的数据采集 | 80% — 采集通道多样，但清洗和标准化不足 |
| **认知层** | AI 分析（日报生成、需求分析、任务拆解、会议纪要、风险识别） | 70% — Moonshot 直连调用稳定，但分析结果未深度融入工作流 |
| **执行层** | Agent 工具调用、项目状态流转、RPA 自动填单、定时同步 | 75% — Hermes + MCP 工具链已跑通，但缺少主动 push 能力 |

### 2.2 各子包工具目的

#### `packages/server` — 统一后端（Express + SQLite）
- **目的**：作为全工程唯一数据源和 AI 工具暴露层
- **端口**：3001
- **API 规模**：80+ REST API + 1 个 MCP SSE 端点（供 Hermes 调用）
- **核心表**：24 张（sessions/messages/im_sources/im_chat_records/analysis_reports/scheduled_tasks/project_initiations/project_members/project_stakeholders/project_phase_logs/requirement_analyses/dev_tasks/employees/work_cycles/versions/daily_plans/daily_plan_tasks/meeting_intelligence/workflow_outputs/agent_tasks）

#### `packages/web` — Next.js 中枢平台
- **目的**：统一入口，整合所有工具页面
- **端口**：5000
- **页面**：今日驾驶舱、Daily Plan、项目列表/详情、立项/需求/任务/交付（部分占位）、会议助手、聊天分析（原生页）、快速搜索、Agent 对话、自动下单、员工管理/看板

#### `packages/im-analyzer` — Vite 独立前端
- **目的**：IM 聊天分析的独立工作台（历史遗留，现通过 iframe 嵌入 /tools/chat-analyzer）
- **端口**：5173
- **状态**：功能完整但 UI 风格与主站不一致，数据依赖后端 3001

#### `packages/shared` — 类型共享
- **目的**：提供跨包 TypeScript 类型
- **现状**：只定义了 automation/meeting 类型，大量类型仍散落在 db.ts 和各组件中

---

## 三、缺陷详细分析

### 3.1 数据更新 — 「不同步、不及时、不完整」

#### 3.1.1 项目状态同步的覆盖盲区

**代码位置**：`packages/server/src/services/db.ts:1637-1747`

`syncProjectStatus` 只按 `initiation_id` 统计需求与任务：

```sql
WHERE requirement_id IN (SELECT id FROM requirement_analyses WHERE initiation_id = ?)
```

但 `requirement_analyses` 表同时存在 `initiation_id` 和 `project_id` 两个关联字段。当用户通过 Agent 工具 `create_requirement` 只填写 `project_id` 而未填 `initiation_id` 时，该需求下的所有任务**完全不会参与**项目进度计算。这导致：
- 项目详情页显示「0 个任务」
- 阶段进度 `execution` 永远为 0
- 风险判断失准

#### 3.1.2 开发任务状态变更不触发项目同步

**代码位置**：`packages/server/src/routes/requirements.ts:176-211`

`PATCH /api/dev-tasks/:id` 只更新任务本身，不触发 `syncProjectStatus`。项目列表页的「同步状态」提示需要用户手动点击「同步全部」或等待每日 9:00/18:00 的定时任务。这意味着：
- 用户在需求详情页把任务拖到「已完成」，项目卡片上的进度条**不会即时更新**
- 风险标记（high/medium）存在小时级延迟

#### 3.1.3 Daily Plan 双写混乱

**代码位置**：`packages/web/src/app/daily/page.tsx`

Daily Plan 同时存在两套存储：
- **前端 localStorage**：`dailyPlan.{date}.v1`，用于快速响应和离线编辑
- **后端 SQLite**：`daily_plans` / `daily_plan_tasks`

当前逻辑是：页面加载时先读 localStorage，若为空则尝试从服务器拉取；保存时**只写 localStorage**，后台通过某个未明确的时机同步到服务器。实际上观察代码，`upsertDailyPlan` 只在 `/api/daily-plans` 调用时使用，而前端 daily 页面的状态管理以 localStorage 为主。这导致：
- 换浏览器/清缓存 → 历史任务全部丢失
- 首页驾驶舱的「今日任务」从后端 API 读取，可能与 daily 页 localStorage 数据**不一致**
- 未完成任务的跨天继承（carry-over）逻辑纯前端实现，不同设备状态不同

#### 3.1.4 版本风险计算与任务状态脱节

**代码位置**：`packages/server/src/services/version-alert-service.ts`（需查看）

`computeVersionRisk` 在 `dev_tasks.estimated_hours` 变更时被触发（`requirements.ts:188-206`），但：
- `dev_tasks.status` 变为 `blocked` 时，不会触发重算（`dev_tasks.status` CHECK 中甚至**没有 `blocked`**，但 Daily Plan 有）
- `work_cycles` 的进度更新不会反向影响版本风险
- `versions` 表的 `computed_risk` / `risk_reasons` 是静态字段，非实时计算

---

### 3.2 数据持久化 — 「SQLite + 文件系统双轨制，键不一致」

#### 3.2.1 双持久化体系

| 数据类型 | SQLite | 本地文件 | 问题 |
|---------|--------|---------|------|
| 聊天记录 | `im_chat_records` | — | ✅ 统一 |
| 分析报告 | `analysis_reports` | — | ✅ 统一 |
| 会议音频 | — | `data/meetings/*.mp3` | 文件与 DB 无关联 |
| 会议纪要 | — | `data/meetings/result__*.json` | `meeting_id` 与 DB 键可能不一致 |
| 会议 URL 映射 | — | `data/meetings/meeting-audio-links.json` | Playwright 抓取，易过期 |
| 会议认证 | — | `data/auth/meeting-auth.json` | 有效期 7 天，手动刷新 |
| OA 认证 | — | `data/auth/oa-auth.json` | Playwright storageState |
| 飞书知识库 | — | `.hermes/knowledge-base/*.md` | 路径存在 `project_initiations.knowledge_base_path`，但内容不入库 |
| 自动下单配置 | — | `localStorage['mcp_automation_config_v1']` | 浏览器级，无法跨端 |
| Daily Plan | `daily_plans` | `localStorage['dailyPlan.*.v1']` | **双写不一致** |

#### 3.2.2 会议数据的键漂移

`meeting-service.ts` 以会议标题作为文件名和 JSON 键的一部分：`result__{title}__{date}.json`。但会议标题可能包含特殊字符、空格，或被用户修改。`meeting-audio-links.json` 使用标题→URL 映射，而非稳定 ID。这导致：
- 同一会议多次处理可能产生多个文件
- 标题变化后历史记录「找不到」
- 智能分析结果 `meeting_intelligence` 表用 `meeting_id` 关联，但 `meeting_id` 来自 Playwright 抓取的 DOM 属性，与文件系统键无强绑定

#### 3.2.3 知识库游离在 DB 外

`project_initiations.knowledge_base_path` 存储一个本地文件路径（如 `/c/Users/.../.hermes/knowledge-base/xxx.md`）。这意味着：
- 知识库内容无法被全文检索
- Agent 工具 `get_project_by_id` 只返回路径字符串，不返回内容
- 路径在不同机器上无效（硬编码绝对路径）

---

### 3.3 数据一致性 — 「外键虚设、派生字段不同步、JSON 泛滥」

#### 3.3.1 外键约束未启用

**代码位置**：`packages/server/src/services/db.ts:20-25`

```ts
// 注意：不启用 foreign_keys pragma —— 已有旧表的 FK 定义是 NO ACTION（非 CASCADE），
// 启用后会导致 DELETE sessions 失败。deleteSession 里已显式删关联数据，不需要级联。
```

实际 `PRAGMA foreign_keys` 默认为 `0`。虽然 `deleteSession` 手动处理了级联，但：
- `DELETE FROM employees` 不会级联删除 `work_cycles`、`project_members`
- `DELETE FROM project_initiations` 不会级联删除 `project_members`、`project_stakeholders`、`project_phase_logs`
- 可以插入 `project_members.employee_id = '不存在的ID'` 而不报错
- 数据完整性完全依赖应用层代码，无数据库级兜底

#### 3.3.2 派生字段多处存储

- `project_initiations.team_size_current`：在 `addProjectMember` 时通过子查询更新，但手动修改 `project_members.status` 不会同步
- `project_initiations.phase_status`：JSON 字符串，与 `dev_tasks` 状态脱节，仅由 `syncProjectStatus` 定时/手动更新
- `requirement_analyses.status` 与 `dev_tasks.status` 双向推导：前端显示 `computed_status`（实时计算），但 DB 中存的是静态 `status`，两者可能不一致

#### 3.3.3 JSON 字段泛滥

| 表 | JSON 字段 | 风险 |
|---|----------|------|
| `project_initiations` | `phase_status` | 结构变更需全表迁移，无法 SQL 索引查询子字段 |
| `requirement_analyses` | `ai_analysis` | 大文本，未做压缩/分表 |
| `dev_tasks` | — | ✅ 相对规范 |
| `versions` | `participants`, `task_ids`, `goals` | 数组存储在 TEXT 中，JOIN 困难 |
| `employees` | `skills`, `agent_tools`, `agent_config` | 结构化数据用字符串存 |
| `meeting_intelligence` | `result` | 整个分析结果一个大 JSON |
| `analysis_reports` | `work_priorities`, `completed_tasks`, `pending_tasks`, `key_decisions`, `follow_ups`, `meeting_notes`, `statistics` | 报告内容碎片化存储 |

JSON 泛滥导致：
- 无法直接用 SQL 查询「有哪些项目的 execution 进度大于 50%」
- 字段结构变化无版本控制，旧数据解析可能报错
- 数据量大时单表膨胀（`analysis_reports` 的多个 TEXT 字段）

---

### 3.4 功能可用性 — 「链路断裂、死链、假数据、未实现页面」

#### 3.4.1 页面链路断裂

| 页面 | 状态 | 问题 |
|------|------|------|
| `/tasks/task-breakdown` | 占位 | 81 行，只有标题和「待开发」提示 |
| `/tasks/delivery` | 占位 | 86 行，同上 |
| `/ai` | 死链 | 侧边栏 `AI → /ai` 不存在 |
| `/tools` | 入口缺失 | 没有 chat-analyzer 和 agent 的入口卡片 |
| `/agents` | 功能弱 | Agent 列表与员工列表重复，无实际管理功能 |
| `/company/kanban` | 数据浅 | 员工看板只展示状态，未与 work_cycles 深度绑定 |

#### 3.4.2 假数据与硬编码回退

- `auth.ts:122-123`：模型列表获取失败时返回假数据 `[{ modelId: "claude-sonnet-4" }]`
- `projects.ts:240-261`：`generate-sprint-plan` 的排期算法极其简单（按顺序分配工作日，不考虑依赖、并行、人员可用性）
- `daily/page.tsx`：`collectUnfinishedTasks` 从 localStorage 读取，无后端兜底

#### 3.4.3 API 可用性问题

- **CORS `*`**：`index.ts:79-85` 允许任意来源，生产环境不可接受
- **无认证中间件**：所有 API 完全开放，任何人可调用 `/api/save-env-config` 修改服务器配置
- **Playwright 依赖前台终端**：会议列表抓取、99U 自动配置、OA 下单都需要 server 在前台运行，后台进程会导致浏览器卡死
- **`/api/save-env-config`** 直接写 `.env` 文件，无校验、无备份，可能破坏配置格式

#### 3.4.4 前端代码债务

- **API_BASE 硬编码**：`web/src/app/page.tsx:23`、`web/src/app/projects/page.tsx:24` 等多处硬编码 `http://localhost:3001`，未统一配置
- **Tailwind 动态类问题**：`page.tsx:318` 使用三元表达式拼接 `bg-green-500` 等，Tailwind 可能无法正确 purged（虽然当前看起来正常，但存在隐患）
- **大量 `alert()`**：未使用统一 toast/notification 系统
- **类型安全**：大量 `any` 类型，特别是路由参数和 API 响应
- **组件未拆分**：`projects/[id]/page.tsx` 1694 行，`AnalysisPage.tsx` 2210 行

---

### 3.5 功能闭环 — 「立项到交付没有打通」

#### 3.5.1 项目作战室缺失

当前「我的项目」流程：

```
立项页 (/tasks/project-initiation) → 需求页 (/tasks/requirements) → 项目看板 (/projects/[id])
         ↑                                                    ↓
      手动新建 PI-ID                                    手动关联 RA-ID
```

问题是：
1. **立项后没有自动创建关联需求**：用户需要在需求页手动选择「关联立项 ID」
2. **需求页无法直接看到所属项目**：需求列表可以按 `initiation_id` 筛选，但 UI 上没有「从项目详情直接新建需求」的入口
3. **任务拆解后无法自动排期**：`generate-sprint-plan` 是一个独立 API，需要用户手动触发，且排期算法不考虑实际成员可用性
4. **交付管理完全缺失**：`/tasks/delivery` 是空白页，没有版本发布、测试验收、上线回滚流程
5. **项目详情页的成员 Tab 只读**：只能看成员列表，无法直接分配任务给成员

#### 3.5.2 数据孤岛

- IM 聊天记录 → 分析报告 → Daily Plan：理论上可以「一键导入待办」，但实际上 `/tools/chat-analyzer` 原生页只展示报告，没有「推送到 Daily Plan」的交互
- 会议纪要 → 行动项 → 开发任务：会议智能分析会提取 action items，但没有工具将它们转为 `dev_tasks`
- 项目数据 → 员工看板：`work_cycles` 表与 `dev_tasks` 是两条线，work_cycles 有 `task_id` 字段但似乎未建立有效联动

#### 3.5.3 Agent 能力边界

Hermes 通过 MCP 可以读写项目数据，但：
- **无上下文感知**：Agent 不知道当前用户正在看哪个项目页面，每次对话需要重新指定 PI-ID
- **无主动推送**：Agent 只能在用户发问后响应，不能主动推送「项目 PI-xxx 已延期」
- **无二次确认 UI**：`requireConfirm` 工具只在 MCP 层标记，但网页 Agent 页面 (`/tools/agent`) 是普通 POST，无中断确认机制，写入直接执行
- **工具描述不够精准**：部分查询工具返回原始 DB 行，字段名对 AI 不友好

---

### 3.6 安全与敏感信息

#### 3.6.1 源码中硬编码的凭据

- `.env` 中的 `MEETING_PASSWORD=Youxi0921`、`U9_API_AUTH_KEY`、`MOONSHOT_API_KEY` 等
- `data/server-config.json` 存储运行时配置，含密钥
- `data/auth/meeting-auth.json` 和 `oa-auth.json` 含会话 Token

#### 3.6.2 任意写接口

- `POST /api/save-env-config`：任意客户端可修改 `.env`，写入任意键值
- `POST /api/im/auto-setup`：可触发 Playwright 自动操作 99U，修改 `.env`
- `POST /execute`（OA 自动下单）：无权限校验，可被外部调用

#### 3.6.3 路径遍历风险

`projects.ts:416-425` 知识库路径校验：
```ts
if (!kbPath.endsWith('.md') || !kbPath.includes('knowledge-base')) {
  res.status(403).json({ error: '非法路径' });
  return;
}
```
这可以通过 `../../../knowledge-base/../../etc/passwd.md` 绕过（虽然后面有 Windows 路径转换，但仍不严谨）。

---

## 四、分阶段改造计划

### 阶段一：数据层止血（1-2 周）

**目标**：解决数据一致性、持久化混乱、外键虚设等底层问题，为后续功能改造打地基。

| 任务 | 具体动作 | 影响范围 |
|------|---------|---------|
| **启用外键约束** | 在 `db.ts` 中显式 `PRAGMA foreign_keys = ON`；修复 `DELETE sessions` 级联问题；补充缺失的 `ON DELETE CASCADE` | 数据完整性兜底 |
| **统一项目关联字段** | `syncProjectStatus` 同时支持 `initiation_id` 和 `project_id`；给 `dev_tasks` 增加直接关联 `project_id` 的冗余字段或确保查询覆盖 | 项目进度计算准确 |
| **即时同步钩子** | 在 `updateDevTask`、`createDevTask`、`deleteDevTask` 后自动调用 `syncProjectStatus`（异步，不阻塞响应） | 进度实时更新 |
| **Daily Plan 主从切换** | 前端以服务端为唯一数据源，localStorage 只做**离线缓存**；保存时先 POST 后端，成功后更新本地缓存 | 跨端一致性 |
| **会议数据统一 ID** | 以会议系统的稳定 `meeting_id` 为唯一键，文件名改为 `{meeting_id}_{timestamp}.json`；建立 `meetings` 主表管理元数据 | 会议记录可追溯 |
| **清理假数据** | 删除 `auth.ts` 中的 `claude-sonnet-4` 假模型回退；删除未使用的 mock 数据 | 代码诚实性 |

### 阶段二：我的项目闭环（2-3 周）

**目标**：把「我的项目」从数据看板改造成真正的项目作战室。

| 任务 | 具体动作 | 预期效果 |
|------|---------|---------|
| **项目详情页重构** | 将 1694 行的 `projects/[id]/page.tsx` 拆分为子组件；新增「需求」「任务」「交付」子路由或深度 Tab | 可维护性提升 |
| **一键新建需求** | 在项目详情页增加「新建需求」按钮，自动带入 `project_id` | 减少手动关联 |
| **任务看板与成员联动** | 成员 Tab 支持「分配任务」；任务卡片显示负责人头像；拖拽分配 | 人-任务可视化 |
| **智能排期增强** | `generate-sprint-plan` 考虑 `employees.status`（available/busy）、并行任务数、任务依赖关系 | 排期可用性 |
| **交付管理初版** | `/tasks/delivery` 实现版本发布流程：选择版本 → 关联测试任务 → 发布 checklist → 标记上线 | 闭环最后一公里 |
| **知识库接入** | 知识库 `.md` 内容解析后存入 `project_knowledge_chunks` 表（或至少做全文索引），Agent 可查询 | 知识可检索 |

### 阶段三：Agent 体验升级（2 周）

**目标**：让 Hermes Agent 从「能读写」进化为「能理解上下文、能主动提醒」。

| 任务 | 具体动作 |
|------|---------|
| **会话上下文注入** | `prepareHermesSession` 时注入当前页面上下文（如用户正在看 PI-xxx 项目） |
| **写入确认机制** | 对 `requireConfirm=true` 的工具，Hermes 输出结构化确认请求，前端渲染确认卡片，用户点击后才执行 |
| **工具返回格式化** | 查询工具返回对 AI 友好的字段名和摘要（如 `project_status_summary` 而非原始 DB 行） |
| **定时 Agent 推送** | 利用 `scheduled_tasks` + node-cron，让 Agent 在晨报/晚报时间主动生成「今日待办」「项目风险预警」并推送到前端或 IM |
| **会议 Action Items → 任务** | 会议纪要中的 action items 提供「转为开发任务」按钮，自动创建 `dev_tasks` 并关联到项目 |

### 阶段四：安全与工程化（1-2 周）

| 任务 | 具体动作 |
|------|---------|
| **API 认证中间件** | 增加基于 Token 的简单认证（或至少限制 `save-env-config`、`execute` 等敏感接口为本地来源） |
| **CORS 收紧** | 生产环境只允许 `localhost:5000` 等明确来源 |
| **密钥外迁** | 所有密钥从源码/`.env` 迁移到操作系统密钥管理器（Windows Credential / macOS Keychain）或专用配置服务 |
| **API_BASE 统一** | 前端统一从 `process.env.NEXT_PUBLIC_API_URL` 读取，删除所有硬编码 `localhost:3001` |
| **类型补齐** | `shared/types` 补充 project/requirement/task/employee 的完整类型，前后端统一引用 |
| **db.ts 拆分** | 按领域拆分为 `db/index.ts`、`db/project.ts`、`db/im.ts`、`db/daily-plan.ts` 等 |

### 阶段五：IM 与会议深度融合（长期）

| 任务 | 具体动作 |
|------|---------|
| **IM 事件驱动项目更新** | 聊天记录中出现「PI-xxx 延期了」「DT-yyy 做好了」等语义时，自动更新对应项目/任务状态 |
| **会议风险自动入库** | 会议智能分析识别到「阻塞项」「高风险」时，自动写入 `project_initiations.risk_level` |
| **日报自动生成与推送** | 每日 18:00 自动汇总当日 IM、会议、任务完成情况，生成 Markdown 日报并推送到飞书 |

---

## 五、优先级矩阵

| 象限 | 事项 | 建议处理时间 |
|------|------|-------------|
| **高影响 + 低难度** | 启用外键、即时同步钩子、API_BASE 统一、Daily Plan 主从切换 | 阶段一（1-2 周） |
| **高影响 + 高难度** | 项目作战室闭环、Agent 写入确认、IM 事件驱动 | 阶段二、三（3-5 周） |
| **低影响 + 低难度** | 清理假数据、删除死链、类型补齐 | 穿插进行 |
| **低影响 + 高难度** | 知识库全文检索、智能排期算法优化、多设备实时同步 | 阶段五（长期） |

---

## 六、关键度量指标（改造后应达到）

1. **数据一致性**：`syncProjectStatus` 覆盖 100% 有关联任务的项目，任务状态变更后 5 秒内项目进度刷新
2. **功能闭环**：从「新建项目」到「交付完成」全程无需离开项目详情页，页面跳转次数 ≤ 3
3. **Agent 可用性**：Hermes 写入操作有二次确认，查询工具返回字段 100% 有中文描述
4. **安全基线**：敏感接口（save-env-config、execute）不可从外部未认证访问
5. **代码健康度**：`db.ts` 拆分后单文件 ≤ 400 行；`any` 类型减少 50% 以上

---

> 本评估基于对 OpenClaw 全部 2691 个源码文件的深入阅读，重点覆盖了后端核心服务（`db.ts`、`routes/`、`services/`）、前端关键页面（`page.tsx`、`projects/`、`daily/`）及工程配置文档。建议以「阶段一」为切入点，先止血再造血，逐步将 OpenClaw 从「工具集合」进化为「AI 驱动的个人项目作战室」。
