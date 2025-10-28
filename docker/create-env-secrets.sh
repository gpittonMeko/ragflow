#!/bin/bash
# Script per creare .env.secrets con tutte le chiavi Stripe
# Eseguire sul server: cd ~/workspace/ragflow/docker && bash create-env-secrets.sh

cat > .env.secrets << 'ENVEOF'
# Stripe Configuration
# IMPORTANT: Questo file è in .gitignore e NON viene mai committato
# 
# ⚠️  SOSTITUISCI I VALORI CON LE TUE CHIAVI REALI!
# Ottieni le chiavi da: https://dashboard.stripe.com/apikeys

STRIPE_SECRET_KEY=sk_live_TUA_CHIAVE_QUI
STRIPE_WEBHOOK_SECRET=whsec_TUA_CHIAVE_QUI
STRIPE_PRICE_PREMIUM=price_TUO_PRICE_ID_QUI
APP_URL=https://www.sgailegal.com

# Stripe Portal Configuration ID (già configurato nel codice oauth_backend.py)
# PORTAL_CONFIG_ID=bpc_1SMthDBo6bKd1aEWfVbZeRA9
ENVEOF

echo "✅ File .env.secrets creato!"
chmod 600 .env.secrets
echo "✅ Permessi file impostati (solo proprietario può leggere)"
ls -la .env.secrets

