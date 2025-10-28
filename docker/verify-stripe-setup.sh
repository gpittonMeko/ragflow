#!/bin/bash
# Script di verifica per la configurazione Stripe
# Eseguire sul server: cd ~/workspace/ragflow/docker && bash verify-stripe-setup.sh

echo "=========================================="
echo "🔍 VERIFICA CONFIGURAZIONE STRIPE"
echo "=========================================="
echo ""

# 1. Verifica se .env.secrets esiste già
echo "1️⃣  Verifica file .env.secrets:"
if [ -f .env.secrets ]; then
    echo "   ⚠️  ATTENZIONE: .env.secrets esiste già!"
    echo "   📄 Contenuto attuale:"
    cat .env.secrets | grep -E "STRIPE|APP_URL" | sed 's/^/      /'
    echo ""
    echo "   ❓ Vuoi sovrascriverlo? (controlla sopra)"
else
    echo "   ✅ .env.secrets non esiste (sarà creato)"
fi
echo ""

# 2. Verifica che .env.secrets sia in .gitignore
echo "2️⃣  Verifica .gitignore:"
if grep -q "^\.env\.secrets$" ../.gitignore 2>/dev/null || grep -q "\.env\.secrets" ../.gitignore 2>/dev/null; then
    echo "   ✅ .env.secrets è in .gitignore (sicuro)"
else
    echo "   ⚠️  .env.secrets NON trovato in .gitignore (verifica manualmente)"
fi
echo ""

# 3. Verifica docker-compose-base.yml
echo "3️⃣  Verifica docker-compose-base.yml:"
if grep -q "STRIPE_SECRET_KEY.*STRIPE_SECRET_KEY" docker-compose-base.yml 2>/dev/null; then
    echo "   ✅ Variabili STRIPE trovate in docker-compose-base.yml"
    echo "   📄 Variabili configurate:"
    grep -A 4 "Stripe keys" docker-compose-base.yml | grep "STRIPE\|APP_URL" | sed 's/^/      /'
else
    echo "   ❌ Variabili STRIPE NON trovate in docker-compose-base.yml"
    echo "   ⚠️  Potrebbero essere nel file sbagliato o mancanti"
fi
echo ""

# 4. Verifica container attuale
echo "4️⃣  Verifica container ragflow-backend-oauth:"
if docker ps --format "{{.Names}}" | grep -q ragflow-backend-oauth; then
    echo "   ✅ Container ragflow-backend-oauth è in esecuzione"
    echo "   📋 Variabili STRIPE attualmente caricate:"
    docker exec ragflow-backend-oauth env 2>/dev/null | grep STRIPE | sed 's/^/      /' || echo "      ❌ Nessuna variabile STRIPE trovata (NORMAL se non hai ancora creato .env.secrets)"
else
    echo "   ⚠️  Container ragflow-backend-oauth NON è in esecuzione"
fi
echo ""

# 5. Riepilogo e prossimi passi
echo "=========================================="
echo "📋 RIEPILOGO:"
echo "=========================================="
echo ""
echo "✅ Setup corretto se:"
echo "   1. docker-compose-base.yml ha le variabili STRIPE"
echo "   2. .env.secrets sarà creato con le chiavi"
echo "   3. Container verrà riavviato per caricare le chiavi"
echo ""
echo "📝 Prossimi passi (DOPO la verifica):"
echo "   1. Crea .env.secrets: bash create-env-secrets.sh"
echo "   2. Riavvia container: docker compose restart ragflow-backend-oauth"
echo "   3. Verifica: docker exec ragflow-backend-oauth env | grep STRIPE"
echo ""

