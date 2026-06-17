# Auto-Order 自动下单技能

## 概述

自动下单是 OpenClaw 的核心自动化能力之一。它通过 **Playwright 浏览器自动化引擎**，实现从「飞书多维表格（Feishu Bitable）」到「OA 系统需求子任务」的全自动填写流程。

## 架构

```
┌──────────────────────┐     ┌─────────────────────────┐
│  飞书多维表格         │     │  OA 系统                 │
│  (Feishu Bitable)    │     │  (需求子任务表单)         │
│                      │     │                          │
│  ┌────────────────┐  │     │  ┌──────────────────┐   │
│  │ 需求名称        │  │     │  │ 任务标题          │   │
│  │ 负责人          │  │     │  │ 任务详情          │   │
│  │ 工时            │  │  │     │  │ 开发人员          │   │
│  │ UUID            │──┼─────┼─▶│ 编码计划完成时间   │   │
│  │ 完成时间        │  │     │  │ 编码预估工时      │   │
│  └────────────────┘  │     │  │ 保存/提交         │   │
│                      │     │  └──────────────────┘   │
└──────────────────────┘     └──────────────────────────┘
         │                            ▲
         │  HTTP API                  │ Playwright 自动化
         ▼                            │
┌───────────────────────────────────────────────┐
│              OpenClaw Server                   │
│  ┌─────────────────┐  ┌────────────────────┐  │
│  │ POST /execute    │  │ oa-automation.js   │  │
│  │ (接收下单请求)    │──│ (Playwright 引擎)   │  │
│  └─────────────────┘  └────────────────────┘  │
│  ┌─────────────────┐  ┌────────────────────┐  │
│  │ auto-order-     │  │ auth.json          │  │
│  │ config.ts        │  │ (登录凭证持久化)   │  │
│  └─────────────────┘  └────────────────────┘  │
└───────────────────────────────────────────────┘
```

## 核心文件

| 文件 | 作用 |
|------|------|
| `packages/server/src/services/oa-automation.js` | **Playwright 自动化引擎** — 浏览器操作核心逻辑 |
| `packages/server/src/routes/automation.ts` | TypeScript 版自动化路由（改进版） |
| `packages/server/src/routes/auto-order-config.ts` | 配置读写 API（config + tasks JSON） |
| `packages/web/src/components/auto-order/AutoOrderApp.tsx` | 前端主应用（标签页导航） |
| `packages/web/src/components/auto-order/ConfigPanel.tsx` | 前端配置面板（Feishu + OA 配置） |
| `packages/web/src/components/auto-order/MappingPanel.tsx` | 字段映射面板（Feishu 字段 → OA 字段） |
| `packages/web/src/components/auto-order/TaskList.tsx` | 任务队列 + 执行按钮 |
| `packages/web/src/components/auto-order/Dashboard.tsx` | 任务统计仪表盘 |
| `packages/web/src/components/auto-order/TerminalOutput.tsx` | 执行日志终端 |
| `packages/web/src/components/auto-order/types.ts` | TypeScript 类型定义 |
| `data/auto-order-config.json` | 持久化配置（运行时生成） |
| `data/auto-order-tasks.json` | 持久化任务列表（运行时生成） |
| `data/auth/oa-auth.json` | OA 登录凭证（Playwright storageState） |

## 配置说明

### Feishu 飞书配置
需要在飞书开放平台创建企业自建应用，获取：
- **App ID** (`cli_xxx`)
- **App Secret**
- **Base App Token** (`basc_xxx`) — 多维表格的 Base token
- **Table ID** (`tbl_xxx`) — 具体表格 ID

### OA 系统配置
- **OA 登录 URL** — 系统首页地址
- **用户名 / 密码** — 用于首次登录（后续通过 auth.json 免登录）

### 字段映射
将飞书多维表格的字段名映射到 OA 表单字段：

| 映射键 | 说明 |
|--------|------|
| `需求名称` | 任务标题（映射到 OA 第3列） |
| `任务详情` | 详细描述（textarea） |
| `负责人` | 开发人员（通过选择用户弹窗） |
| `完成时间` | 编码计划完成时间（日期选择器） |
| `工时` | 编码预估工时（第7列数字输入） |
| `uuid` | OA 检索标识码（用于在 OA 全需求列表中搜索定位） |
| `下单字段` | 标记是否已下单（是/否） |
| `下单链接` | 提交后生成的 OA 详情页 URL |

## API 接口

### `POST /execute` — 执行自动下单

请求体：
```json
{
  "uuid": "需求的 UUID 标识",
  "taskData": {
    "需求名称": "xxx",
    "任务详情": "xxx",
    "负责人": "xxx",
    "完成时间": "2026-05-20",
    "工时": 8
  },
  "oaConfig": {
    "url": "https://oa-system.com",
    "username": "xxx",
    "password": "xxx"
  }
}
```

