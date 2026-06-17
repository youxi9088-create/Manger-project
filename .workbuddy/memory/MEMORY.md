# OpenClaw 长期记忆

## 后端启动注意

- `start.bat` 用 `npx tsx src/index.ts` 直接跑 TS 源码，不经过 dist/
- cmd 在处理中文路径 `f:\个人\app\openclaw` 时会报"系统找不到指定的路径"
- 正确启动方式：`powershell -Command "Start-Job -ScriptBlock { Set-Location 'f:\个人\app\openclaw\packages\server'; npx tsx src/index.ts }"`
- Node 24 与 better-sqlite3 编译版本不匹配，不能用 `node -e` 直接跑 SQLite 代码，必须用 tsx 或 Python

## SQLite 注意事项

- `CREATE TABLE IF NOT EXISTS` 不会更新已存在表的外键定义。如果需要改 FK 行为必须 migration（drop + recreate）
- 当前数据库旧表的外键实际是 `on_delete=NO ACTION`（非 CASCADE），不要启用 `foreign_keys = ON`
- deleteSession 采用显式事务删除关联数据（agent_tasks → messages → sessions），不依赖级联

## Agent Loop 设计决策（2026-04-22）

- agent-loop.ts 最后一轮迭代不传 tools，强制 LLM 输出纯文本摘要
- 检测 finish_reason=length 并追加截断提示
- exec-agent text 事件截断上限 500 字符（非 100）

## 需求状态动态计算（2026-04-27）

- 采用 computed_status 模式：后端实时计算，不修改 DB schema
- `computeRequirementStatus()` 位于 `packages/server/src/routes/requirements.ts`
- 状态值：`pending → draft → analyzed → tasked → in_progress → done`
- 前端三处 STATUS_MAP 已统一命名："已拆解"（非"已拆分"）、"开发中"（非"进行中"）
- Agent 工具（write/query）的状态枚举已修复，与 DB CHECK 约束一致
