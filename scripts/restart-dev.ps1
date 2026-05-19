param(
  [int]$FrontendPort = 3003,
  [int]$BackendPort = 8010,
  [string]$LanHost = "172.16.0.44"
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$frontendDir = Join-Path $repoRoot "frontend"
$backendDir = Join-Path $repoRoot "backend"
$httpsCertDir = Join-Path $frontendDir "certificates"
$httpsCert = Join-Path $httpsCertDir "photoscout-lan.pem"
$httpsKey = Join-Path $httpsCertDir "photoscout-lan-key.pem"
$httpsHosts = @("localhost", "127.0.0.1", "::1", $LanHost)
$frontendLocalUrl = "https://localhost:$FrontendPort"
$frontendLanUrl = "https://${LanHost}:$FrontendPort"
$backendLocalUrl = "http://127.0.0.1:$BackendPort"
$allowedOrigins = "$frontendLocalUrl,https://127.0.0.1:$FrontendPort,$frontendLanUrl"

function Quote-PowerShell {
  param([string]$Value)

  return "'" + ($Value -replace "'", "''") + "'"
}

function Get-BackendPython {
  $candidate = Join-Path $backendDir ".venv\Scripts\python.exe"
  if (Test-Path $candidate) {
    try {
      & $candidate -c "import sqlalchemy, fastapi, uvicorn" 1>$null 2>$null
      if ($LASTEXITCODE -eq 0) {
        return $candidate
      }
    } catch {
    }
  }

  $systemPython = Get-Command python.exe -ErrorAction SilentlyContinue
  if ($systemPython) {
    & $systemPython.Source -c "import sqlalchemy, fastapi, uvicorn" 1>$null 2>$null
    if ($LASTEXITCODE -eq 0) {
      return $systemPython.Source
    }
  }

  throw "No Python with fastapi, sqlalchemy, and uvicorn was found. Install backend requirements first."
}

function Get-MkcertExe {
  $mkcert = Get-Command mkcert.exe -ErrorAction SilentlyContinue
  if ($mkcert) {
    return $mkcert.Source
  }

  $fallback = "C:\ProgramData\chocolatey\bin\mkcert.exe"
  if (Test-Path $fallback) {
    return $fallback
  }

  throw "Could not find mkcert.exe. Install mkcert or place certificates at $httpsCertDir."
}

function Get-PortProcessIds {
  param([int]$Port)

  $ids = @()
  $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if ($connections) {
    $ids += $connections | Select-Object -ExpandProperty OwningProcess
  }

  $netstatMatches = netstat -ano | Select-String ":$Port "
  foreach ($match in $netstatMatches) {
    if ($match.Line -match "LISTENING\s+(\d+)$") {
      $ids += [int]$Matches[1]
    }
  }

  return $ids | Where-Object { $_ -gt 0 } | Select-Object -Unique
}

function Stop-PortProcess {
  param([int]$Port)

  $processIds = Get-PortProcessIds -Port $Port
  foreach ($processId in @($processIds)) {
    try {
      taskkill.exe /PID $processId /T /F 1>$null 2>$null
    } catch {
    }

    try {
      Stop-Process -Id $processId -Force -ErrorAction Stop
    } catch {
    }
  }
}

function Test-PortListening {
  param([int]$Port)

  return [bool](Get-PortProcessIds -Port $Port)
}

function Wait-PortClear {
  param([int]$Port)

  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    if (-not (Test-PortListening -Port $Port)) {
      return
    }
    Start-Sleep -Seconds 1
  }

  throw "Port $Port did not clear."
}

function Clear-NextCache {
  $nextCache = Join-Path $frontendDir ".next"
  if (-not (Test-Path $nextCache)) {
    return
  }

  for ($attempt = 0; $attempt -lt 10; $attempt++) {
    try {
      Remove-Item -LiteralPath $nextCache -Recurse -Force -ErrorAction Stop
      return
    } catch {
      Start-Sleep -Seconds 1
    }
  }

  throw "Could not remove $nextCache. Close any old PhotoScout frontend windows and run this script again."
}

function Wait-HttpOk {
  param(
    [string]$Url,
    [string]$Name
  )

  for ($attempt = 0; $attempt -lt 45; $attempt++) {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
        return
      }
    } catch {
    }

    Start-Sleep -Seconds 1
  }

  throw "$Name did not become ready at $Url. Check the $Name PowerShell window for the error."
}

