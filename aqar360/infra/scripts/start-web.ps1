# Starts the public website (Next.js) on http://localhost:3000 against the local staging backend.
# Run start-dev.ps1 first so Frappe is up. First run installs dependencies and builds.
param([switch]$Dev)
$ErrorActionPreference = 'Stop'
$web = Join-Path $PSScriptRoot '../../web'
Set-Location $web
if (-not (Test-Path '.env.local')) { Copy-Item '.env.example' '.env.local' }
if (-not (Test-Path 'node_modules')) { npm install --no-audit --no-fund; if ($LASTEXITCODE -ne 0) { throw 'npm install failed' } }
if ($Dev) {
  npm run dev
} else {
  npm run build; if ($LASTEXITCODE -ne 0) { throw 'Website build failed' }
  npm run start
}
