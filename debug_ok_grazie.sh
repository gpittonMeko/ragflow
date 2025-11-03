#!/bin/bash
# Script per analizzare il caso "ok grazie" nell'agent SGAI

echo "═══════════════════════════════════════════════════════════════"
echo "  DEBUG: Analisi caso 'ok grazie'"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# 1. Cerca nei log l'ultima occorrenza di "ok grazie"
echo "[1] Cerco ultima query 'ok grazie' nei log..."
ssh -i "C:\Users\user\Documents\LLM_14.pem" ubuntu@13.49.16.179 "docker logs ragflow-server 2>&1 | grep -A 20 'ok grazie' | tail -30"

echo ""
echo "[2] Verifico quale Generate component viene usato..."
ssh -i "C:\Users\user\Documents\LLM_14.pem" ubuntu@13.49.16.179 "docker logs ragflow-server 2>&1 | grep -B 5 -A 10 'Generate:Evil' | tail -20"

echo ""
echo "[3] Estraggo il prompt del Generate senza retrieval dal database..."
ssh -i "C:\Users\user\Documents\LLM_14.pem" ubuntu@13.49.16.179 'docker exec ragflow-mysql mysql -uroot -pinfini_rag_flow -D rag_flow -N -e "SELECT JSON_UNQUOTE(JSON_EXTRACT(dsl, '\''$.components.\"Generate:EvilHoundsCreate\".obj.params.prompt'\'')) FROM user_canvas WHERE id='\''a92b7464193811f09d527ebdee58e854'\'' LIMIT 1;" 2>/dev/null'

echo ""
echo "[4] Verifico se il Generate riceve correttamente la history..."
ssh -i "C:\Users\user\Documents\LLM_14.pem" ubuntu@13.49.16.179 "docker logs ragflow-server 2>&1 | grep 'GENERATE-DEBUG.*EvilHoundsCreate' | tail -10"

echo ""
echo "═══════════════════════════════════════════════════════════════"

