# OpenClaw 开发规范

> 本文档是 AI 辅助开发和人工开发的共同准则。
> 最后更新：2026-04-16
> 任何新增功能、修改代码前，必须先阅读本文档。

---

## 一、核心原则

1. **不重复**：同一逻辑只在一个地方实现，通过 import 复用
2. **不硬编码**：路径、URL、端口、密钥全部走环境变量或配置文件
3. **不破坏**：任何改动必须确保现有功能不受影响，改完后验证相关 API
4. **小文件**：单个文件不超过 500 行，超过必须拆分

---

## 二、工程结构规则

### 2.1 目录职责（不可混用）

```
openclaw/
├── packages/web/           ← 仅放 Next.js 前端代码
│   ├── src/app/            ← 页面路由 + API Routes
│   ├── src/components/     ← UI 组件
│   ├── src/lib/            ← 前端专用工具库（meeting-service 等）
│   └── src/hooks/          ← React Hooks
│
├── packages/im-analyzer/   ← 仅放 IM 分析前端代码（Vite + TDesign）
│   ├── src/pages/          ← 页面
│   ├── src/components/     ← 组件
│   └── src/hooks/          ← Hooks
│
├── packages/server/        ← 仅放后端代码
│   ├── src/routes/         ← Express 路由（按功能域拆分）
│   ├── src/services/       ← 业务逻辑（数据库、外部 API、Playwright）
│   └── src/utils/          ← 纯工具函数（无业务逻辑）
│
├── packages/shared/        ← 仅放跨包共享的类型定义
│   └── types/
│
└── data/                   ← 仅放运行时数据（不放代码）
```

### 2.2 禁止事项

| 禁止 | 原因 |
|------|------|
| 在 `web/` 中写 Express 代码 | 前后端分离 |
| 在 `server/` 中写 React 组件 | 前后端分离 |
| 在 `server/src/routes/` 中写业务逻辑超过 20 行 | 路由只做请求解析和响应，复杂逻辑放 `services/` |
| 在代码中硬编码 `F:/个人/app/...` 等绝对路径 | 用 `process.cwd()`、`path.resolve()`、环境变量 |
| 在代码中硬编码 API 密钥 | 所有密钥放 `.env` |
| 在 `data/` 目录中放代码文件 | `data/` 只存运行时数据 |
| 直接修改 `packages/shared/` 之外的其他包的类型 | 跨包类型统一放 `shared/` |

---

## 三、新增功能的标准流程

### 3.1 新增后端 API

1. **确定功能域**：归属哪个路由文件（`routes/` 下的哪个 `.ts`）
2. **如果现有路由文件不合适**：新建路由文件，命名格式 `{功能域}.ts`
3. **编写路由**：在路由文件中使用 `Router()`，只做请求解析和响应组装
4. **编写业务逻辑**：复杂逻辑放 `services/` 下对应文件
5. **注册路由**：在 `src/index.ts` 中 import 并 `app.use()`
6. **测试**：`curl` 或浏览器验证

**路由文件模板：**

```typescript
import { Router } from "express";

const router = Router();

router.get("/api/xxx", (req, res) => {
  try {
    // 调用 service
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ error: error?.message });
  }
});

export default router;
```

### 3.2 新增前端页面（Web）

1. 在 `packages/web/src/app/` 下创建目录和 `page.tsx`
2. 文件顶部加 `"use client";`（如需客户端交互）
3. 使用 `@/components/ui/` 下的 shadcn 组件，保持 UI 一致性
4. API 调用统一用 `fetch()`，后端 API 走 `/api/xxx`（同域）或 `http://localhost:3001/xxx`（跨域到统一后端）
5. 如需调用外部 API（如飞书），在 `next.config.ts` 的 `rewrites` 中添加代理

### 3.3 新增前端页面（IM Analyzer）

1. 在 `packages/im-analyzer/src/pages/` 下创建页面组件
2. 在 `src/App.tsx` 中注册路由
3. 使用 TDesign 组件库，不要混用 shadcn
4. API 调用走 `/api/xxx`（Vite 代理到 localhost:3001）

