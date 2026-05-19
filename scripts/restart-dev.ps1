param(
  [int]$FrontendPort = 3003,
  [int]$BackendPort = 8000
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$frontendDir = Join-Path $repoRoot "frontend"
$backendDir = Join-Path $repoRoot "backend"
$httpsCertDir = Join-Path $frontendDir "certificates"
$httpsCert = Join-Path $httpsCertDir "photoscout-lan.pem"
$httpsKey = Join-Path $httpsCertDir "photoscout-lan-key.pem"
$httpsHosts = @("localhost", "127.0.0.1", "::1", "172.16.0.44")

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
$nodeExe = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $nodeExe) {
  throw "Could not find node.exe."
}

function Get-MkcertExe {
  $mkcert = (Get-Command mkcert.exe -ErrorAction SilentlyContinue)
  if ($mkcert) {
    return $mkcert.Source
  }
  $fallback = "C:\ProgramData\chocolatey\bin\mkcert.exe"
  if (Test-Path $fallback) {
    return $fallback
  }
  throw "Could not find mkcert.exe."
}

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

function Test-PortListening {
  param([int]$Port)

  return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
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
Wait-PortClear -Port $FrontendPort

$backendAlreadyRunning = Test-PortListening -Port $BackendPort
if (-not $backendAlreadyRunning) {
  Stop-PortProcess -Port $BackendPort
  Wait-PortClear -Port $BackendPort
}

if (-not $backendAlreadyRunning) {
  Start-Process `
    -WindowStyle Normal `
    -WorkingDirectory $backendDir `
    -FilePath $pythonExe `
    -ArgumentList @("-m", "uvicorn", "app.main:app", "--port", "$BackendPort")
} else {
  Write-Host "Backend already listening on http://127.0.0.1:$BackendPort"
}

if (-not (Test-Path $httpsCert) -or -not (Test-Path $httpsKey)) {
  $mkcertExe = Get-MkcertExe
  & $mkcertExe -cert-file $httpsCert -key-file $httpsKey @httpsHosts
}

Start-Process `
  -WindowStyle Normal `
  -WorkingDirectory $frontendDir `
  -FilePath $nodeExe `
  -ArgumentList @(
    "node_modules/next/dist/bin/next",
    "dev",
    "--hostname",
    "0.0.0.0",
    "--port",
    "$FrontendPort",
    "--experimental-https",
    "--experimental-https-key",
    $httpsKey,
    "--experimental-https-cert",
    $httpsCert
  )

Write-Host "Backend:  http://127.0.0.1:$BackendPort"
Write-Host "Frontend: https://172.16.0.44:$FrontendPort"
