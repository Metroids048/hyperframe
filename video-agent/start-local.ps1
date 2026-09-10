$ErrorActionPreference = 'Stop'
$taskRoot = $PSScriptRoot
Set-Location -LiteralPath $taskRoot
New-Item -ItemType Directory -Force -Path (Join-Path $taskRoot 'outputs') | Out-Null
try {
  $taskHealth = Invoke-RestMethod 'http://127.0.0.1:3020/api/health' -TimeoutSec 2
  $taskEditor = Invoke-RestMethod 'http://127.0.0.1:3020/api/edit-capabilities' -TimeoutSec 2
  if ($taskHealth.ok -and $taskEditor.engine) {
    Write-Host 'Ready: http://127.0.0.1:3020'
    exit 0
  }
} catch {}
& node (Join-Path $taskRoot 'scripts/build-web.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Web build failed.' }
$taskServer = Join-Path $taskRoot 'server.mjs'
$taskNode = (Get-Command node.exe).Source
$taskProcess = Start-Process -FilePath $taskNode -ArgumentList ('"' + $taskServer + '"') -WorkingDirectory $taskRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskRoot 'outputs/server.log') -RedirectStandardError (Join-Path $taskRoot 'outputs/server-error.log') -PassThru
$taskProcess.Id | Set-Content -LiteralPath (Join-Path $taskRoot 'outputs/server.pid')
for ($taskAttempt = 0; $taskAttempt -lt 20; $taskAttempt++) {
  Start-Sleep -Milliseconds 250
  $taskProcess.Refresh()
  if ($taskProcess.HasExited) { throw 'Server process exited. Port 3020 may already be occupied. See outputs/server-error.log.' }
  try {
    $taskHealth = Invoke-RestMethod 'http://127.0.0.1:3020/api/health' -TimeoutSec 1
    $taskEditor = Invoke-RestMethod 'http://127.0.0.1:3020/api/edit-capabilities' -TimeoutSec 1
    if ($taskHealth.ok -and $taskEditor.engine) { Write-Host 'Ready: http://127.0.0.1:3020'; exit 0 }
  } catch {}
}
throw 'Server startup failed. See outputs/server-error.log.'