---

## 四、代码规范

### 4.1 TypeScript

- 所有新文件必须用 TypeScript（`.ts` / `.tsx`）
- 禁止使用 `any`，除非明确标注原因（`// eslint-disable-next-line @typescript-eslint/no-explicit-any`）
- 接口定义优先用 `interface`，联合类型用 `type`
- 导出类型放在文件顶部

### 4.2 命名规范

| 类型 | 命名 | 示例 |
|------|------|------|
| 路由文件 | kebab-case | `im-sources.ts`、`im-fetch-today.ts` |
| 服务文件 | kebab-case | `meeting-service.ts`、`u9-api.ts` |
| React 组件 | PascalCase | `TaskList.tsx`、`AutoOrderApp.tsx` |
| Hooks | camelCase + use 前缀 | `useAutoSetup.ts`、`useChat.ts` |
| 工具函数 | camelCase | `readEnvFileContent`、`persistEnvVar` |
| 环境变量 | UPPER_SNAKE_CASE | `U9_API_AUTH_ID`、`VOLC_ASR_API_KEY` |
| API 路径 | `/api/{功能域}/{操作}` | `/api/im/sources`、`/api/analysis/run` |
| 数据库表 | snake_case | `chat_records`、`im_sources` |

### 4.3 Import 顺序

```typescript
// 1. Node.js 内置模块
import fs from "fs";
import path from "path";

// 2. 第三方库
import { Router } from "express";
import dayjs from "dayjs";

// 3. 内部模块（services / utils）
import * as db from "../services/db.js";
import { readEnvFileContent } from "../utils/env.js";
```

### 4.4 错误处理

- 路由必须用 `try/catch` 包裹
- 错误响应统一格式：`{ error: string }` 或 `{ success: false, error: string }`
- SSE 流式接口的错误用 `send('error', { message })` 发送
- 不要吞掉错误（至少 `console.error`）

---

## 五、环境变量规范

### 5.1 新增环境变量

1. 在 `openclaw/.env` 中添加，带注释说明用途
2. 在 `PROJECT_STRUCTURE.md` 的第七节更新文档
3. 如果是 Next.js 客户端需要的变量，加 `NEXT_PUBLIC_` 前缀，同时在 `packages/web/.env.local` 中添加

### 5.2 读取方式

```typescript
// 后端：直接读 process.env（dotenv 已在 index.ts 中加载）
const apiKey = process.env.VOLC_ASR_API_KEY;

// 需要动态读取 .env 文件（如 auto-setup 写入后立即读取）：
import { readEnvFileContent, persistEnvVar } from "../utils/env.js";
```

### 5.3 禁止在代码中硬编码以下内容

- API 密钥（`sk-xxx`、`ck_xxx`）
- 工号密码
- 绝对路径（`F:/个人/app/...`）
- 端口号（用 `process.env.PORT || 3001`）

---

## 六、数据规范

### 6.1 数据库修改

- 新增表或字段必须在 `packages/server/src/services/db.ts` 中操作
- 使用 `CREATE TABLE IF NOT EXISTS`，确保幂等
- 新增索引用 `CREATE INDEX IF NOT EXISTS`
- 外键约束：`source_id` 等关联字段必须引用有效的父表记录

### 6.2 文件存储

| 类型 | 位置 | 命名规则 |
|------|------|----------|
| 会议音频 | `data/meetings/` | `{meetingId}_audio.mp3` |
| 会议纪要 | `data/meetings/` | `result__{startTime}__{title}.json` |
| 认证文件 | `data/auth/` | `{系统}-auth.json` |
| 临时上传 | `data/uploads/` | 自动清理 |

---

## 七、Playwright 使用规范

项目中有三处使用 Playwright：会议列表、99U 自动配置、OA 自动下单。

### 7.1 通用规则

