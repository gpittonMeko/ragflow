# Build web (umi) e deploy della cartella dist su EC2 in ~/workspace/ragflow/web
$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$webDir = Join-Path $repoRoot "web"
$key = Join-Path $env:USERPROFILE "Documents\LLM_14.pem"
# DNS sgailegal.com → 13.49.16.179 (aggiornare se cambia IP)
$hostIp = "13.49.16.179"
$user = "ubuntu"
$remoteWeb = "/home/ubuntu/workspace/ragflow/web"
$remoteScript = "/home/ubuntu/workspace/ragflow/scripts/deploy-dist-remote.sh"

if (-not (Test-Path $webDir)) { throw "Cartella mancante: $webDir" }
if (-not (Test-Path $key)) { throw "Chiave SSH mancante: $key" }

Write-Host "=== npm run build (web) ===" -ForegroundColor Cyan
Push-Location $webDir
try {
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "Build fallito con exit $LASTEXITCODE" }
} finally {
  Pop-Location
}

$distPath = Join-Path $webDir "dist"
if (-not (Test-Path (Join-Path $distPath "index.html"))) { throw "dist/index.html non trovato" }

$tgz = Join-Path $env:TEMP "ragflow-web-dist.tgz"
if (Test-Path $tgz) { Remove-Item $tgz -Force }
Write-Host "=== tar dist ===" -ForegroundColor Cyan
Push-Location $webDir
try { tar -czf $tgz dist } finally { Pop-Location }

Write-Host "=== SCP ===" -ForegroundColor Cyan
scp -o StrictHostKeyChecking=accept-new -i $key $tgz "${user}@${hostIp}:/tmp/ragflow-web-dist.tgz"

$remoteCmd = "bash -c `"set -e; if [ -f '$remoteScript' ]; then bash '$remoteScript' '$remoteWeb'; else cd '$remoteWeb' && (test -d dist && mv dist dist.prev || true) && mkdir -p dist && tar -xzf /tmp/ragflow-web-dist.tgz -C '$remoteWeb' && rm -f /tmp/ragflow-web-dist.tgz && test -f dist/index.html && echo DEPLOY_OK; fi`""
ssh -o StrictHostKeyChecking=accept-new -i $key "${user}@${hostIp}" $remoteCmd
Write-Host "OK deploy EC2" -ForegroundColor Green
