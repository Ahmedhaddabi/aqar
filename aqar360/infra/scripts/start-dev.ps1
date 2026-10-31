$ErrorActionPreference = 'Stop'
$env:AQAR360_ROOT = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path.Replace('\','/')
$workspaceRoot = Split-Path $env:AQAR360_ROOT -Parent
docker compose -p frappe -f "$workspaceRoot/frappe_docker/compose.custom.yaml" -f "$env:AQAR360_ROOT/infra/compose.dev.yaml" up -d
if ($LASTEXITCODE -ne 0) { throw 'Development startup failed' }

