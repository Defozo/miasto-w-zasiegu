$ErrorActionPreference = 'Stop'
# Do not propagate the batch import's below-normal CPU priority to the web API.
[System.Diagnostics.Process]::GetCurrentProcess().PriorityClass = [System.Diagnostics.ProcessPriorityClass]::Normal
$projectRoot = Split-Path $PSScriptRoot -Parent
$entry = Join-Path $projectRoot 'scripts/start-public-with-psst.ps1'
$launcherFile = Join-Path $projectRoot 'artifacts/runtime/public-launcher.pid'
$existing = @(Get-NetTCPConnection -LocalPort 4180 -State Listen -ErrorAction SilentlyContinue | Where-Object LocalAddress -eq '0.0.0.0')
if ($existing) {
    $owner = Get-CimInstance Win32_Process -Filter "ProcessId=$($existing[0].OwningProcess)"
    if ($owner.CommandLine -notlike '*server/public-server.mjs*') { throw 'Port 4180 belongs to another application.' }
    Stop-Process -Id $owner.ProcessId -ErrorAction Stop
    Wait-Process -Id $owner.ProcessId -Timeout 15 -ErrorAction SilentlyContinue
}
# The launcher normally exits with its child; stop only the recorded, verified wrapper.
if (Test-Path -LiteralPath $launcherFile) {
    $launcherId = 0
    if ([int]::TryParse((Get-Content -LiteralPath $launcherFile -Raw).Trim(), [ref]$launcherId)) {
        $launcher = Get-CimInstance Win32_Process -Filter "ProcessId=$launcherId"
        if ($launcher -and $launcher.CommandLine -like "*$entry*") {
            Stop-Process -Id $launcherId -ErrorAction Stop
            Wait-Process -Id $launcherId -Timeout 15 -ErrorAction SilentlyContinue
        }
    }
}
& (Join-Path $projectRoot 'Start-Public.ps1')