- 优先使用系统安装的 Chrome（`executablePath`），避免 Playwright 内置浏览器下载问题
- Chrome 路径探测顺序：`Program Files` → `Program Files (x86)` → `LOCALAPPDATA`
- 非交互场景用 `args: ['--window-position=-2000,-2000']` 隐藏窗口
- 交互场景（如需要扫码）用 `headless: false` 且不设隐藏参数

### 7.2 认证持久化

```typescript
// 保存
await context.storageState({ path: authPath });

// 加载
const context = await browser.newContext({
  storageState: fs.existsSync(authPath) ? authPath : undefined,
});
```

### 7.3 注意事项

- Playwright 操作**必须在前台终端运行的 Server 中执行**，后台进程会导致浏览器卡死
- 所有 Playwright 操作必须有 timeout，防止永久等待
- 操作完毕必须 `await browser.close()`，防止进程泄漏

---

## 八、API 设计规范

### 8.1 RESTful 风格

| 操作 | HTTP 方法 | 路径 | 示例 |
|------|-----------|------|------|
| 列表 | GET | `/api/{资源}` | `GET /api/im/sources` |
| 详情 | GET | `/api/{资源}/:id` | `GET /api/sessions/:sessionId` |
| 创建 | POST | `/api/{资源}` | `POST /api/sessions` |
| 更新 | PATCH/PUT | `/api/{资源}/:id` | `PATCH /api/sessions/:sessionId` |
| 删除 | DELETE | `/api/{资源}/:id` | `DELETE /api/sessions/:sessionId` |
| 执行动作 | POST | `/api/{资源}/{动作}` | `POST /api/analysis/run` |

### 8.2 SSE 流式接口

用于长时间操作（AI 对话、分析、99U 抓取等）：

```typescript
res.setHeader("Content-Type", "text/event-stream");
res.setHeader("Cache-Control", "no-cache");
res.setHeader("Connection", "keep-alive");

const send = (type: string, data: any = {}) => {
  res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
};

send('log', { message: '开始处理...' });
send('progress', { current: 1, total: 10 });
send('done', { result: '完成' });
send('error', { message: '失败原因' });

res.end();
```

### 8.3 响应格式

```typescript
// 成功
{ success: true, data: ... }
// 或直接返回数据
{ records: [], total: 0 }

// 失败
{ error: "错误描述" }
// 或
{ success: false, error: "错误描述" }
```

---

## 九、前端 UI 规范

### 9.1 Web 主站（packages/web）

- 组件库：**shadcn/ui**（基于 Radix + Tailwind）
- 图标库：**lucide-react**
- 样式：**Tailwind CSS v4**，不写自定义 CSS（除非组件库不支持）
- 主题：深色主题为主，颜色使用 Tailwind 的语义化类名（`text-foreground`、`bg-muted`）
- **禁止使用紫色系**（`text-primary`、`text-violet`）作为文字颜色，深色主题下对比度不够
- 字体大小：正文 `text-base`（16px），辅助信息 `text-sm`（14px），标签 `text-xs`（12px）

### 9.2 IM Analyzer（packages/im-analyzer）

- 组件库：**TDesign React**
- 样式：**Tailwind CSS v3 + Less**
- 不要混用 shadcn 组件

### 9.3 通用规则

- 不使用 emoji 作为图标（用 lucide-react 图标代替），标签内的 emoji 例外
- 加载状态用 `<Loader2 className="animate-spin" />`
- 空状态用居中文字 + muted 颜色

---

## 十、Git 规范（预留）

### Commit 格式

```
{type}({scope}): {description}

feat(server): 新增自动下单 /execute 路由
fix(web): 修复会议纪要弹窗紫色文字问题
refactor(server): 拆分 im-u9 路由中的辅助函数到 utils
docs: 更新 PROJECT_STRUCTURE.md
```

| type | 说明 |
|------|------|
| `feat` | 新功能 |
| `fix` | 修复 bug |
| `refactor` | 重构（不改变功能） |
| `style` | UI/样式调整 |
| `docs` | 文档 |
| `chore` | 构建/配置/依赖 |

