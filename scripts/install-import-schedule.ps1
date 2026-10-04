param([switch]$RunSoon)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$python = Join-Path $projectRoot 'experiments/ors/.venv/Scripts/python.exe'
$runner = Join-Path $projectRoot 'scripts/run-data-imports.py'
if (-not (Test-Path -LiteralPath $python)) { throw 'OSM Python environment is missing.' }
if ((Get-TimeZone).Id -ne 'Central European Standard Time') { throw 'This schedule requires the Europe/Warsaw Windows time zone.' }
$principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 3) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 30) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$jobs = @(
    @{ Name = 'MiastoWZasiegu-Import-ZTP'; Job = 'ztp'; Trigger = (New-ScheduledTaskTrigger -Daily -At '04:10') },
    @{ Name = 'MiastoWZasiegu-Import-OSM'; Job = 'osm'; Trigger = (New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At '04:40') }
)
foreach ($job in $jobs) {
    $action = New-ScheduledTaskAction -Execute $python -Argument ('"' + $runner + '" ' + $job.Job) -WorkingDirectory $projectRoot
    $triggers = @($job.Trigger)
    if ($RunSoon) { $triggers += New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) }
    Register-ScheduledTask -TaskName $job.Name -Action $action -Trigger $triggers -Settings $settings -Principal $principal -Description ('Miasto w zasięgu: automatic ' + $job.Job + ' import, Europe/Warsaw; last good data retained on failure.') -Force | Out-Null
}
Get-ScheduledTask -TaskName 'MiastoWZasiegu-Import-*' | ForEach-Object {
    $info = $_ | Get-ScheduledTaskInfo
    [pscustomobject]@{ TaskName = $_.TaskName; State = $_.State.ToString(); NextRunTime = $info.NextRunTime.ToString('o'); LastTaskResult = $info.LastTaskResult }
} | ConvertTo-Json
