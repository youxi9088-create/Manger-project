# 项目信息分析 Bot 清单

## 项目信息bot（别名：`project-info`）

**描述:** 基于项目全量数据生成综合分析报告，支持项目状态更新、日报、数据查询等场景  
**用途:** 输入项目 ID 与自然语言查询/指令，返回结构化的 Markdown 分析报告

### 输入字段

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `proid` | string | ✅ | - | 项目 ID，例如 `137372`、`PI-20260513-001` |
| `ask` | string | ✅ | - | 查询/指令，例如 `更新项目状态`、`生成日报`、`分析当前风险` |

### 输出字段

- `text` / `answer`（string）— Markdown 格式的项目综合分析文本
- 可能包含：项目概况、阶段目标、周计划、执行待办、风险预警等

### 使用案例（PowerShell）

```powershell
$BaseUrl = "https://bv.new.ndhy.com/api/agent/aihub"
$Token = $env:AIHUB_AGENT_TOKEN
if (-not $Token) { throw "Missing env: AIHUB_AGENT_TOKEN" }
$Headers = @{ Authorization = "Bearer $Token"; "Content-Type"="application/json" }

. "$PSScriptRoot/_appids.ps1"
$WorkflowAlias = "project-info"
$appId = Get-AIHubAppId -Alias $WorkflowAlias
$body = @{
  appId  = $appId
  inputs = @{
    proid = "137372"
    ask   = "更新项目状态"
  }
  meta = @{ label = "project-info-test" }
} | ConvertTo-Json -Depth 20 -Compress

$run = Invoke-RestMethod -Method Post -Uri "$BaseUrl/workflows/run" -Headers $Headers -Body $body
$runId = $run.runId

# 轮询等待
while ($true) {
  Start-Sleep -Seconds 3
  $st = Invoke-RestMethod -Method Get -Uri "$BaseUrl/workflows/runs/$runId" -Headers $Headers
  if ($st.status -eq "succeeded" -or $st.status -eq "failed") { break }
}

$out = Invoke-RestMethod -Method Get -Uri "$BaseUrl/workflows/runs/$runId/outputs" -Headers $Headers
$out
```

### 注意事项

- `proid` 与 `ask` 均为必填字段
- 输出为文本/Markdown，可直接渲染展示
- 预计耗时数秒至数十秒，视项目数据量而定