### scope

`server`、`web`、`im-analyzer`、`shared`、`data`、`root`

---

## 十一、AI 开发者必读

如果你是 AI 助手，在修改本项目代码前，请遵守以下规则：

1. **先读文档**：`PROJECT_STRUCTURE.md`（工程结构）和本文档（开发规范）
2. **先搜再写**：用 `search_content` 搜索现有代码，避免重复实现
3. **不要大规模重写**：优先用 `replace_in_file` 做精准修改，不要 rewrite 整个文件
4. **路径用绝对路径**：工具调用时用完整的 `F:\个人\app\openclaw\...` 路径
5. **改完验证**：修改后端代码后提醒用户重启 Server，修改前端代码会自动热更新
6. **不删 .codebuddy**：`.codebuddy` 文件夹存储项目相关数据，禁止删除
7. **不改 .env 中的密钥**：除非用户明确要求更换
8. **服务启动**：Server 必须在前台终端运行（`tsx src/index.ts`），不要用后台进程
9. **依赖安装**：使用 `npm install --legacy-peer-deps`，不要用 pnpm（Windows 中文路径有 bug）
10. **新功能清单**：完成后更新 `PROJECT_STRUCTURE.md`

---

## 十二、AI Prompt 工程规范

项目中有多处使用 AI 生成内容（立项文档、需求分析、任务拆解、会议纪要、会议智能分析），需遵循以下规范：

### 12.1 LLM 接入方式

| 项目 | 用途 | API | 模型 | 说明 |
|------|------|-----|------|------|
| 立项文档生成 | 生成立项表单 JSON | Moonshot 直连 | moonshot-v1-128k | 后端 Server 直接调用 |
| 需求分析 | 分析需求/功能点/技术要点 | Moonshot 直连 | moonshot-v1-128k | 注入 UE5/3D 领域知识 |
| 任务拆解 | 拆解开发任务 | Moonshot 直连 | moonshot-v1-128k | 7 种任务分类 |
| 会议纪要生成 | 转录文本→结构化纪要 | Moonshot 直连（Next.js） | moonshot-v1-128k | Next.js API Route |
| 会议智能分析 | 决策/风险/行动项提取 | Moonshot 直连 | moonshot-v1-128k | temperature=0.3 低随机度 |
| 快速搜索 | AI 对话 | OpenAI 兼容 | 可配置 | 通过 Next.js ProxyAgent 代理 |

**关键规则**：
- **后端 Server 的 AI 调用必须直连 Moonshot**（`api.moonshot.cn`），不要走代理中转（公司网络 ECONNRESET）
- **Next.js API Route 的 AI 调用可走 ProxyAgent**（已配置 undici 代理支持）
- 环境变量优先级：`MOONSHOT_API_KEY` > `OPENAI_API_KEY`

### 12.2 System Prompt 编写规范

- 使用严格的 JSON 输出格式模板，要求"不要输出 JSON 以外的内容"
- 对于领域特定功能（如 3D/UE5 项目），在 system prompt 中注入**领域专业知识**
  - 示例：需求分析 prompt 包含 Actor/Component、Enhanced Input、Nanite/Lumen、Niagara 等 UE5 技术关键词
- 任务拆解 prompt 要包含**分类枚举和示例**，确保输出格式一致
- 会议分析类 prompt 要**低 temperature**（0.2~0.3），减少幻觉；创意类 prompt 用 0.7

### 12.3 SSE 流式解析规范

所有 SSE 流式接口统一使用以下事件类型：

```typescript
send('log', { message: '开始处理...' });      // 日志提示
send('progress', { current: 1, total: 10 });   // 进度
send('chunk', { content: '...' });             // 文本流片段
send('done', { result: {...} });               // 完成+结果
send('error', { message: '失败原因' });        // 错误
res.end();                                     // 结束连接
```

前端解析时按 `type` 字段分发处理。

---

## 十三、业务 ID 生成规范

项目中的核心业务实体使用全局唯一 ID，作为全流程串联主键：

