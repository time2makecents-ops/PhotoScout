param(
  [ValidateSet("start", "stop", "restart", "status")]
  [string]$Command = "start",
  [int]$FrontendPort = 3003,
  [int]$BackendPort = 8010,
  [string]$LanHost = "auto",
  [switch]$EnableFieldSync,
  [switch]$NoBrowser,
  [switch]$ClearCache
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = $PSScriptRoot
$frontendDir = Join-Path $repoRoot "frontend"
$backendDir = Join-Path $repoRoot "backend"
$runtimeDir = Join-Path $repoRoot ".runtime"
$logDir = Join-Path $runtimeDir "logs"
$certificateDir = Join-Path $runtimeDir "certificates"
$backendPidFile = Join-Path $runtimeDir "backend.pid"
$frontendPidFile = Join-Path $runtimeDir "frontend.pid"
$certificatePath = Join-Path $certificateDir "photoscout-dev.pem"
$certificateKeyPath = Join-Path $certificateDir "photoscout-dev-key.pem"
$certificateHostsPath = Join-Path $certificateDir "hosts.txt"
$frontendUrl = "https://localhost:$FrontendPort"
$backendUrl = "http://127.0.0.1:$BackendPort"

function Get-ListenerProcessIds {
  param([int]$Port)

  return @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    Where-Object { $_ -gt 0 })
}

function Test-FieldSyncListener {
  $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $BackendPort -ErrorAction SilentlyContinue)
  return [bool]($listeners | Where-Object { $_.LocalAddress -in @("0.0.0.0", "::") })
}

function Get-ProcessCommandLine {
  param([int]$ProcessId)

  $process = Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction SilentlyContinue
  if ($process) {
    return [string]$process.CommandLine
  }
  return ""
}

function Test-ManagedProcess {
  param([int]$ProcessId)

  $commandLine = Get-ProcessCommandLine -ProcessId $ProcessId
  return [bool]($commandLine -and $commandLine.IndexOf($repoRoot, [System.StringComparison]::OrdinalIgnoreCase) -ge 0)
}

function Get-DescendantProcessIds {
  param([int[]]$RootProcessIds)

  $roots = @($RootProcessIds | Where-Object { $_ -gt 0 } | Select-Object -Unique)
  if (-not $roots.Count) {
    return @()
  }

  $allProcesses = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
  $seen = [System.Collections.Generic.HashSet[int]]::new()
  $queue = [System.Collections.Generic.Queue[int]]::new()
  $ordered = [System.Collections.Generic.List[int]]::new()
  foreach ($rootId in $roots) {
    if ($seen.Add($rootId)) {
      $queue.Enqueue($rootId)
    }
  }

  while ($queue.Count -gt 0) {
    $parentId = $queue.Dequeue()
    $ordered.Add($parentId)
    foreach ($childId in @($allProcesses | Where-Object { $_.ParentProcessId -eq $parentId } | Select-Object -ExpandProperty ProcessId)) {
      if ($seen.Add([int]$childId)) {
        $queue.Enqueue([int]$childId)
      }
    }
  }

  $result = @($ordered)
  [array]::Reverse($result)
  return $result
}

function Get-TrackedProcessId {
  param([string]$PidFile)

  if (-not (Test-Path -LiteralPath $PidFile)) {
    return 0
  }

  $rawValue = (Get-Content -LiteralPath $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
  $processId = 0
  if ($rawValue -and [int]::TryParse($rawValue.Trim(), [ref]$processId) -and (Get-Process -Id $processId -ErrorAction SilentlyContinue)) {
    return $processId
  }
  return 0
}

function Wait-ForPortRelease {
  param([int]$Port)

  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    if (-not (Get-ListenerProcessIds -Port $Port)) {
      return
    }
    Start-Sleep -Milliseconds 500
  }
  throw "Port $Port did not release."
}