响应：
```json
{
  "success": true,
  "message": "任务 [uuid] 填报完成",
  "orderUrl": "https://oa-system.com/detail/xxx"
}
```

### `GET /api/auto-order/config` — 读取配置
### `PUT /api/auto-order/config` — 保存配置
### `GET /api/auto-order/tasks` — 读取任务列表
### `PUT /api/auto-order/tasks` — 保存任务列表

## 自动化流程（Playwright 引擎）

```
1. 启动 Chromium 浏览器 (headless: false, slowMo: 50)
2. 加载 auth.json 登录凭证（免登录）
3. 导航到 OA 系统 URL
4. 检查是否被重定向到登录页 → 是则报错
5. 处理弹出「确定」按钮
6. 导航菜单: [管理员权限菜单] → 全需求列表
7. 搜索 UUID
8. 两段式雷达扫描:
   a. SEARCHING: 遍历 DOM 查找 UUID 文本所在行，横向滚动展开视图
   b. SCROLLED: 在同一行查找「@增加子任务链接」并点击
9. 接管新打开的标签页
10. 处理「草稿恢复」弹窗 → 点击取消/不载入
11. 点击「添加新数据」按钮
12. 填写表单:
    A. 任务标题（第3列 input）
    B. 任务详情（textarea）
    C. 开发人员（第5列 → 选择用户弹窗 → 搜索 → 确认）
    D. 编码计划完成时间（第6列 → 日历选择器 / 强行注入文本）
    E. 编码预估工时（第7列 input）
13. 点击保存/提交
14. 等待跳转，获取详情页 URL
15. 刷新 auth.json 凭证（延长免登录有效期）
16. 返回结果（含 orderUrl）
```

## 关键实现细节

### 首次登录流程
首次使用需要手动登录一次。OA 自动化使用 Playwright 的 `storageState` 机制持久化 Cookie/Token：
- 首次执行时会打开浏览器窗口，要求用户手动输入凭据
- 登录成功后，脚本会自动保存 `auth.json`
- 后续执行直接加载 `auth.json` 实现免登录
- 每次执行完毕后刷新 `auth.json` 以延长有效期

### 日历日期选择器处理
OA 系统的日期选择器有 readonly 属性，实现自动填写的策略：
1. 优先尝试触发日历浮层，点击对应日期
2. 如果日历组件无法触发 → 移除 input 的 readonly 属性 → 使用 fill() 直接输入
3. 最终保底：通过 keyboard.type() 直接敲入日期

### 负责人选择
OA 系统使用弹窗选择用户：
1. 点击负责人单元格触发下拉
2. 点击「选择用户」按钮打开用户选择弹窗
3. 搜索框输入姓名 → 回车搜索
4. 点击搜索结果中的用户 → 确认

### 凭证保活
每次执行成功后，会自动调用 `context.storageState({ path: authPath })` 保存最新的 Cookie/Token，延长免登录有效期。

## 常见问题

### Q: 凭证过期怎么办？
执行后检查是否被重定向到登录页。如果是，需要删除 `data/auth/oa-auth.json`，然后重新执行一次下单（会自动弹出浏览器窗口供手动登录）。

### Q: 浏览器窗口能否隐藏？
可以修改 `oa-automation.js` 中 `chromium.launch({ headless: true })` 启用无头模式。但 OA 系统可能有反爬检测，建议保留 `headless: false`。

### Q: 如何支持多个 OA 表格？
前端已支持按 `tableId` 分别存储任务和映射配置。每个飞书表格有独立的 task 存储 key (`mcp_tasks_{tableId}`) 和映射存储 key (`mcp_mapping_{tableId}`)。

### Q: OA 页面结构变了怎么办？
修改 `oa-automation.js` 中的选择器和定位逻辑。核心定位策略：
- `text=xxx` 文本匹配
- `[name*="xxx"]` 属性模糊匹配
- `td:nth(N)` 列索引定位
- `document.createTreeWalker` 深度 DOM 搜索

## 拓展指南

### 添加新字段
1. 在 `type.ts` 的 `Task.fields` 中添加新字段
2. 在 `AutoOrderApp.tsx` 的映射中读取新字段
3. 在 `oa-automation.js` 的「精准填报」阶段添加填写逻辑
4. 在 MappingPanel 中添加映射 UI

### 支持新 OA 系统
1. 修改 `oa-automation.js` 中的导航、搜索、填写三个阶段
2. 调整 `oaConfig` 配置结构
3. 更新前端 ConfigPanel 的配置项