function Wait-FrontendOk {
  param(
    [string]$Url,
    [string]$NodeExe
  )

  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    $checkScript = "process.env.NODE_TLS_REJECT_UNAUTHORIZED='0'; fetch('$Url/home').then(r=>process.exit(r.status < 500 ? 0 : 1)).catch(()=>process.exit(1))"
    try {
      & $NodeExe --no-warnings -e $checkScript 1>$null 2>$null
      $exitCode = $LASTEXITCODE
    } catch {
      $exitCode = 1
    }

    if ($exitCode -eq 0) {
      return
    }

    Start-Sleep -Seconds 1
  }

  throw "Frontend did not become ready at $Url. Check the PhotoScout Frontend PowerShell window for the error."
}

function Start-DevWindow {
  param(
    [string]$Title,
    [string]$WorkingDirectory,
    [string]$Command
  )

  $windowCommand = "`$Host.UI.RawUI.WindowTitle = $(Quote-PowerShell $Title); Set-Location -LiteralPath $(Quote-PowerShell $WorkingDirectory); $Command"
  Start-Process `
    -WindowStyle Normal `
    -FilePath "powershell.exe" `
    -ArgumentList @("-NoExit", "-ExecutionPolicy", "Bypass", "-Command", $windowCommand)
}

$pythonExe = Get-BackendPython
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $nodeCommand) {
  throw "Could not find node.exe. Install Node.js first."
}
$nodeExe = $nodeCommand.Source
$nextBin = Join-Path $frontendDir "node_modules\next\dist\bin\next"
if (-not (Test-Path $nextBin)) {
  throw "Could not find Next.js at $nextBin. Run npm.cmd install from $frontendDir first."
}

Write-Host "Stopping PhotoScout frontend on port $FrontendPort..."
Stop-PortProcess -Port $FrontendPort
Wait-PortClear -Port $FrontendPort

Write-Host "Clearing stale Next.js cache..."
Clear-NextCache

Write-Host "Stopping PhotoScout backend on port $BackendPort..."
Stop-PortProcess -Port $BackendPort
Wait-PortClear -Port $BackendPort

if (-not (Test-Path $httpsCertDir)) {
  New-Item -ItemType Directory -Force -Path $httpsCertDir | Out-Null
}

if (-not (Test-Path $httpsCert) -or -not (Test-Path $httpsKey)) {
  $mkcertExe = Get-MkcertExe
  & $mkcertExe -cert-file $httpsCert -key-file $httpsKey @httpsHosts
}

$backendCommand = "`$env:APP_ORIGIN = $(Quote-PowerShell $frontendLocalUrl); " +
  "`$env:APP_ORIGINS = $(Quote-PowerShell $allowedOrigins); " +
  "& $(Quote-PowerShell $pythonExe) -m uvicorn app.main:app --host 127.0.0.1 --port $BackendPort"

$frontendCommand = "`$env:NEXT_PUBLIC_API_BASE_URL = $(Quote-PowerShell $backendLocalUrl); " +
  "`$env:NEXT_PUBLIC_API_BASE_PORT = $(Quote-PowerShell "$BackendPort"); " +
  "& $(Quote-PowerShell $nodeExe) $(Quote-PowerShell $nextBin) dev --hostname 0.0.0.0 --port $FrontendPort --experimental-https --experimental-https-key $(Quote-PowerShell $httpsKey) --experimental-https-cert $(Quote-PowerShell $httpsCert)"

Write-Host "Starting PhotoScout backend on $backendLocalUrl..."
Start-DevWindow -Title "PhotoScout Backend :$BackendPort" -WorkingDirectory $backendDir -Command $backendCommand
Wait-HttpOk -Url "$backendLocalUrl/api/health" -Name "Backend"

Write-Host "Starting PhotoScout frontend on $frontendLocalUrl..."
Start-DevWindow -Title "PhotoScout Frontend :$FrontendPort" -WorkingDirectory $frontendDir -Command $frontendCommand
Wait-FrontendOk -Url $frontendLocalUrl -NodeExe $nodeExe

Write-Host ""
Write-Host "PhotoScout is ready."
Write-Host "Backend:  $backendLocalUrl"
Write-Host "Computer: $frontendLocalUrl"
Write-Host "Phone:    $frontendLanUrl"