function Stop-ManagedRole {
  param(
    [string]$Name,
    [int]$Port,
    [string]$PidFile
  )

  $rootIds = [System.Collections.Generic.HashSet[int]]::new()
  $trackedId = Get-TrackedProcessId -PidFile $PidFile
  if ($trackedId -gt 0 -and (Test-ManagedProcess -ProcessId $trackedId)) {
    $rootIds.Add($trackedId) | Out-Null
  }

  foreach ($listenerId in Get-ListenerProcessIds -Port $Port) {
    if (Test-ManagedProcess -ProcessId $listenerId) {
      $rootIds.Add($listenerId) | Out-Null
    }
  }

  if ($rootIds.Count -gt 0) {
    foreach ($processId in Get-DescendantProcessIds -RootProcessIds @($rootIds)) {
      Write-Host "Stopping PhotoScout $Name process $processId..."
      Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    }
    Wait-ForPortRelease -Port $Port
  }

  Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
}

function Assert-PortAvailable {
  param([int]$Port, [string]$Name)

  $listenerIds = Get-ListenerProcessIds -Port $Port
  if (-not $listenerIds) {
    return
  }

  $details = @($listenerIds | ForEach-Object {
    $commandLine = Get-ProcessCommandLine -ProcessId $_
    "PID ${_}: $commandLine"
  }) -join [Environment]::NewLine
  $newLine = [Environment]::NewLine
  throw "$Name cannot start because port $Port is already in use. Run '.\photoscout.ps1 status' or '.\photoscout.ps1 restart'.$newLine$details"
}

function Test-HttpReady {
  param([string]$Url)

  try {
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
  } catch {
    return $false
  }
}

function Wait-ForHttpReady {
  param(
    [string]$Url,
    [string]$Name,
    [int]$TimeoutSeconds
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-HttpReady -Url $Url) {
      return
    }
    Start-Sleep -Seconds 1
  }
  throw "$Name did not become ready at $Url within $TimeoutSeconds seconds."
}

