# AIHub 共享函数库
# 用法（可选）: . "/path/to/examples/_common.ps1"
# 每个示例脚本都是自包含的，不需要 source 本文件也能独立运行
# 本文件仅供希望复用通用逻辑的高级用户使用

$Script:BaseUrl = "https://bv.new.ndhy.com/api/agent/aihub"

function Get-AIHubToken {
  $token = $env:AIHUB_AGENT_TOKEN
  if (-not $token) {
    throw "Missing env: AIHUB_AGENT_TOKEN — 请先运行 `$env:AIHUB_AGENT_TOKEN = 'bvk_***'`"
  }
  return $token
}

function Get-AIHubAppId {
  param(
    [Parameter(Mandatory=$true)]
    [string]$Alias
  )

  if (-not (Get-Variable -Name AIHUB_APP_IDS -Scope Global -ErrorAction SilentlyContinue) -and -not (Get-Variable -Name AIHUB_APP_IDS -ErrorAction SilentlyContinue)) {
    throw "Missing `$AIHUB_APP_IDS registry. Source examples/_appids.ps1 before resolving app aliases."
  }
  if (-not $AIHUB_APP_IDS.ContainsKey($Alias)) {
    $known = ($AIHUB_APP_IDS.Keys | Sort-Object) -join ", "
    throw "Unknown AIHub app alias: $Alias. Known aliases: $known"
  }
  return $AIHUB_APP_IDS[$Alias]
}

function New-AIHubHeaders {
  return @{
    Authorization  = "Bearer $(Get-AIHubToken)"
    "Content-Type" = "application/json; charset=utf-8"
  }
}

<#
.SYNOPSIS
  带指数退避重试的 HTTP 请求
.PARAMETER Method
  GET 或 POST
.PARAMETER Uri
  完整 URL
.PARAMETER Body
  JSON 字符串（仅 POST）
.PARAMETER MaxRetries
  最大重试次数（默认 3）
.PARAMETER BackoffMs
  退避基数毫秒（默认 1000）
#>
function Invoke-AIHubRequest {
  param(
    [ValidateSet("GET", "POST")]
    [string]$Method,
    [string]$Uri,
    [string]$Body,
    [int]$MaxRetries = 3,
    [int]$BackoffMs = 1000
  )

  $headers = New-AIHubHeaders
  $attempt = 0
  $lastError = $null

  while ($attempt -le $MaxRetries) {
    try {
      $params = @{
        Method  = $Method
        Uri     = $Uri
        Headers = $headers
      }
      if ($Method -eq "POST" -and $Body) {
        $utf8 = [System.Text.Encoding]::UTF8.GetBytes($Body)
        $params.Body = $utf8
      }
      $attempt++
      return Invoke-RestMethod @params
    } catch {
      $lastError = $_
      $statusCode = $_.Exception.Response.StatusCode.value__

      # 不可重试的错误
      if ($statusCode -eq 400) {
        Write-Host "  [ERROR] 400 Bad Request — 参数错误，不重试: $($_.ErrorDetails.Message)" -ForegroundColor Red
        throw
      }

      # 可重试的错误
      if ($attempt -le $MaxRetries) {
        $delay = $BackoffMs * [Math]::Pow(2, $attempt - 1)
        Write-Host "  [RETRY] $Method $Uri — HTTP $statusCode, ${attempt}/$MaxRetries, ${delay}ms 后重试..." -ForegroundColor Yellow
        Start-Sleep -Milliseconds $delay
      }
    }
  }

  throw "重试 $MaxRetries 次后仍失败: $($lastError.Exception.Message)"
}

<#
.SYNOPSIS
  校验逗号分隔的 URL 可访问；失败时在触发工作流前停止
.PARAMETER Urls
  单个 URL，或英文逗号分隔的多个 URL
.PARAMETER FieldName
  字段名，用于错误提示，例如 image_urls / image_url_list / video_url_list
#>
function Assert-AIHubUrlsReachable {
  param(
    [string]$Urls,
    [string]$FieldName = "urls"
  )

  if ([string]::IsNullOrWhiteSpace($Urls)) { return }
  if ($Urls.Trim().ToLowerInvariant() -eq "null") {
    throw "$FieldName 不能传 null 或字符串 'null'；无参考资源时请省略该字段或传空字符串"
  }

  $urlItems = @($Urls -split "," | ForEach-Object { $_.Trim() } | Where-Object { $_ })
  if ($urlItems.Count -eq 0) { throw "$FieldName 为空；无参考资源时请省略该字段或传空字符串" }

  foreach ($url in $urlItems) {
    $uri = $null
    if (-not [System.Uri]::TryCreate($url, [System.UriKind]::Absolute, [ref]$uri) -or ($uri.Scheme -ne "http" -and $uri.Scheme -ne "https")) {
      throw "$FieldName 包含非法 URL: $url。请使用可公网访问的 http/https 地址"
    }

    try {
      Invoke-WebRequest -Method Head -Uri $url -TimeoutSec 20 -MaximumRedirection 5 | Out-Null
    } catch {
      try {
        Invoke-WebRequest -Method Get -Uri $url -Headers @{ Range = "bytes=0-0" } -TimeoutSec 20 -MaximumRedirection 5 | Out-Null
      } catch {
        throw "$FieldName 不可访问或已过期: $url。请重新上传到 CS/CDN 后再提交。原始错误: $($_.Exception.Message)"
      }
    }
  }
}

