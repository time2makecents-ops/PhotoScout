$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function Get-BackendPython {
  $candidate = Join-Path $repoRoot "backend\.venv\Scripts\python.exe"
  if (Test-Path $candidate) {
    try {
      & $candidate -c "import sqlalchemy, fastapi" 1>$null 2>$null
      if ($LASTEXITCODE -eq 0) {
        return $candidate
      }
    } catch {
    }
  }
  return "python"
}

$pythonExe = Get-BackendPython

Push-Location $repoRoot
try {
  & $pythonExe -m unittest backend.tests.test_api
} finally {
  Pop-Location
}
