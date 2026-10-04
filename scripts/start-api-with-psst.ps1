$ErrorActionPreference='Stop'
Set-Location -LiteralPath (Split-Path $PSScriptRoot -Parent)
$vault = & psst --global list --json | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or -not $vault.success) { throw 'Could not read secret names from psst.' }
$allowedNames = @('OPENAI_API_KEY', 'PRZEJSCIE_CLERK_PUBLISHABLE_KEY', 'PRZEJSCIE_CLERK_SECRET_KEY', 'MIASTO_W_ZASIEGU_STRIPE_SECRET_KEY', 'MIASTOWZASIEGU_STRIPE_SECRET_KEY', 'MIASTOWZASIEGU_STRIPE_WEBHOOK_SECRET', 'MIASTOWZASIEGU_STRIPE_PORTAL_CONFIG')
$selectedNames = @($vault.secrets | Where-Object { $_.name -in $allowedNames } | ForEach-Object { $_.name })
if ($selectedNames.Count -gt 0) {
    & psst --global @selectedNames -- node server/index.mjs
} else {
    & node server/index.mjs
}
exit $LASTEXITCODE