function Assert-AIHubImageUrlsReachable {
  param(
    [string]$ImageUrls,
    [string]$FieldName = "image_urls"
  )
  Assert-AIHubUrlsReachable -Urls $ImageUrls -FieldName $FieldName
}

<#
.SYNOPSIS
  触发工作流 run
.PARAMETER AppId
  工作流 appId
.PARAMETER Inputs
  hashtable 形式的输入参数
.PARAMETER Meta
  可选 meta 标签
#>
function Start-AIHubRun {
  param(
    [string]$AppId,
    [hashtable]$Inputs,
    [hashtable]$Meta = @{},
    [string]$Alias = ""
  )

  $body = [ordered]@{ appId = $AppId; inputs = $Inputs }
  if ($Meta.Count -gt 0) { $body.meta = $Meta }

  $json = ($body | ConvertTo-Json -Depth 20 -Compress)
  $label = if ($Alias) { "alias=$Alias" } else { "appId resolved from registry" }
  Write-Host "  [POST] /workflows/run — $label" -ForegroundColor Cyan
  $run = Invoke-AIHubRequest -Method POST -Uri "$Script:BaseUrl/workflows/run" -Body $json
  Write-Host "  runId = $($run.runId)" -ForegroundColor Green
  return $run
}

<#
.SYNOPSIS
  查询 run 状态
#>
function Get-AIHubRunStatus {
  param([string]$RunId)
  return Invoke-AIHubRequest -Method GET -Uri "$Script:BaseUrl/workflows/runs/$RunId"
}

<#
.SYNOPSIS
  获取 run 输出（仅 succeeded 时有效）
#>
function Get-AIHubRunOutputs {
  param([string]$RunId)
  return Invoke-AIHubRequest -Method GET -Uri "$Script:BaseUrl/workflows/runs/$RunId/outputs"
}

<#
.SYNOPSIS
  轮询等待工作流完成
.PARAMETER RunId
  工作流 runId
.PARAMETER IntervalSec
  轮询间隔秒数
.PARAMETER TimeoutSec
  超时秒数
.PARAMETER SkipRetryOnServerError
  遇到 5xx 时是否跳过继续（而非抛错）
#>
function Wait-AIHubRun {
  param(
    [string]$RunId,
    [int]$IntervalSec = 10,
    [int]$TimeoutSec = 1800,
    [switch]$SkipRetryOnServerError
  )

  $start = Get-Date
  $poll = 0

  while ($true) {
    $poll++
    $elapsed = [math]::Round(((Get-Date) - $start).TotalSeconds, 1)

    try {
      $st = Get-AIHubRunStatus -RunId $RunId
      $status = $st.status

      if ($status -eq "succeeded") {
        Write-Host "  DONE — succeeded in ${elapsed}s ($poll polls)" -ForegroundColor Green
        return $st
      }
      if ($status -eq "failed") {
        $errMsg = if ($st.error.message) { $st.error.message }
                  elseif ($st.aiHubError.message) { $st.aiHubError.message }
                  elseif ($st.lastPollError) { $st.lastPollError }
                  else { $null }
        if (-not $errMsg) { $errMsg = ($st | ConvertTo-Json -Depth 10 -Compress) }
        Write-Host "  FAILED — status=failed after ${elapsed}s" -ForegroundColor Red
        Write-Host "  Error: $errMsg" -ForegroundColor Red

        # server_error 说明可重试，给出明确提示
        if ($errMsg -match "server_error|server had an error") {
          Write-Host "  TIP: 这是 OpenAI/Azure 服务端错误，重试通常可恢复。" -ForegroundColor Yellow
        }
        return $st
      }

      Write-Host "  [$poll] status=$status, elapsed=${elapsed}s" -ForegroundColor Gray
    } catch {
      if ($SkipRetryOnServerError) {
        Write-Host "  [$poll] 轮询请求失败 (跳过): $_" -ForegroundColor Yellow
      } else {
        throw
      }
    }

    if (($elapsed + $IntervalSec) -ge $TimeoutSec) {
      Write-Host "  TIMEOUT — ${TimeoutSec}s 超时, 最后状态=$($st.status), runId=$RunId" -ForegroundColor Red
      return $st
    }

    Start-Sleep -Seconds $IntervalSec
  }
}
