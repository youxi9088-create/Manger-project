# 项目信息综合分析 — project-info
# 用法: $env:AIHUB_AGENT_TOKEN = "bvk_***"; ./project-info.ps1

# 配置区
$WorkflowAlias = "project-info"
$Proid = "137372"
$Ask   = "更新项目状态"

# 加载通用库
$ScriptDir = $PSScriptRoot
. "$ScriptDir/_appids.ps1"
. "$ScriptDir/_common.ps1"

$appId = Get-AIHubAppId -Alias $WorkflowAlias
$inputs = @{
    proid = $Proid
    ask   = $Ask
}

Write-Host "[project-info] 触发工作流: alias=$WorkflowAlias, proid=$Proid, ask=$Ask" -ForegroundColor Cyan
$run = Start-AIHubRun -AppId $appId -Alias $WorkflowAlias -Inputs $inputs -Meta @{ label = "project-info-run" }

Write-Host "[project-info] runId=$($run.runId)，轮询中..." -ForegroundColor Cyan
$status = Wait-AIHubRun -RunId $run.runId -IntervalSec 3 -TimeoutSec 180

if ($status.status -eq "succeeded") {
    $outputs = Get-AIHubRunOutputs -RunId $run.runId
    Write-Host "[project-info] 成功，输出:" -ForegroundColor Green
    $outputs | ConvertTo-Json -Depth 20
} else {
    Write-Host "[project-info] 失败: $($status | ConvertTo-Json -Depth 10)" -ForegroundColor Red
}
