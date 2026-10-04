$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $projectRoot
$ztp = Get-Content artifacts/runtime/imports/ztp.json -Raw | ConvertFrom-Json
$osm = Get-Content artifacts/runtime/imports/osm.json -Raw | ConvertFrom-Json
if ($ztp.status -ne 'success' -or $osm.status -ne 'success') { throw 'An import has not completed successfully.' }
$tasks = @(Get-ScheduledTask -TaskName 'MiastoWZasiegu-Import-*' | ForEach-Object {
    $info = $_ | Get-ScheduledTaskInfo
    if ($_.State -eq 'Disabled' -or $info.LastTaskResult -ne 0) { throw "Unhealthy task: $($_.TaskName), result $($info.LastTaskResult)" }
    [pscustomobject]@{
        name = $_.TaskName; state = $_.State.ToString(); lastResult = $info.LastTaskResult
        lastRun = $info.LastRunTime.ToString('o'); nextRun = $info.NextRunTime.ToString('o')
        startsWhenAvailable = $_.Settings.StartWhenAvailable; restartCount = $_.Settings.RestartCount
        restartInterval = $_.Settings.RestartInterval; logonType = $_.Principal.LogonType.ToString()
        triggers = @($_.Triggers | ForEach-Object { [pscustomobject]@{type=$_.CimClass.CimClassName; start=$_.StartBoundary; enabled=$_.Enabled; daysOfWeek=$_.DaysOfWeek; daysInterval=$_.DaysInterval; weeksInterval=$_.WeeksInterval} })
    }
})
if ($tasks.Count -ne 2) { throw 'Expected two import tasks.' }
$health = Invoke-RestMethod https://miastowzasiegu.pl/api/health -TimeoutSec 30
if ($health.database -ne 'ready' -or $health.osmGeneration -ne $osm.result.generation) { throw 'Public API has not loaded the OSM generation.' }
$places = Invoke-RestMethod 'https://miastowzasiegu.pl/api/places?category=transport&q=Teatr%20S%C5%82owackiego&limit=10' -TimeoutSec 30
if ($places.municipalData.status -ne 'success' -or $places.municipalData.lastSuccessAt -ne $ztp.result.stops.lastSuccessAt) { throw 'Public ZTP metadata is not current.' }
$locations = Invoke-RestMethod 'https://miastowzasiegu.pl/api/locations?q=D%C5%82uga%2012' -TimeoutSec 30
if ($locations.locations.Count -lt 1) { throw 'Address search is empty.' }
$report = [ordered]@{
    checkedAt = (Get-Date).ToUniversalTime().ToString('o'); verified=$true; timezone='Europe/Warsaw'
    tasks=$tasks; health=$health; ztp=$ztp.result; osm=$osm.result
    ztpPublicLastSuccessAt=$places.municipalData.lastSuccessAt; addressMatches=$locations.locations.Count
}
$report | ConvertTo-Json -Depth 12 | Set-Content artifacts/import-schedule/verification.json -Encoding utf8
$report | ConvertTo-Json -Depth 12
