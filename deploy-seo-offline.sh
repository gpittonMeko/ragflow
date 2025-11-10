#!/bin/bash
# ============================================
# Script Deploy SEO Optimization - OFFLINE MODE
# Da eseguire SOLO quando l'istanza EC2 è FERMA
# ============================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
EC2_HOST="13.49.16.179"
SSH_KEY="C:\Users\user\Documents\LLM_14.pem"
EC2_USER="ubuntu"

echo -e "${BLUE}╔════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   SGAI SEO Optimization Deploy - OFFLINE  ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════╝${NC}"
echo ""

# Check if EC2 is stopped
echo -e "${YELLOW}⚠️  ATTENZIONE: Questo script deve essere eseguito SOLO quando l'istanza EC2 è FERMA${NC}"
echo -e "${YELLOW}   Vuoi continuare? (y/n)${NC}"
read -p "" -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${RED}✘ Deploy annullato${NC}"
    exit 1
fi

# Step 1: Build del progetto con ottimizzazioni SEO
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 1: Building project con ottimizzazioni SEO...${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

cd web
npm run build

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✔ Build completato con successo${NC}"
else
    echo -e "${RED}✘ Build fallito${NC}"
    exit 1
fi

# Step 2: Verifica file SEO nella dist
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 2: Verifica file SEO...${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

FILES_TO_CHECK=(
    "dist/sitemap.xml"
    "dist/robots.txt"
    "dist/site.webmanifest"
    "dist/index.html"
)

for file in "${FILES_TO_CHECK[@]}"; do
    if [ -f "$file" ]; then
        echo -e "${GREEN}✔ $file presente${NC}"
    else
        echo -e "${RED}✘ $file MANCANTE${NC}"
        exit 1
    fi
done

# Step 3: Comprimi dist in ZIP
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 3: Compressione dist/...${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

cd dist
zip -r ../../dist-seo-optimized.zip . -q
cd ../..

echo -e "${GREEN}✔ Creato dist-seo-optimized.zip ($(du -h dist-seo-optimized.zip | cut -f1))${NC}"

# Step 4: Transfer to EC2 (MUST BE STOPPED)
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 4: Transfer ZIP to EC2...${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

echo -e "${YELLOW}⚠️  L'istanza EC2 deve essere FERMA prima di procedere${NC}"
echo -e "${YELLOW}   Hai fermato l'istanza? (y/n)${NC}"
read -p "" -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${RED}✘ Deploy annullato. Ferma prima l'istanza EC2.${NC}"
    exit 1
fi

echo -e "${YELLOW}⏳ Attendere che l'istanza sia completamente ferma...${NC}"
sleep 5

# Transfer ZIP
scp -i "$SSH_KEY" dist-seo-optimized.zip ${EC2_USER}@${EC2_HOST}:/tmp/

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✔ ZIP trasferito su EC2${NC}"
else
    echo -e "${RED}✘ Trasferimento fallito. L'istanza è ferma?${NC}"
    exit 1
fi

# Step 5: Deploy commands (quando EC2 riavvia)
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 5: Comandi per deploy dopo riavvio EC2${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

cat << 'EOF'

📝 Quando riavvii l'istanza EC2, esegui questi comandi SSH:

ssh -i "C:\Users\user\Documents\LLM_14.pem" ubuntu@13.49.16.179

# Backup dist corrente
docker exec ragflow-server mv /ragflow/web/dist /ragflow/web/dist.backup.$(date +%Y%m%d-%H%M%S)

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

EOF

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   ✅ Preparazione completata!             ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}📌 Prossimi passi:${NC}"
echo -e "   1. ✅ ZIP creato: dist-seo-optimized.zip"
echo -e "   2. ✅ Trasferito su EC2 in /tmp/"
echo -e "   3. ⏸️  Riavvia l'istanza EC2"
echo -e "   4. 🔧 Esegui i comandi SSH mostrati sopra"
echo -e "   5. 🎯 Verifica su https://www.sgailegal.com"
echo ""
echo -e "${BLUE}Tip: Salva i comandi SSH in un file per comodità!${NC}"
echo ""

exit 0



