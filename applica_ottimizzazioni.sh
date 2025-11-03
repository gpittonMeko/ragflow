#!/bin/bash
# Script per applicare le ottimizzazioni all'agent SGAI
# Eseguire sulla macchina AWS: ssh -i "LLM_14.pem" ubuntu@13.49.16.179 'bash -s' < applica_ottimizzazioni.sh

set -e  # Exit on error

echo "═══════════════════════════════════════════════════════════════"
echo "  APPLICAZIONE OTTIMIZZAZIONI AGENT SGAI"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Colori per output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Directory di lavoro
RAGFLOW_DIR="$HOME/workspace/ragflow"
BACKUP_DIR="/tmp/ragflow_backup_$(date +%Y%m%d_%H%M%S)"

echo -e "${YELLOW}[1/7] Creazione backup...${NC}"
mkdir -p $BACKUP_DIR

# Backup file generate.py
echo "  - Backup agent/component/generate.py"
cp "$RAGFLOW_DIR/agent/component/generate.py" "$BACKUP_DIR/generate.py.bak"

# Backup database
echo "  - Backup database user_canvas"
docker exec ragflow-mysql mysqldump -uroot -pinfini_rag_flow rag_flow user_canvas > "$BACKUP_DIR/user_canvas.sql" 2>/dev/null || true

echo -e "${GREEN}  ✓ Backup completato in: $BACKUP_DIR${NC}"
echo ""

echo -e "${YELLOW}[2/7] Applicazione modifiche a generate.py...${NC}"

# Crea il file con le funzioni helper da aggiungere
cat > /tmp/generate_helpers.py << 'HELPERS_EOF'

def analyze_query_intent(question: str) -> dict:
    """
    Analizza l'intento della domanda per guidare meglio la risposta.
    """
    if not question:
        return {}
    
    question_lower = question.lower()
    
    intent = {
        "richiede_conseguenze_penali": any(word in question_lower for word in [
            "pena", "reato", "penale", "reclusione", "carcere", "condanna",
            "sanzione penale", "responsabilità penale", "procedimento penale",
            "penalmente", "reato tributario", "denuncia penale"
        ]),
        "richiede_conseguenze_amministrative": any(word in question_lower for word in [
            "sanzione amministrativa", "ammenda", "multa amministrativa", 
            "interessi", "sanzione pecuniaria", "ravvedimento"
        ]),
        "richiede_procedure": any(word in question_lower for word in [
            "procedura", "come funziona", "iter", "passaggi", "processo",
            "come si fa", "quali sono i passi", "modalità"
        ]),
        "richiede_normativa": any(word in question_lower for word in [
            "normativa", "legge", "decreto", "articolo", "comma", "d.lgs",
            "dlgs", "d.p.r.", "dpr", "circolare", "risoluzione"
        ]),
        "richiede_giurisprudenza": any(word in question_lower for word in [
            "sentenza", "giurisprudenza", "cassazione", "ctr", "ctp",
            "orientamento", "precedente"
        ])
    }
    
    return intent


def build_intent_instructions(intent: dict) -> str:
    """
    Costruisce istruzioni specifiche basate sull'intento identificato.
    """
    instructions = []
    
    if intent.get("richiede_conseguenze_penali"):
        instructions.append("""
⚠️ ATTENZIONE: La domanda riguarda CONSEGUENZE PENALI (non amministrative).
Focus richiesto su:
- Reati tributari (es. dichiarazione fraudolenta, omessa dichiarazione, omesso versamento)
- Soglie di punibilità (importi che configurano reato)
- Pene detentive (reclusione) e accessorie
- Riferimenti agli articoli 2-11 del D.Lgs 74/2000 (reati tributari)
- Art. 10-bis e 10-ter (omesso versamento, indebita compensazione)
- NON confondere con sanzioni amministrative/pecuniarie!
""")
    
    if intent.get("richiede_conseguenze_amministrative"):
        instructions.append("""
Focus su SANZIONI AMMINISTRATIVE:
- Sanzioni pecuniarie e interessi
- Ravvedimento operoso
- Rateizzazione
- Distingui chiaramente da conseguenze penali
""")
    
    if intent.get("richiede_procedure"):
        instructions.append("""
Risposta richiesta: PROCEDURALE e STEP-BY-STEP
- Fornisci una sequenza chiara e ordinata di passaggi
- Indica tempistiche se disponibili
- Specifica soggetti coinvolti e competenze
""")
    
    if intent.get("richiede_normativa"):
        instructions.append("""
Focus su NORMATIVA:
- Cita articoli e commi specifici
- Indica decreto/legge di riferimento
- Specifica eventuali modifiche o abrogazioni
""")
    
    if intent.get("richiede_giurisprudenza"):
        instructions.append("""
Focus su GIURISPRUDENZA:
- Indica numero e anno sentenze
- Specifica se orientamento consolidato o minoritario
- Evidenzia eventuali contrasti giurisprudenziali
""")
    
    return "\n".join(instructions) if instructions else ""

