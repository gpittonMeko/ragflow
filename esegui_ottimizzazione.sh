#!/bin/bash
# ════════════════════════════════════════════════════════════════════════════════
# SCRIPT APPLICAZIONE PROMPT OTTIMIZZATI - AGENT SGAI
# ════════════════════════════════════════════════════════════════════════════════

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}"
echo "════════════════════════════════════════════════════════════════════════════════"
echo "  OTTIMIZZAZIONE PROMPT AGENT SGAI"
echo "════════════════════════════════════════════════════════════════════════════════"
echo -e "${NC}"

# ════════════════════════════════════════════════════════════════════════════════
# STEP 1: Verifica container MySQL
# ════════════════════════════════════════════════════════════════════════════════
echo -e "${YELLOW}[1/6] Verifica container MySQL...${NC}"
if docker ps | grep -q ragflow-mysql; then
    echo -e "${GREEN}  ✓ MySQL in esecuzione${NC}"
else
    echo -e "${RED}  ✗ MySQL non in esecuzione!${NC}"
    exit 1
fi

# ════════════════════════════════════════════════════════════════════════════════
# STEP 2: Backup automatico
# ════════════════════════════════════════════════════════════════════════════════
echo -e "\n${YELLOW}[2/6] Creazione backup database...${NC}"
docker exec ragflow-mysql mysql -uroot -pinfini_rag_flow -D rag_flow << 'SQLBACKUP'
DROP TABLE IF EXISTS user_canvas_backup_20251103_prompt_optimization;
CREATE TABLE user_canvas_backup_20251103_prompt_optimization AS 
SELECT * FROM user_canvas WHERE id = 'a92b7464193811f09d527ebdee58e854';
SELECT 'Backup creato!' as Status;
SQLBACKUP

if [ $? -eq 0 ]; then
    echo -e "${GREEN}  ✓ Backup creato con successo${NC}"
else
    echo -e "${RED}  ✗ Errore nel backup!${NC}"
    exit 1
fi

# ════════════════════════════════════════════════════════════════════════════════
# STEP 3: Mostra prompt attuali
# ════════════════════════════════════════════════════════════════════════════════
echo -e "\n${YELLOW}[3/6] Prompt attuali...${NC}"
docker exec ragflow-mysql mysql -uroot -pinfini_rag_flow -D rag_flow -N << 'SQLSHOW'
SELECT 
    'EvilHoundsCreate (senza retrieval)' as Component,
    LENGTH(JSON_UNQUOTE(JSON_EXTRACT(dsl, '$.components."Generate:EvilHoundsCreate".obj.params.prompt'))) as chars
FROM user_canvas WHERE id = 'a92b7464193811f09d527ebdee58e854';
SELECT 
    'DullDotsMarry (con retrieval)' as Component,
    LENGTH(JSON_UNQUOTE(JSON_EXTRACT(dsl, '$.components."Generate:DullDotsMarry".obj.params.prompt'))) as chars
FROM user_canvas WHERE id = 'a92b7464193811f09d527ebdee58e854';
SQLSHOW

# ════════════════════════════════════════════════════════════════════════════════
# STEP 4: Applicazione nuovo prompt Generate:EvilHoundsCreate
# ════════════════════════════════════════════════════════════════════════════════
echo -e "\n${YELLOW}[4/6] Aggiornamento Generate:EvilHoundsCreate...${NC}"

NEW_PROMPT_EVIL="Sei SGAI, un'intelligenza artificiale specializzata in diritto tributario e doganale italiano.

HAI ACCESSO ALLA CONVERSAZIONE PRECEDENTE CON L'UTENTE.
Analizza sempre il contesto della conversazione per rispondere in modo pertinente e contestuale.

═══════════════════════════════════════════════════════════════════════
ISTRUZIONI COMPORTAMENTALI
═══════════════════════════════════════════════════════════════════════

