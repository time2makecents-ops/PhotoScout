param(
  [int]$FrontendPort = 3003,
  [int]$BackendPort = 8010,
  [string]$LanHost = "auto",
  [switch]$NoBrowser,
  [switch]$ClearCache
)

$launcher = Join-Path (Resolve-Path (Join-Path $PSScriptRoot "..")) "photoscout.ps1"
& $launcher restart `
  -FrontendPort $FrontendPort `
  -BackendPort $BackendPort `
  -LanHost $LanHost `
  -NoBrowser:$NoBrowser `
  -ClearCache:$ClearCache
exit $LASTEXITCODE
