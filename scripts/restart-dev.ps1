param(
  [int]$FrontendPort = 3003,
  [int]$BackendPort = 8001
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$frontendDir = Join-Path $repoRoot "frontend"
$backendDir = Join-Path $repoRoot "backend"

function Get-BackendPython {
  $candidate = Join-Path $backendDir ".venv\Scripts\python.exe"
  if (Test-Path $candidate) {
    try {
      & $candidate -c "import sqlalchemy, fastapi" 1>$null 2>$null
      if ($LASTEXITCODE -eq 0) {
        return $candidate
      }
    } catch {
    }
  }
  $systemPython = (Get-Command python.exe -ErrorAction SilentlyContinue)
  if ($systemPython) {
    return $systemPython.Source
  }
  throw "Could not find a usable Python executable."
}

$pythonExe = Get-BackendPython

function Stop-PortProcess {
  param([int]$Port)

  $pids = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique

  if ($pids) {
    foreach ($processId in @($pids)) {
      try {
        Stop-Process -Id $processId -Force -ErrorAction Stop
      } catch [System.InvalidOperationException], [System.ComponentModel.Win32Exception] {
        continue
      } catch {
        continue
      }
    }
  }
}

function Wait-PortClear {
  param([int]$Port)

  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if (-not $listener) {
      return
    }
    Start-Sleep -Seconds 1
  }

  throw "Port $Port did not clear."
}

Stop-PortProcess -Port $FrontendPort
Stop-PortProcess -Port $BackendPort
Wait-PortClear -Port $FrontendPort
Wait-PortClear -Port $BackendPort

Start-Process `
  -WindowStyle Normal `
  -WorkingDirectory $backendDir `
  -FilePath $pythonExe `
  -ArgumentList @("-m", "uvicorn", "app.main:app", "--port", "$BackendPort")

Start-Process `
  -WindowStyle Normal `
  -WorkingDirectory $frontendDir `
  -FilePath "npm.cmd" `
  -ArgumentList @("run", "dev", "--", "--hostname", "0.0.0.0", "--port", "$FrontendPort", "--experimental-https")

Write-Host "Backend:  http://127.0.0.1:$BackendPort"
Write-Host "Frontend: https://172.16.0.44:$FrontendPort"