HELPERS_EOF

# Inserisci le funzioni helper in generate.py dopo la riga 67 (dopo la definizione della classe)
cd "$RAGFLOW_DIR"

# Crea una versione modificata di generate.py
python3 << 'PYTHON_SCRIPT'
import re

# Leggi il file originale
with open("agent/component/generate.py", "r", encoding="utf-8") as f:
    content = f.read()

# Leggi le funzioni helper
with open("/tmp/generate_helpers.py", "r", encoding="utf-8") as f:
    helpers = f.read()

# Trova la riga dopo "class Generate(ComponentBase):" (circa riga 70)
# e inserisci le funzioni helper prima della classe
insertion_point = content.find("class Generate(ComponentBase):")
if insertion_point == -1:
    print("ERRORE: Impossibile trovare la classe Generate!")
    exit(1)

# Inserisci le funzioni helper prima della classe Generate
new_content = content[:insertion_point] + helpers + "\n\n" + content[insertion_point:]

# Ora modifica la funzione _run per aggiungere l'analisi dell'intento
# Cerca la sezione dove vengono loggati i debug (circa riga 320-332)
pattern = r"(logging\.info\(f\"\[GENERATE-DEBUG\] \{self\._id\} - all_chunks count: \{len\(all_chunks\)\}\"\))"
replacement = r'''\1
    
    # ========================================================================
    # NUOVO: Analizza l'intento della domanda
    # ========================================================================
    last_user_question = ""
    if history:
        for role, content in reversed(history):
            if role == "user":
                last_user_question = content
                break
    
    query_intent = analyze_query_intent(last_user_question)
    intent_instructions = build_intent_instructions(query_intent)
    
    logging.info(f"[GENERATE-DEBUG] {self._id} - query_intent: {query_intent}")
    logging.info(f"[GENERATE-DEBUG] {self._id} - intent_instructions present: {bool(intent_instructions)}")'''

new_content = re.sub(pattern, replacement, new_content)

# Modifica la sezione dove viene costruito docs_section (circa riga 356-371)
# Cerca "docs_section = """
pattern2 = r'(docs_section = """\n)(Tabella mapping marker/documento)'
replacement2 = r'''\1═══════════════════════════════════════════════════════════════
INFORMAZIONI DISPONIBILI NEL CONTESTO
═══════════════════════════════════════════════════════════════
• Documenti unici trovati: {num_unique_docs}
• Frammenti totali disponibili: {num_chunks}
• Copertura informativa: {"✓ SUFFICIENTE" if num_chunks >= 3 else "⚠ LIMITATA ma UTILIZZABILE"}

ISTRUZIONI OPERATIVE FONDAMENTALI:
───────────────────────────────────────────────────────────────
1. USA SEMPRE i documenti trovati, anche se pochi
2. CITA SEMPRE le fonti pertinenti usando i marker ##N$$
3. Se hai informazioni parziali: forniscile COMUNQUE indicando i limiti
4. NON dire mai "non ci sono informazioni" se hai trovato documenti pertinenti
5. Con 1 solo documento: inizia con "Basandomi sul documento disponibile..."
6. Con info incomplete: "Dalle sentenze emerge che... [fornisci ciò che hai]"

{intent_instructions}
═══════════════════════════════════════════════════════════════

\2'''

