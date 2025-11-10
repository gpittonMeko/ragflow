# ============================================
# Script Deploy SEO Optimization - OFFLINE MODE (PowerShell)
# Da eseguire SOLO quando l'istanza EC2 è FERMA
# ============================================

$ErrorActionPreference = "Stop"

# Configuration
$EC2_HOST = "13.49.16.179"
$SSH_KEY = "C:\Users\user\Documents\LLM_14.pem"
$EC2_USER = "ubuntu"

Write-Host "╔════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   SGAI SEO Optimization Deploy - OFFLINE  ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Warning
Write-Host "⚠️  ATTENZIONE: Questo script deve essere eseguito SOLO quando l'istanza EC2 è FERMA" -ForegroundColor Yellow
$confirmation = Read-Host "Vuoi continuare? (Y/N)"
if ($confirmation -ne 'Y' -and $confirmation -ne 'y') {
    Write-Host "✘ Deploy annullato" -ForegroundColor Red
    exit 1
}

# Step 1: Build del progetto con ottimizzazioni SEO
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "Step 1: Building project con ottimizzazioni SEO..." -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan

Set-Location -Path "web"
npm run build

if ($LASTEXITCODE -eq 0) {
    Write-Host "✔ Build completato con successo" -ForegroundColor Green
} else {
    Write-Host "✘ Build fallito" -ForegroundColor Red
    exit 1
}

# Step 2: Verifica file SEO nella dist
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "Step 2: Verifica file SEO..." -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan

$filesToCheck = @(
    "dist/sitemap.xml",
    "dist/robots.txt",
    "dist/site.webmanifest",
    "dist/index.html"
)

foreach ($file in $filesToCheck) {
    if (Test-Path $file) {
        Write-Host "✔ $file presente" -ForegroundColor Green
    } else {
        Write-Host "✘ $file MANCANTE" -ForegroundColor Red
        exit 1
    }
}

# Step 3: Comprimi dist in ZIP
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "Step 3: Compressione dist/..." -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan

$zipPath = "..\..\dist-seo-optimized.zip"
if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}

Compress-Archive -Path "dist\*" -DestinationPath $zipPath -CompressionLevel Optimal

$zipSize = (Get-Item $zipPath).Length / 1MB
Write-Host "✔ Creato dist-seo-optimized.zip ($([math]::Round($zipSize, 2)) MB)" -ForegroundColor Green

Set-Location -Path ".."

# Step 4: Transfer to EC2 (MUST BE STOPPED)
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "Step 4: Transfer ZIP to EC2..." -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan

Write-Host "⚠️  L'istanza EC2 deve essere FERMA prima di procedere" -ForegroundColor Yellow
$ec2Stopped = Read-Host "Hai fermato l'istanza? (Y/N)"
if ($ec2Stopped -ne 'Y' -and $ec2Stopped -ne 'y') {
    Write-Host "✘ Deploy annullato. Ferma prima l'istanza EC2." -ForegroundColor Red
    exit 1
}

Write-Host "⏳ Attendere che l'istanza sia completamente ferma..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Transfer ZIP
Write-Host "📤 Trasferimento ZIP su EC2..." -ForegroundColor Cyan
scp -i $SSH_KEY dist-seo-optimized.zip "${EC2_USER}@${EC2_HOST}:/tmp/"

if ($LASTEXITCODE -eq 0) {
    Write-Host "✔ ZIP trasferito su EC2" -ForegroundColor Green
} else {
    Write-Host "✘ Trasferimento fallito. L'istanza è ferma?" -ForegroundColor Red
    exit 1
}

# Step 5: Comandi per deploy dopo riavvio
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "Step 5: Comandi per deploy dopo riavvio EC2" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan

$deployCommands = @"

📝 Quando riavvii l'istanza EC2, esegui questi comandi SSH:

ssh -i "C:\Users\user\Documents\LLM_14.pem" ubuntu@13.49.16.179

# Backup dist corrente
docker exec ragflow-server mv /ragflow/web/dist /ragflow/web/dist.backup.`$(date +%Y%m%d-%H%M%S)

# Estrai nuovo dist
docker exec ragflow-server mkdir -p /ragflow/web/dist
docker cp /tmp/dist-seo-optimized.zip ragflow-server:/tmp/
docker exec ragflow-server unzip -q /tmp/dist-seo-optimized.zip -d /ragflow/web/dist

# Verifica file SEO
docker exec ragflow-server ls -lh /ragflow/web/dist/sitemap.xml
docker exec ragflow-server ls -lh /ragflow/web/dist/robots.txt
docker exec ragflow-server ls -lh /ragflow/web/dist/site.webmanifest

# Riavvia nginx per cache refresh
docker exec ragflow-server nginx -s reload

# Cleanup
rm /tmp/dist-seo-optimized.zip
docker exec ragflow-server rm /tmp/dist-seo-optimized.zip

echo "✅ SEO Optimization Deploy Completato!"

"@

Write-Host $deployCommands -ForegroundColor White

# Salva i comandi in un file
$deployCommands | Out-File -FilePath "deploy-commands-after-reboot.txt" -Encoding UTF8
Write-Host ""
Write-Host "✔ Comandi salvati in: deploy-commands-after-reboot.txt" -ForegroundColor Green

Write-Host ""
Write-Host "╔════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║   ✅ Preparazione completata!             ║" -ForegroundColor Green
Write-Host "╚════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "📌 Prossimi passi:" -ForegroundColor Yellow
Write-Host "   1. ✅ ZIP creato: dist-seo-optimized.zip"
Write-Host "   2. ✅ Trasferito su EC2 in /tmp/"
Write-Host "   3. ⏸️  Riavvia l'istanza EC2"
Write-Host "   4. 🔧 Esegui i comandi in: deploy-commands-after-reboot.txt"
Write-Host "   5. 🎯 Verifica su https://www.sgailegal.com"
Write-Host ""
Write-Host "Tip: Apri deploy-commands-after-reboot.txt per copiare i comandi!" -ForegroundColor Cyan
Write-Host ""

exit 0