### 格式规则

| 实体 | 前缀 | 格式 | 示例 |
|------|------|------|------|
| 项目立项 | PI | `PI-{YYYYMMDD}-{NNN}` | `PI-20260416-001` |
| 需求分析 | RA | `RA-{YYYYMMDD}-{NNN}` | `RA-20260416-001` |
| 开发任务 | DT | `DT-{YYYYMMDD}-{NNN}` | `DT-20260416-001` |

### 生成逻辑

```sql
-- 当天自增序号：查询当天最大序号 +1
SELECT id FROM {table} WHERE id LIKE 'PI-{date}-%' ORDER BY id DESC LIMIT 1
```

### 关联关系

```
project_initiations (PI-ID)
  └─ requirement_analyses (RA-ID, initiation_id FK → PI-ID)
       └─ dev_tasks (DT-ID, requirement_id FK → RA-ID)
```

PI-ID 是最上游的标识，贯穿立项→需求→任务→交付全流程。

---

## 十四、业务状态流转规范

### 立项状态

```
draft(草稿) → pending(去立项) → submitted(已提交) → approved(通过)
                                              ↘ rejected(驳回)
```
- `draft`：新建后自动进入，可反复编辑保存
- `pending`：提交后进入，表示等待上级审批
- `submitted` / `approved` / `rejected`：后续审批流程使用

### 需求分析状态

```
draft(草稿) → analyzed(已分析) → tasked(已拆解) → in_progress(进行中) → done(已完成)
```
- `analyzed`：AI 生成分析后自动进入
- `tasked`：确认并拆解任务后进入
- `in_progress`：有任务开始开发时自动进入
- `done`：所有任务完成后可手动标记

### 任务状态（四列看板）

```
todo(待开发) → in_progress(开发中) → testing(测试中) → done(已完成)
     ↑              ↑                              │
     └──────────────┴──────────────────────────────┘┘
        支持回退    支持跳过
```

---

## 十五、会议音频 URL 处理规范

会议音频下载涉及多层匹配，优先级如下：

```
1. 前端直接传入 audioDirectUrl（最高优先级）
2. meeting-audio-links.json 中标题精确匹配
3. meeting-audio-links.json 中时间范围匹配
4. Playwright 实时抓取 audio-url 接口（传 rowIndex 精准定位）
5. 无匹配 → 返回 undefined（禁止 fallback 到不相关的 URL！）
```

**重要教训**：
- **绝对不能做 "fallback-any" 逻辑**（随便拿映射中第一个 URL），会导致下载错误的会议音频
- 映射文件会过期，新会议不在其中是正常的，应走 Playwright 实时抓取
- 前端必须传递 `_rowIndex` 给 process 接口，让 Playwright 能精准点击正确的行
- 大文件上传（>30MB）需要设置 AbortController 超时，防止 fetch 卡死

---

## 十六、新增组件规范

### 16.1 组件目录组织

每个业务模块的组件放在独立目录下：

```
src/components/{module-name}/
  ├── ComponentName.tsx      ← 主组件
  └── SubComponent.tsx       ← 子组件（如需要）
```

已有目录：`project-initiation/`、`requirements/`、`auto-order/`

### 16.2 表单组件规范

- 使用 shadcn/ui 的 `Input`、`Textarea`、`Select`、`Label`、`Button`、`Badge` 等基础组件
- 表单字段分组使用 Card + 标题区分区域
- AI 生成的内容展示在只读/可编辑的表格或卡片中
- 加载/错误状态使用 `Loader2`（旋转动画）和 muted 颜色文字
- 操作按钮放右上角（保存/提交/取消）

### 16.3 看板/列表组件规范

- 状态 Badge 用颜色语义：绿色=完成、蓝色=进行中、黄色=待处理/测试中、红色=高风险
- 优先级标签：high→红色、medium→琥珀色、low→绿色
- 分类标签用不同颜色区分类别（frontend/blue、backend/green、design/purple、interaction/cyan等）
