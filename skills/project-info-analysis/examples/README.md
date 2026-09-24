# 项目信息分析 — 示例脚本索引

> **使用方式：** 修改脚本顶部 `# 配置区` 的参数，然后直接运行 `./project-info.ps1`
> **前提条件：** 必须先设置 `$env:AIHUB_AGENT_TOKEN = "bvk_***"`

## 脚本速查

| 脚本 | AppId (尾6位) | 预计耗时 | 轮询 | 超时 |
|------|--------------|---------|------|------|
| `project-info.ps1` | `...4a5dc6` | ~5-60s | 3s | 1800s |

## 高级用法

脚本完全自包含。如果你想复用通用逻辑，可以 source `_common.ps1`：

```powershell
. "/path/to/examples/_appids.ps1"
. "/path/to/examples/_common.ps1"
$alias = "project-info"
$appId = Get-AIHubAppId -Alias $alias
$run = Start-AIHubRun -AppId $appId -Alias $alias -Inputs @{ proid = "137372"; ask = "更新项目状态" }
$status = Wait-AIHubRun -RunId $run.runId -IntervalSec 3 -TimeoutSec 180
$outputs = Get-AIHubRunOutputs -RunId $run.runId
```

## AppId 防幻觉检查

AppId 只允许维护在 `_appids.ps1`。发布或移交前运行：

```bash
./verify-appid-registry.sh
```

如果检查失败，说明某个文档或脚本内联了完整 appId；应改为使用别名和 `Get-AIHubAppId`。
