$ErrorActionPreference = 'Stop'
$runtime = Join-Path $PSScriptRoot 'artifacts/runtime'
New-Item -ItemType Directory -Path $runtime -Force | Out-Null
$entry = Join-Path $PSScriptRoot 'scripts/start-public-with-psst.ps1'
$launcherFile = Join-Path $runtime 'public-launcher.pid'
if (Test-Path -LiteralPath $launcherFile) {
    $launcherId = 0
    if ([int]::TryParse((Get-Content -LiteralPath $launcherFile -Raw).Trim(), [ref]$launcherId)) {
        $launcher = Get-CimInstance Win32_Process -Filter "ProcessId=$launcherId"
        if ($launcher -and $launcher.CommandLine -like "*$entry*") {
            Write-Host 'Public server launcher is active; waiting for its startup if needed.'
            return
        }
    }
}
# A separate film preview may bind only 127.0.0.1:4180. The public service owns
# the wildcard listener; do not mistake the preview for the public process.
$existing = @(Get-NetTCPConnection -LocalPort 4180 -State Listen -ErrorAction SilentlyContinue | Where-Object LocalAddress -eq '0.0.0.0')
if ($existing) {
    $owner = Get-CimInstance Win32_Process -Filter "ProcessId=$($existing[0].OwningProcess)"
    if ($owner.CommandLine -notlike '*server/public-server.mjs*') { throw 'Port 4180 is occupied by another application.' }
    Write-Host 'Public server is already running.'
    return
}
$process = Start-Process -FilePath powershell.exe -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $entry + '"')) -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtime 'public.log') -RedirectStandardError (Join-Path $runtime 'public-error.log')
$process.Id | Set-Content -LiteralPath (Join-Path $runtime 'public-launcher.pid')
Write-Host "Started public server launcher, PID $($process.Id)."