function Get-BackendPython {
  $systemPythonCommand = Get-Command python.exe -ErrorAction SilentlyContinue
  $systemPython = if ($systemPythonCommand) { $systemPythonCommand.Source } else { "" }
  $candidates = @(
    (Join-Path $backendDir ".venv\Scripts\python.exe"),
    $systemPython
  ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -Unique

  foreach ($candidate in $candidates) {
    $previousErrorPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    & $candidate -c "import fastapi, sqlalchemy, uvicorn" 1>$null 2>$null
    $candidateExitCode = $LASTEXITCODE
    $ErrorActionPreference = $previousErrorPreference
    if ($candidateExitCode -eq 0) {
      return $candidate
    }
  }
  throw "No Python installation with fastapi, sqlalchemy, and uvicorn was found. Run the backend setup in README.md."
}

function Get-NodeExecutable {
  $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
  if (-not $nodeCommand) {
    throw "Could not find node.exe. Install Node.js and run npm.cmd install in the frontend directory."
  }
  return $nodeCommand.Source
}

function Get-EffectiveLanHost {
  if (-not $LanHost -or $LanHost.Equals("none", [System.StringComparison]::OrdinalIgnoreCase)) {
    return ""
  }
  if (-not $LanHost.Equals("auto", [System.StringComparison]::OrdinalIgnoreCase)) {
    $parsedAddress = $null
    if (-not [System.Net.IPAddress]::TryParse($LanHost, [ref]$parsedAddress) -or $parsedAddress.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork) {
      throw "LanHost must be 'auto', 'none', or a valid IPv4 address."
    }
    return $LanHost
  }

  $configurations = @(Get-NetIPConfiguration -ErrorAction SilentlyContinue |
    Where-Object { $_.IPv4DefaultGateway -and $_.IPv4Address } |
    Sort-Object InterfaceIndex)
  foreach ($configuration in $configurations) {
    foreach ($address in @($configuration.IPv4Address)) {
      if ($address.IPAddress -and $address.IPAddress -notmatch "^(127\.|169\.254\.)") {
        return $address.IPAddress
      }
    }
  }
  return ""
}

function Get-MkcertExecutable {
  $mkcertCommand = Get-Command mkcert.exe -ErrorAction SilentlyContinue
  if ($mkcertCommand) {
    return $mkcertCommand.Source
  }
  $fallback = "C:\ProgramData\chocolatey\bin\mkcert.exe"
  if (Test-Path -LiteralPath $fallback) {
    return $fallback
  }
  throw "Could not find mkcert.exe, which is required for PhotoScout HTTPS development."
}

function Ensure-DevelopmentCertificate {
  param([string]$DetectedLanHost)

  New-Item -ItemType Directory -Path $certificateDir -Force | Out-Null
  $hosts = @("localhost", "127.0.0.1", "::1")
  if ($DetectedLanHost) {
    $hosts += $DetectedLanHost
  }
  $expectedHosts = $hosts -join [Environment]::NewLine
  $existingHosts = if (Test-Path -LiteralPath $certificateHostsPath) {
    (Get-Content -LiteralPath $certificateHostsPath -Raw).Trim()
  } else {
    ""
  }

  if ((Test-Path -LiteralPath $certificatePath) -and
      (Test-Path -LiteralPath $certificateKeyPath) -and
      $existingHosts -eq $expectedHosts.Trim()) {
    return
  }

  $mkcert = Get-MkcertExecutable
  & $mkcert -cert-file $certificatePath -key-file $certificateKeyPath @hosts
  if ($LASTEXITCODE -ne 0) {
    throw "mkcert failed with exit code $LASTEXITCODE."
  }
  Set-Content -LiteralPath $certificateHostsPath -Value $expectedHosts -Encoding ASCII
}

function Show-Status {
  $backendListeners = Get-ListenerProcessIds -Port $BackendPort
  $frontendListeners = Get-ListenerProcessIds -Port $FrontendPort
  $backendReady = [bool]($backendListeners -and (Test-HttpReady -Url "$backendUrl/api/health"))
  $frontendReady = [bool]($frontendListeners -and (Test-HttpReady -Url "$frontendUrl/home"))
  $detectedLanHost = Get-EffectiveLanHost

  $backendState = if ($backendReady) { "ready" } elseif ($backendListeners) { "listening but unhealthy" } else { "stopped" }
  $frontendState = if ($frontendReady) { "ready" } elseif ($frontendListeners) { "listening but unhealthy" } else { "stopped" }
  Write-Host "Backend:  $backendState ($backendUrl)" -ForegroundColor $(if ($backendReady) { "Green" } else { "Yellow" })
  Write-Host "Frontend: $frontendState ($frontendUrl)" -ForegroundColor $(if ($frontendReady) { "Green" } else { "Yellow" })
  if ($detectedLanHost) {
    Write-Host "Phone:    https://${detectedLanHost}:$FrontendPort"
  }
  if ($EnableFieldSync -and $detectedLanHost) {
    $fieldState = if (Test-FieldSyncListener) { "ready" } else { "not exposed" }
    Write-Host "Field:    $fieldState (http://${detectedLanHost}:$BackendPort)" -ForegroundColor $(if ($fieldState -eq "ready") { "Green" } else { "Yellow" })
  }
  return $backendReady -and $frontendReady
}

function Stop-PhotoScout {
  Stop-ManagedRole -Name "frontend" -Port $FrontendPort -PidFile $frontendPidFile
  Stop-ManagedRole -Name "backend" -Port $BackendPort -PidFile $backendPidFile
  Write-Host "PhotoScout managed services are stopped."
}

function Start-PhotoScout {
  $backendHealthUrl = "$backendUrl/api/health"
  $frontendHealthUrl = "$frontendUrl/home"
  $backendListeners = Get-ListenerProcessIds -Port $BackendPort
  $frontendListeners = Get-ListenerProcessIds -Port $FrontendPort
  if ($backendListeners -and $frontendListeners -and
      (Test-HttpReady -Url $backendHealthUrl) -and
      (Test-HttpReady -Url $frontendHealthUrl)) {
    if ($EnableFieldSync -and -not (Test-FieldSyncListener)) {
      Write-Host "Restarting the managed services to enable phone field sync..."
      Stop-PhotoScout
      $backendListeners = @()
      $frontendListeners = @()
    } else {
      Write-Host "PhotoScout is already running."
      if (-not $NoBrowser) {
        Start-Process -FilePath $frontendUrl
      }
      Show-Status | Out-Null
      return
    }
  }

  Assert-PortAvailable -Port $BackendPort -Name "Backend"
  Assert-PortAvailable -Port $FrontendPort -Name "Frontend"

  $python = Get-BackendPython
  $node = Get-NodeExecutable
  $next = Join-Path $frontendDir "node_modules\next\dist\bin\next"
  if (-not (Test-Path -LiteralPath $next)) {
    throw "Next.js was not found at $next. Run npm.cmd install in the frontend directory."
  }

  $detectedLanHost = Get-EffectiveLanHost
  Ensure-DevelopmentCertificate -DetectedLanHost $detectedLanHost
  New-Item -ItemType Directory -Path $logDir -Force | Out-Null

  if ($ClearCache) {
    $cachePath = Join-Path $frontendDir ".next"
    if (Test-Path -LiteralPath $cachePath) {
      Write-Host "Clearing $cachePath..."
      Remove-Item -LiteralPath $cachePath -Recurse -Force
    }
  }

  $allowedOrigins = @($frontendUrl, "https://127.0.0.1:$FrontendPort")
  if ($detectedLanHost) {
    $allowedOrigins += "https://${detectedLanHost}:$FrontendPort"
  }

  $env:APP_ORIGIN = $frontendUrl
  $env:APP_ORIGINS = $allowedOrigins -join ","
  $backendHost = if ($EnableFieldSync) { "0.0.0.0" } else { "127.0.0.1" }
  if ($EnableFieldSync) {
    if (-not $detectedLanHost) {
      throw "Field sync needs a LAN IPv4 address. Connect to Wi-Fi or pass -LanHost with the phone-reachable address."
    }
    $env:FIELD_API_BASE_URL = "http://${detectedLanHost}:$BackendPort"
  } else {
    $env:FIELD_API_BASE_URL = $backendUrl
  }
  $backendArguments = @(
    "-m", "uvicorn", "app.main:app",
    "--app-dir", $backendDir,
    "--host", $backendHost,
    "--port", "$BackendPort"
  )

  try {
    Write-Host "Starting PhotoScout backend..."
    $backendProcess = Start-Process -FilePath $python -ArgumentList $backendArguments -WorkingDirectory $backendDir -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir "backend.out.log") -RedirectStandardError (Join-Path $logDir "backend.err.log") -PassThru
    Set-Content -LiteralPath $backendPidFile -Value $backendProcess.Id -Encoding ASCII
    Wait-ForHttpReady -Url $backendHealthUrl -Name "Backend" -TimeoutSeconds 45

    $env:NEXT_PUBLIC_API_BASE_URL = $backendUrl
    $env:NEXT_PUBLIC_API_BASE_PORT = "$BackendPort"
    $env:PHOTOSCOUT_LAN_HOST = $detectedLanHost
    $frontendArguments = @(
      $next,
      "dev",
      "--hostname", "0.0.0.0",
      "--port", "$FrontendPort",
      "--experimental-https",
      "--experimental-https-key", $certificateKeyPath,
      "--experimental-https-cert", $certificatePath
    )

    Write-Host "Starting PhotoScout frontend..."
    $frontendProcess = Start-Process -FilePath $node -ArgumentList $frontendArguments -WorkingDirectory $frontendDir -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir "frontend.out.log") -RedirectStandardError (Join-Path $logDir "frontend.err.log") -PassThru
    Set-Content -LiteralPath $frontendPidFile -Value $frontendProcess.Id -Encoding ASCII
    Wait-ForHttpReady -Url $frontendHealthUrl -Name "Frontend" -TimeoutSeconds 90
  } catch {
    Stop-PhotoScout
    throw "PhotoScout failed to start: $($_.Exception.Message) Logs: $logDir"
  }

  Write-Host "PhotoScout is ready."
  Show-Status | Out-Null
  if (-not $NoBrowser) {
    Start-Process -FilePath $frontendUrl
  }
}

switch ($Command) {
  "start" {
    Start-PhotoScout
  }
  "stop" {
    Stop-PhotoScout
  }
  "restart" {
    Stop-PhotoScout
    Start-PhotoScout
  }
  "status" {
    if (-not (Show-Status)) {
      exit 1
    }
  }
}
