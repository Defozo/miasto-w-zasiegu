$ErrorActionPreference='Stop'
$taskRoot=$PSScriptRoot
$nodePath=(Get-Command node -ErrorAction Stop).Source
$runtimePath=Join-Path $taskRoot 'artifacts/runtime'
New-Item -ItemType Directory -Force -Path $runtimePath | Out-Null
if (-not (Test-Path -LiteralPath (Join-Path $taskRoot 'dist/index.html'))) { throw 'Najpierw uruchom npm ci oraz npm run build.' }
function Test-PrzejscieEndpoint([string]$url) {
  try { $response=Invoke-WebRequest -Uri $url -TimeoutSec 3; return $response.StatusCode -eq 200 } catch { return $false }
}
if (-not (Test-PrzejscieEndpoint 'http://127.0.0.1:18082/ors/v2/health')) {
  & docker compose -f (Join-Path $taskRoot 'experiments/ors/compose.yml') up -d
  if ($LASTEXITCODE -ne 0) { throw 'Nie udało się uruchomić ORS. Sprawdź Docker Desktop.' }
}
if (-not (Test-PrzejscieEndpoint 'http://127.0.0.1:18083/ors/v2/health')) {
  & docker compose -f (Join-Path $taskRoot 'experiments/ors/compose-drive.yml') up -d
  if ($LASTEXITCODE -ne 0) { throw 'Nie udało się uruchomić silnika samochodowego ORS.' }
}
if (-not (Test-PrzejscieEndpoint 'http://127.0.0.1:3081/api/health')) {
  $apiExecutable=$nodePath
  $apiArguments=@('server/index.mjs')
  if (Get-Command psst -ErrorAction SilentlyContinue) {
    $apiExecutable=(Get-Command powershell.exe -ErrorAction Stop).Source
    $apiScript=Join-Path $taskRoot 'scripts/start-api-with-psst.ps1'
    $apiArguments=@('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+$apiScript+'"'))
  } else {
    Write-Host 'Nie znaleziono psst. Wyszukiwanie nowych modeli wymaga OPENAI_API_KEY w środowisku API.'
  }
  $apiProcess=Start-Process -FilePath $apiExecutable -ArgumentList $apiArguments -WorkingDirectory $taskRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimePath 'api.log') -RedirectStandardError (Join-Path $runtimePath 'api-error.log')
  Write-Host "Uruchomiono API, PID $($apiProcess.Id)."
}
if (-not (Test-PrzejscieEndpoint 'http://127.0.0.1:4173/')) {
  $webProcess=Start-Process -FilePath $nodePath -ArgumentList 'node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4173','--strictPort' -WorkingDirectory $taskRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimePath 'web.log') -RedirectStandardError (Join-Path $runtimePath 'web-error.log')
  Write-Host "Uruchomiono stronę, PID $($webProcess.Id)."
}
Write-Host 'Strona: http://127.0.0.1:4173/ | Aplikacja: http://127.0.0.1:4173/app | Gra: http://127.0.0.1:4173/gra'
Write-Host 'Usługi działają lokalnie. Gotowość routingu: http://127.0.0.1:3081/api/health'
