# AIHub AppId 注册表 — 唯一存放 UUID 的文件
# 用法: . "$PSScriptRoot/_appids.ps1"  然后用 $AIHUB_APP_IDS["别名"]
#
# 别名规则：小写英文短名，与 references/aihub-workflow-mapping.md 对应
# 防幻觉规则：LLM/调用脚本只使用别名，不手写、不复述、不改写 appId。

$AIHUB_APP_IDS = @{
    "project-info" = "eee4cd05-ded3-4794-84e2-73d2494a5dc6"
}

function Get-AIHubAppId {
    param([Parameter(Mandatory=$true)][string]$Alias)
    if (-not $AIHUB_APP_IDS.ContainsKey($Alias)) {
        $known = ($AIHUB_APP_IDS.Keys | Sort-Object) -join ", "
        throw "Unknown AIHub app alias: $Alias. Known aliases: $known"
    }
    return $AIHUB_APP_IDS[$Alias]
}
