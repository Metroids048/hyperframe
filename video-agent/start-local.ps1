$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
# Use the same launcher, dependency setup, payload restore and workspace identity.
$candidates = @('python', 'python3', (Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'))
foreach ($candidate in $candidates) {
  if (-not (Get-Command $candidate -ErrorAction SilentlyContinue)) { continue }
  try {
    & $candidate -c "import sys; assert sys.version_info >= (3, 10)" 2>$null
    if ($LASTEXITCODE -ne 0) { continue }
  } catch { continue }
  & $candidate (Join-Path $PSScriptRoot 'start.py') all
  exit $LASTEXITCODE
}
throw 'Python 3.10+ is required by start.py. Install Python and run python start.py all.'
