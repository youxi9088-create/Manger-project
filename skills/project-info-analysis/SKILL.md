---
name: project-info-analysis
description: "AIHub 项目信息分析中心：统一通过 AIHub 工作流接口（https://bv.new.ndhy.com/api/agent/aihub）触发与轮询工作流，完成项目数据聚合、状态更新、日报生成、综合分析等项目信息相关流程。鉴权 token 仅从环境变量读取，不写入 skill。"
version: "1.0.0"
---

# AIHub 项目信息分析中心

本 skill 覆盖**项目信息分析**相关能力：包括项目数据聚合、项目状态更新、日报生成、风险分析等。能力别名统一在 `references/known-bots.md` 维护，并通过 `references/aihub-workflow-mapping.md` 绑定到 AIHub 的能力别名（UUID 集中在 `examples/_appids.ps1`，推理时只用别名）。

## 使用说明

### 前置条件

- 设置环境变量：`$env:AIHUB_AGENT_TOKEN = "bvk_***"`
- 如果没有 API key，请联系管理员申请

### 快速开始

```powershell
# 直接运行示例脚本
./examples/project-info.ps1
```

或手动调用：

```powershell
. "./examples/_appids.ps1"
. "./examples/_common.ps1"

$alias = "project-info"
$appId = Get-AIHubAppId -Alias $alias
$run = Start-AIHubRun -AppId $appId -Alias $alias -Inputs @{
    proid = "137372"
    ask   = "更新项目状态"
}

$status = Wait-AIHubRun -RunId $run.runId -IntervalSec 3 -TimeoutSec 180
$outputs = Get-AIHubRunOutputs -RunId $run.runId
```

## API 基础信息

- **Base URL:** `https://bv.new.ndhy.com/api/agent/aihub`
- **鉴权:** `Authorization: Bearer <token>`
  - token 仅从环境变量读取：`AIHUB_AGENT_TOKEN`
- **触发工作流:** `POST /workflows/run`
- **查询状态:** `GET /workflows/runs/:runId`
- **获取输出:** `GET /workflows/runs/:runId/outputs`

## AppId 防幻觉规则

- **LLM 只选择能力别名**（如 `project-info`），不要手写、猜测、复述或从上下文复制 appId。
- **唯一 appId 注册表是 `examples/_appids.ps1`**。
- 若报错包含 `The app no longer exists`，先核对调用方是否绕过别名注册表、手写了错误 appId。

## 已知 Bot 列表

见 `references/known-bots.md`。

## 注意事项

- 不要把 token 写进 skill 文件或提交到版本库，只用环境变量管理。
- `GET /workflows/runs/:runId/outputs` 只有在状态为 `succeeded` 时才会返回；`queued/running` 时可能返回 `409` 属正常。
- 若遇到 `type: server_error`，通常是 OpenAI/Azure 官方侧繁忙导致，建议直接重试。
