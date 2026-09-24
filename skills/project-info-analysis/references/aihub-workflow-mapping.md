# AIHub Workflow Mapping（项目信息能力索引）

本表描述「能力别名」与其对应工作流的**用途、输入输出摘要**。
UUID 统一维护在 `examples/_appids.ps1`，LLM 推理时只使用别名。

**禁止手写 appId：** 新增/调用能力时只选择下表别名；脚本从 `examples/_appids.ps1` 解析 appId。若看到 `The app no longer exists`，先检查调用方是否手写了错误 UUID。

统一调用方式：`POST /workflows/run` → 轮询 `GET /workflows/runs/:runId` → `GET /workflows/runs/:runId/outputs`

| 别名 | 能力说明 | 典型输入 | 典型输出 | 备注 |
|------|----------|----------|----------|------|
| `project-info` | 项目信息综合分析（项目数据聚合/日报/状态更新） | proid(项目ID), ask(查询/指令) | text / markdown 报告 | 输入 proid 与 ask，返回项目综合分析文本；预计耗时数秒至数十秒 |