1. RINGRAZIAMENTI O CONVENEVOLI (es. \"ok grazie\", \"ciao\", \"perfetto\"):
   → Rispondi cortesemente facendo RIFERIMENTO all'argomento discusso
   → Esempio: \"Di nulla! Se hai altre domande su [argomento discusso prima], sono a disposizione.\"
   → Chiudi con disponibilità per ulteriori chiarimenti

2. DOMANDE TRIBUTARIE/DOGANALI VAGHE (es. \"parlami di IVA\", \"e l'INPS?\"):
   → Anche senza documenti specifici, prova a dare informazioni generali se conosci l'argomento
   → Chiedi poi dettagli per approfondire con la knowledge base
   → Esempio: \"L'IVA è l'imposta sul valore aggiunto. Su quale aspetto specifico vuoi approfondire? Regimi speciali, reverse charge, detrazioni, o altro?\"

3. DOMANDE FUORI AMBITO MA SENSATE (es. \"come va il tempo?\", \"parlami di calcio\"):
   → Risposta sarcastica ma PROFESSIONALE
   → Esempio: \"Sono molto bravo con le aliquote IVA, meno con le previsioni meteo! Parliamo piuttosto di questioni tributarie o doganali?\"

4. DOMANDE ASSURDE O PROVOCATORIE (es. \"sei stupido?\", \"fai schifo\"):
   → Risposta elegantemente sarcastica mantenendo professionalità
   → Esempio: \"Apprezzo il feedback costruttivo! Però sono specializzato in diritto tributario, non in psicologia. Posso aiutarti con questioni fiscali invece?\"

5. DOMANDE TECNICHE SENZA DOCUMENTI DISPONIBILI:
   → Prova a rispondere con conoscenze generali se hai informazioni utili
   → Indica che per dettagli specifici serve consultare la knowledge base

═══════════════════════════════════════════════════════════════════════
REGOLE FONDAMENTALI
═══════════════════════════════════════════════════════════════════════

✓ USA SEMPRE il contesto della conversazione precedente
✓ Prova SEMPRE a essere utile anche senza documenti specifici
✓ Mantieni personalità SGAI: esperto, disponibile, leggermente sarcastico con domande fuori tema
✓ Se conosci la risposta a livello generale: forniscila, poi chiedi dettagli per approfondire

✗ NON ignorare il contesto della conversazione
✗ NON essere troppo formale con ringraziamenti (sii cordiale)
✗ NON essere offensivo con domande fuori tema (sarcasmo ELEGANTE)

Sei un esperto con competenza profonda in diritto tributario e doganale, tono professionale ma accessibile, capacità di semplificare concetti complessi, sottile ironia quando appropriato."

docker exec ragflow-mysql mysql -uroot -pinfini_rag_flow -D rag_flow << SQLUPDATE1
UPDATE user_canvas 
SET dsl = JSON_SET(
    dsl,
    '\$.components."Generate:EvilHoundsCreate".obj.params.prompt',
    '${NEW_PROMPT_EVIL}'
)
WHERE id = 'a92b7464193811f09d527ebdee58e854';
SQLUPDATE1

if [ $? -eq 0 ]; then
    echo -e "${GREEN}  ✓ Prompt EvilHoundsCreate aggiornato${NC}"
else
    echo -e "${RED}  ✗ Errore aggiornamento!${NC}"
    exit 1
fi

# ════════════════════════════════════════════════════════════════════════════════
# STEP 5: Aggiornamento Generate:DullDotsMarry
# ════════════════════════════════════════════════════════════════════════════════
echo -e "\n${YELLOW}[5/6] Aggiornamento Generate:DullDotsMarry...${NC}"

# Prendiamo il prompt esistente e lo modifichiamo
docker exec ragflow-mysql mysql -uroot -pinfini_rag_flow -D rag_flow -N -e "
UPDATE user_canvas 
SET dsl = JSON_SET(
    dsl,
    '\$.components.\"Generate:DullDotsMarry\".obj.params.prompt',
    CONCAT(
        '════════════════════════════════════════════════════════════════════════════════\nREGOLE FONDAMENTALI USO DOCUMENTI (LEGGI ATTENTAMENTE!)\n════════════════════════════════════════════════════════════════════════════════\n\n✓ USA SEMPRE i documenti trovati, ANCHE SE POCHI\n✓ Con 1 documento: \"Basandomi sul documento disponibile...\"\n✓ Con 2-3 documenti: \"Dalle fonti in archivio emerge che...\"\n✓ CITA SEMPRE le fonti con marker ##N\$\$ subito dopo ogni citazione\n✓ Se hai informazioni parziali: forniscile COMUNQUE + indica i limiti\n✗ NON dire MAI \"non ci sono informazioni sufficienti\" se hai trovato documenti pertinenti!\n\n════════════════════════════════════════════════════════════════════════════════\nDISTINZIONI CRITICHE - LEGGI BENE LA DOMANDA!\n════════════════════════════════════════════════════════════════════════════════\n\n⚠️ ATTENZIONE: Distingui SEMPRE tra questi aspetti:\n\n• \"PENA\" / \"REATO\" / \"PENALE\" / \"RECLUSIONE\" / \"CONDANNA\"\n  → L'\''utente chiede CONSEGUENZE PENALI\n  → Cerca: D.Lgs 74/2000 (reati tributari), art. 10-bis, 10-ter\n  → Soglie di punibilità, pene detentive, responsabilità penale\n  → NON confondere con sanzioni amministrative!\n\n• \"SANZIONE\" / \"MULTA\" / \"INTERESSI\" / \"AMMENDA\"\n  → L'\''utente chiede CONSEGUENZE AMMINISTRATIVE\n  → Cerca: sanzioni pecuniarie, ravvedimento operoso, interessi moratori\n  → Distingui chiaramente da aspetti penali!\n\n• \"PROCEDURA\" / \"COME\" / \"ITER\" / \"PASSAGGI\"\n  → L'\''utente chiede una PROCEDURA\n  → Rispondi in formato STEP-BY-STEP numerato\n\n════════════════════════════════════════════════════════════════════════════════\n\n',
        JSON_UNQUOTE(JSON_EXTRACT(dsl, '\$.components.\"Generate:DullDotsMarry\".obj.params.prompt'))
    )
)
WHERE id = 'a92b7464193811f09d527ebdee58e854';
"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}  ✓ Prompt DullDotsMarry aggiornato${NC}"
else
    echo -e "${RED}  ✗ Errore aggiornamento!${NC}"
    exit 1
fi

# ════════════════════════════════════════════════════════════════════════════════
# STEP 6: Verifica finale
# ════════════════════════════════════════════════════════════════════════════════
echo -e "\n${YELLOW}[6/6] Verifica modifiche...${NC}"

docker exec ragflow-mysql mysql -uroot -pinfini_rag_flow -D rag_flow << 'SQLVERIFY'
SELECT 
    'EvilHoundsCreate' as Component,
    LENGTH(JSON_UNQUOTE(JSON_EXTRACT(dsl, '$.components."Generate:EvilHoundsCreate".obj.params.prompt'))) as new_length
FROM user_canvas WHERE id = 'a92b7464193811f09d527ebdee58e854'
UNION ALL
SELECT 
    'DullDotsMarry' as Component,
    LENGTH(JSON_UNQUOTE(JSON_EXTRACT(dsl, '$.components."Generate:DullDotsMarry".obj.params.prompt'))) as new_length
FROM user_canvas WHERE id = 'a92b7464193811f09d527ebdee58e854';
SQLVERIFY

echo ""
echo -e "${GREEN}"
echo "════════════════════════════════════════════════════════════════════════════════"
echo "  ✅ OTTIMIZZAZIONE COMPLETATA CON SUCCESSO!"
echo "════════════════════════════════════════════════════════════════════════════════"
echo -e "${NC}"
echo ""
echo -e "${BLUE}📋 PROSSIMI PASSI:${NC}"
echo "  1. Testa con: 'ok grazie' (deve rispondere contestualmente)"
echo "  2. Testa con: 'gestione separata inps' (deve usare il doc trovato)"
echo "  3. Testa con: 'quale pena per mancato pagamento tasse' (deve distinguere penale)"
echo ""
echo -e "${BLUE}🔄 Per rollback (se serve):${NC}"
echo "  bash /tmp/rollback_prompt.sh"
echo ""
echo -e "${BLUE}📁 Backup salvato in:${NC}"
echo "  user_canvas_backup_20251103_prompt_optimization"
echo ""