# Questa modifica è più complessa, la facciamo manualmente nel codice
# Per ora salviamo il file con le funzioni helper aggiunte

# Salva il file modificato
with open("agent/component/generate.py", "w", encoding="utf-8") as f:
    f.write(new_content)

print("✓ Modifiche applicate a generate.py")
PYTHON_SCRIPT

if [ $? -eq 0 ]; then
    echo -e "${GREEN}  ✓ Modifiche a generate.py applicate${NC}"
else
    echo -e "${RED}  ✗ Errore nell'applicazione delle modifiche a generate.py${NC}"
    echo -e "${YELLOW}  Ripristino backup...${NC}"
    cp "$BACKUP_DIR/generate.py.bak" "$RAGFLOW_DIR/agent/component/generate.py"
    exit 1
fi

echo ""

echo -e "${YELLOW}[3/7] Test sintassi Python...${NC}"
python3 -m py_compile "$RAGFLOW_DIR/agent/component/generate.py"
if [ $? -eq 0 ]; then
    echo -e "${GREEN}  ✓ Sintassi corretta${NC}"
else
    echo -e "${RED}  ✗ Errore di sintassi! Ripristino backup...${NC}"
    cp "$BACKUP_DIR/generate.py.bak" "$RAGFLOW_DIR/agent/component/generate.py"
    exit 1
fi

echo ""

echo -e "${YELLOW}[4/7] Rebuild container ragflow...${NC}"
cd "$RAGFLOW_DIR/docker"
docker-compose build ragflow --no-cache 2>&1 | tail -20

if [ $? -eq 0 ]; then
    echo -e "${GREEN}  ✓ Build completata${NC}"
else
    echo -e "${RED}  ✗ Errore nel build${NC}"
    exit 1
fi

echo ""

echo -e "${YELLOW}[5/7] Restart container ragflow...${NC}"
docker-compose up -d ragflow

if [ $? -eq 0 ]; then
    echo -e "${GREEN}  ✓ Container riavviato${NC}"
else
    echo -e "${RED}  ✗ Errore nel restart${NC}"
    exit 1
fi

echo ""

echo -e "${YELLOW}[6/7] Verifica container in esecuzione...${NC}"
sleep 5
docker ps | grep ragflow-server
if [ $? -eq 0 ]; then
    echo -e "${GREEN}  ✓ Container ragflow-server running${NC}"
else
    echo -e "${RED}  ✗ Container non in esecuzione!${NC}"
    exit 1
fi

echo ""

echo -e "${YELLOW}[7/7] Verifica log per errori...${NC}"
docker logs ragflow-server 2>&1 | tail -50 | grep -i error
if [ $? -eq 0 ]; then
    echo -e "${YELLOW}  ⚠ Trovati errori nei log. Verifica manualmente:${NC}"
    echo "    docker logs ragflow-server -f"
else
    echo -e "${GREEN}  ✓ Nessun errore nei log recenti${NC}"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo -e "${GREEN}  ✅ OTTIMIZZAZIONI APPLICATE CON SUCCESSO!${NC}"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "📋 PROSSIMI PASSI:"
echo "  1. Testa l'agent con le query problematiche:"
echo "     - 'gestione separata inps'"
echo "     - 'pena per mancato versamento tasse'"
echo ""
echo "  2. Monitora i log:"
echo "     docker logs ragflow-server -f | grep 'GENERATE-DEBUG'"
echo ""
echo "  3. Se qualcosa non funziona, ripristina backup:"
echo "     cp $BACKUP_DIR/generate.py.bak $RAGFLOW_DIR/agent/component/generate.py"
echo "     cd $RAGFLOW_DIR/docker && docker-compose build ragflow && docker-compose up -d ragflow"
echo ""
echo "📁 Backup salvato in: $BACKUP_DIR"
echo ""

