$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $projectRoot
& (Join-Path $projectRoot 'Start-Public.ps1')
& psst --global MIASTOWZASIEGU_DYNHOST_USERNAME MIASTOWZASIEGU_DYNHOST_PASSWORD -- python scripts/update-domain-ip.py
exit $LASTEXITCODE
