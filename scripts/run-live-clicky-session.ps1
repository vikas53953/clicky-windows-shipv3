param(
  [switch]$ForceConfigure
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$logDir = Join-Path $repoRoot "docs\logs"
$workerOutLog = Join-Path $logDir "live-worker.out.log"
$workerErrLog = Join-Path $logDir "live-worker.err.log"
$devVarsPath = Join-Path $repoRoot "worker\.dev.vars"
$exePath = Join-Path $repoRoot "apps\clicky-windows\src-tauri\target\release\clicky-windows.exe"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Test-LiveProviderSecrets {
  if (-not (Test-Path -LiteralPath $devVarsPath)) {
    return $false
  }

  $content = Get-Content -LiteralPath $devVarsPath -Raw
  return ($content -match "(?m)^MOCK_MODE=false\s*$") `
    -and ($content -match "(?m)^LLM_PROVIDER=opencode\s*$") `
    -and ($content -match "(?m)^OPENCODE_API_KEY=.+$") `
    -and ($content -match "(?m)^ELEVENLABS_API_KEY=.+$")
}

Write-Host ""
Write-Host "Clicky live setup" -ForegroundColor Cyan

if ($ForceConfigure -or -not (Test-LiveProviderSecrets)) {
  Write-Host "Keys will be typed into this local PowerShell window only. They are not echoed."
  Write-Host ""

  & (Join-Path $PSScriptRoot "configure-live-providers.ps1")

  if (-not (Test-LiveProviderSecrets)) {
    throw "worker\.dev.vars was not created with live OpenCode and ElevenLabs settings."
  }
} else {
  Write-Host "Found local Worker secrets in worker\.dev.vars; reusing them without printing values." -ForegroundColor Green
  Write-Host "To replace them, run: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\run-live-clicky-session.ps1 -ForceConfigure"
}

Write-Host ""
Write-Host "Starting local Worker on http://127.0.0.1:8789 ..." -ForegroundColor Cyan

$worker = $null
$health = $null
$listeners = Get-NetTCPConnection -LocalPort 8789 -State Listen -ErrorAction SilentlyContinue

foreach ($listener in $listeners) {
  $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
  if ($process.CommandLine -like "*@cloudflare*workerd*") {
    Write-Host "Stopping existing Clicky Worker PID $($listener.OwningProcess) so current code and secrets reload." -ForegroundColor Yellow
    Stop-Process -Id $listener.OwningProcess -Force
    Start-Sleep -Seconds 1
  } else {
    throw "Port 8789 is already used by PID $($listener.OwningProcess), not the Clicky Worker. Stop that process or change the Worker port."
  }
}

try {
  $health = Invoke-RestMethod -Uri "http://127.0.0.1:8789/health" -Method Get -TimeoutSec 2
} catch {
  $health = $null
}

if (-not $health) {
  $worker = Start-Process -FilePath "npm.cmd" `
    -ArgumentList @("run", "worker:dev") `
    -WorkingDirectory $repoRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $workerOutLog `
    -RedirectStandardError $workerErrLog `
    -PassThru
} else {
  throw "Port 8789 is still responding after restart cleanup. Stop the existing listener and retry."
}

try {
  if (-not $health) {
    $deadline = (Get-Date).AddSeconds(40)
    do {
      try {
        $health = Invoke-RestMethod -Uri "http://127.0.0.1:8789/health" -Method Get -TimeoutSec 2
        if ($health.mode -eq "live") {
          break
        }
      } catch {
        Start-Sleep -Seconds 1
      }
    } while ((Get-Date) -lt $deadline)
  }

  if (-not $health -or $health.mode -ne "live") {
    throw "Worker did not enter live mode. See $workerOutLog and $workerErrLog"
  }

  Write-Host "Worker live mode confirmed." -ForegroundColor Green
  Write-Host "Running Kimi + ElevenLabs live smoke..." -ForegroundColor Cyan
  $providerSmokePassed = $true
  try {
    npm run smoke:live-providers
  } catch {
    $providerSmokePassed = $false
    Write-Host "Provider smoke did not fully pass. Clicky will still launch so you can test the shell, Kimi route, and current provider error handling." -ForegroundColor Yellow
    Write-Host "Most recent smoke error: $($_.Exception.Message)" -ForegroundColor Yellow
  }

  if (-not (Test-Path -LiteralPath $exePath)) {
    Write-Host "Native executable missing, building it now..." -ForegroundColor Yellow
    npm run tauri:build
  }

  Get-Process clicky-windows -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -eq $exePath } |
    Stop-Process -Force

  Write-Host "Launching Clicky..." -ForegroundColor Cyan
  $previousShowMain = $env:CLICKY_SHOW_MAIN_ON_LAUNCH
  $previousLiveSession = $env:CLICKY_LIVE_SESSION
  $env:CLICKY_SHOW_MAIN_ON_LAUNCH = "1"
  $env:CLICKY_LIVE_SESSION = "1"
  try {
    Start-Process -FilePath $exePath
  } finally {
    if ($null -eq $previousShowMain) {
      Remove-Item Env:CLICKY_SHOW_MAIN_ON_LAUNCH -ErrorAction SilentlyContinue
    } else {
      $env:CLICKY_SHOW_MAIN_ON_LAUNCH = $previousShowMain
    }
    if ($null -eq $previousLiveSession) {
      Remove-Item Env:CLICKY_LIVE_SESSION -ErrorAction SilentlyContinue
    } else {
      $env:CLICKY_LIVE_SESSION = $previousLiveSession
    }
  }

  Write-Host ""
  if ($providerSmokePassed) {
    Write-Host "Live provider smoke passed and Clicky is launched." -ForegroundColor Green
  } else {
    Write-Host "Clicky is launched, but the provider preflight had a live-service warning." -ForegroundColor Yellow
  }
  Write-Host "The main window should open automatically. Clicky auto-detects the live Worker and turns Mock mode off."
  Write-Host "Use Talk or Ctrl+Alt+Space once to start listening, then press again to send."
  Write-Host "Approve the mic prompt when Windows asks. Screen capture is native and should not show a browser share picker."
  if ($worker) {
    Write-Host "Keep this window open while testing; Worker PID: $($worker.Id)"
  } else {
    Write-Host "Keep the existing Worker window open while testing."
  }
} catch {
  Write-Host ""
  Write-Host "Live setup failed: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Worker stdout log: $workerOutLog"
  Write-Host "Worker stderr log: $workerErrLog"
  throw
}
