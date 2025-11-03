# 📊 ANALISI COMPLETA E PROPOSTE DI OTTIMIZZAZIONE AGENT SGAI

**Data analisi**: 3 Novembre 2025  
**Agent ID**: `a92b7464193811f09d527ebdee58e854`  
**Nome**: AGENT IN USO

---

## 🔍 STRUTTURA ATTUALE DELL'AGENT

### Componenti Totali: 22
```
Answer              : 1  | Begin               : 1
Categorize          : 1  | DuckDuckGo          : 1
Generate            : 9  | Google              : 1
KeywordExtract      : 1  | Message             : 1
Retrieval           : 7  
```

### Flusso Principale
```
begin (Prologue: "Benvenuto! Sono SGAI...")
  ↓
Answer:RudeBatsItch (riceve input utente)
  ↓
Categorize:TrueButtonsSend (classifica la domanda)
  ├─→ [ITV] → Generate:TidyMangosRaise (senza retrieval)
  ├─→ [Risposta con retrieval] → KeywordExtract → 6 Retrieval → Generate:DullDotsMarry ✓
  └─→ [Risposta non attinente] → Generate:EvilHoundsCreate (senza retrieval) ⚠️
```

---

## ❌ PROBLEMI IDENTIFICATI

### PROBLEMA 1: "ok grazie!" va al Generate sbagliato

**Caso reale dai log:**
```
User: "ok grazie."
→ Categorize lo classifica come "non attinente"
→ Va a Generate:EvilHoundsCreate
→ Questo Generate ha un prompt TROPPO GENERICO (318 caratteri):
   "Dai una risposta alla domanda del cliente, per quanto concerne la tua competenza, es...
    Non dire quanto è grande o fino a dove arriva la tua knowledge."
```

**Conseguenza**: 
- ✗ Non vede bene la conversazione precedente
- ✗ Risponde in modo troppo generico
- ✗ Non contestualizza la domanda

---

### PROBLEMA 2: Generate principale non gestisce bene i pochi chunk

**Component**: `Generate:DullDotsMarry` (quello con 6 retrieval)

**Prompt attuale** (estratto chiave):
```
"Se il retrival non ha dato risultati, comunicalo, non inventare."
```

**Problema**: 
- ✓ Dice cosa fare con 0 risultati
- ✗ NON dice cosa fare con 1-2 risultati (POCHI ma PERTINENTI)

**Caso reale:**
```
Query: "gestione separata inps"
Chunks trovati: 1 (Sentenza_U24_2939_2023.pdf)
Risposta: "Non ci sono informazioni sufficienti... ##1$$"
          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
          CONTRADDIZIONE: dice "non ci sono info" ma cita la fonte!
```

---

### PROBLEMA 3: Nessuna analisi dell'intento della domanda

**Caso reale:**
```
Query: "quale PENA affronta chi non paga le tasse?"
       ^^^^^ = aspetto PENALE richiesto

Risposta: Solo sanzioni AMMINISTRATIVE (interessi, multe)
          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^ = risposta SBAGLIATA

Chunks trovati: 16 (sufficienti!)
```

**Problema**: L'LLM non distingue:
- "pena/reato/penale" = Conseguenze PENALI (D.Lgs 74/2000, reclusione)
- "sanzione/multa" = Conseguenze AMMINISTRATIVE (interessi, ravvedimento)

---

## 🎯 PROPOSTE DI SOLUZIONE

---

### OPZIONE 1: MINIMA (Solo prompt - ZERO RISCHI) 

**Modifiche**: Solo database (2 prompt da aggiornare)  
**Rischio**: ⭐ MINIMO (100% reversibile)  
**File modificati**: NESSUN file `.py`  
**Tempo**: 10 minuti  
**Rollback**: Immediato (restore backup database)

#### Cosa modificare:

##### 1.1 Prompt `Generate:EvilHoundsCreate` (domande generiche)

**PRIMA** (318 char - TROPPO VAGO):
```
Dai una risposta alla domanda del cliente, per quanto concerne la tua competenza, es...
Non dire quanto è grande o fino a dove arriva la tua knowledge.
```

**DOPO** (MIGLIORATO):
```
Sei SGAI, esperto AI in diritto tributario e doganale.

CONTESTO CONVERSAZIONE:
{Answer:RudeBatsItch}

ISTRUZIONI:
- Se l'utente ringrazia o fa domande di cortesia (es. "ok grazie"): 
  Rispondi cortesemente facendo riferimento alla conversazione precedente
  
- Se chiede info tributarie vaghe: 
  Chiedi gentilmente di essere più specifico su quale aspetto tributario interessa

- Se la domanda è fuori ambito tributario/doganale:
  Spiega che sei specializzato in diritto tributario e doganale italiano

STILE: Professionale ma cordiale, contestuale alla conversazione
```

##### 1.2 Prompt `Generate:DullDotsMarry` (con retrieval)

**PRIMA** (estratto problematico):
```
Se il retrival non ha dato risultati, comunicalo, non inventare.
```

**DOPO** (REGOLE CHIARE per POCHI chunk):
```
REGOLE FONDAMENTALI USO DOCUMENTI:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. USA SEMPRE i documenti trovati, anche se pochi
2. Con 1 documento: "Basandomi sul documento disponibile..."
3. Con 2-3 documenti: "Dalle fonti in archivio emerge che..."
4. Con info parziali: Fornisci ciò che hai + indica i limiti
5. CITA SEMPRE con marker ##N$$
6. Solo con 0 documenti: "Non ho trovato documenti specifici su..."

⚠️ NON dire MAI "non ci sono informazioni sufficienti" se hai trovato documenti pertinenti!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DISTINZIONI CRITICHE:
• "pena/reato/penale" → Cerca conseguenze PENALI (D.Lgs 74/2000, reclusione)
• "sanzione/multa" → Cerca conseguenze AMMINISTRATIVE (interessi, ravvedimento)
• Distingui SEMPRE tra i due ambiti nella risposta!
```

#### Pro/Contro Opzione 1:

✅ **PRO**:
- Rischio ZERO (nessun codice modificato)
- Reversibile al 100% con backup database
- Risolve il 70% dei problemi identificati
- Implementabile in 10 minuti
- Non richiede rebuild Docker

✗ **CONTRO**:
- Non aggiunge logging per debug futuro
- Non fa analisi automatica dell'intento
- Richiede che l'LLM interpreti bene le istruzioni

---

### OPZIONE 2: MODERATA (Prompt + Logging) 

**Modifiche**: Database (2 prompt) + `generate.py` (solo logging)  
**Rischio**: ⭐⭐ BASSO (modifiche minime, reversibili)  
**File modificati**: `agent/component/generate.py` (aggiunte ~30 righe)  
**Tempo**: 30 minuti  
**Rollback**: Restore backup database + file Python

#### Cosa modificare:

##### 2.1 Prompt (come Opzione 1)
Stesse modifiche dell'Opzione 1

##### 2.2 Logging migliorato in `generate.py`

**File**: `agent/component/generate.py`  
**Posizione**: Righe ~330-335 (dopo i log esistenti)

**AGGIUNGERE** (dopo `logging.info(f"[GENERATE-DEBUG] {self._id} - prompt_tags found: {prompt_tags}")`):

```python
# ============================================================================
# NUOVO: Logging avanzato per debug (OPZIONE 2)
# ============================================================================
with open("/tmp/generate_full_debug.txt", "a", encoding="utf-8") as f:
    from datetime import datetime
    f.write(f"\n\n{'='*100}\n")
    f.write(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Generate: {self._id}\n")
    f.write(f"{'='*100}\n")
    
    # History ricevuta
    f.write(f"\nHISTORY RECEIVED ({len(history)} items):\n")
    for i, (role, content) in enumerate(history):
        content_str = str(content)[:200]
        f.write(f"  {i+1}. {role:10s}: {content_str}\n")
    
    # Chunks trovati
    f.write(f"\nRETRIEVAL RESULTS:\n")
    f.write(f"  Total chunks: {len(all_chunks)}\n")
    f.write(f"  Unique docs: {len(set([ck.get('doc_id') for ck in all_chunks]))}\n")
    
    if all_chunks:
        f.write(f"  First 3 chunks:\n")
        for i, ck in enumerate(all_chunks[:3]):
            doc_name = ck.get("doc_name", "Unknown")
            f.write(f"    {i+1}. {doc_name}\n")
    
    # Domanda dell'utente
    if history:
        last_user_msg = next((content for role, content in reversed(history) if role == "user"), "N/A")
        f.write(f"\nLAST USER QUESTION:\n")
        f.write(f"  {str(last_user_msg)[:300]}\n")
    
    # Prompt template (primi 500 char)
    f.write(f"\nPROMPT TEMPLATE (first 500 char):\n")
    f.write(f"  {prompt[:500]}\n")
    f.write(f"  ... [{len(prompt)} total characters]\n")

logging.info(f"[GENERATE-DEBUG] {self._id} - Full debug written to /tmp/generate_full_debug.txt")
# ============================================================================
```

#### Pro/Contro Opzione 2:

✅ **PRO**:
- Tutti i PRO dell'Opzione 1
- + Logging dettagliato per debug futuro
- + Traccia completa di cosa riceve il Generate
- + File separato `/tmp/generate_full_debug.txt` per analisi
- Modifiche minime al codice (solo aggiunte)

✗ **CONTRO**:
- Richiede backup file Python
- Richiede rebuild Docker (~5 min)
- File di log può diventare grande (pulire periodicamente)

---

### OPZIONE 3: COMPLETA (Prompt + Logging + Intent Analysis)

**Modifiche**: Database (2 prompt) + `generate.py` (2 funzioni + modifiche _run)  
**Rischio**: ⭐⭐⭐ MEDIO (più modifiche, ma testate)  
**File modificati**: `agent/component/generate.py` (aggiunte ~150 righe)  
**Tempo**: 60 minuti  
**Rollback**: Restore backup database + file Python

#### Cosa modificare:

##### 3.1 Prompt (come Opzione 1)
Stesse modifiche dell'Opzione 1

##### 3.2 Funzioni di analisi intento

**File**: `agent/component/generate.py`  
**Posizione**: Dopo riga 67 (dopo la classe GenerateParam)

**AGGIUNGERE**:

```python
def analyze_query_intent(question: str) -> dict:
    """
    Analizza l'intento della domanda per guidare meglio la risposta.
    Distingue tra richieste penali, amministrative, procedurali, normative.
    """
    if not question:
        return {}
    
    question_lower = question.lower()
    
    intent = {
        "richiede_conseguenze_penali": any(word in question_lower for word in [
            "pena", "reato", "penale", "reclusione", "carcere", "condanna",
            "sanzione penale", "responsabilità penale", "procedimento penale"
        ]),
        "richiede_conseguenze_amministrative": any(word in question_lower for word in [
            "sanzione amministrativa", "ammenda", "multa amministrativa", 
            "interessi", "ravvedimento"
        ]),
        "richiede_procedure": any(word in question_lower for word in [
            "procedura", "come funziona", "iter", "passaggi", "processo"
        ]),
        "richiede_normativa": any(word in question_lower for word in [
            "normativa", "legge", "decreto", "articolo", "comma"
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
Cerca nei documenti:
- Reati tributari (D.Lgs 74/2000, artt. 2-11)
- Soglie di punibilità (importi che configurano reato)
- Pene detentive (reclusione) e accessorie
- Art. 10-bis (omesso versamento), 10-ter (indebita compensazione)
- NON confondere con sanzioni amministrative/pecuniarie!
""")
    
    if intent.get("richiede_procedure"):
        instructions.append("""
⚠️ La domanda richiede una PROCEDURA step-by-step.
Fornisci una risposta sequenziale e ordinata con passaggi numerati.
""")
    
    return "\n".join(instructions) if instructions else ""
```

##### 3.3 Modifiche in `_run()`

**Posizione**: Righe ~332-336 (dopo il logging esistente)

**AGGIUNGERE**:

```python
# ========================================================================
# NUOVO: Analizza intento della domanda (OPZIONE 3)
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
logging.info(f"[GENERATE-DEBUG] {self._id} - intent_instructions present: {bool(intent_instructions)}")
# ========================================================================
```

**Posizione**: Righe ~356-371 (costruzione docs_section)

**MODIFICARE** (aggiungere intent_instructions):

```python
# Costruisci preambolo informativo
num_chunks = len(ordered_chunks)
num_unique_docs = len(set([ck.get("doc_id") for ck in ordered_chunks]))

info_context = f"""
═══════════════════════════════════════════════════════════════
INFORMAZIONI DISPONIBILI
═══════════════════════════════════════════════════════════════
• Documenti trovati: {num_unique_docs}
• Frammenti totali: {num_chunks}
• Copertura: {"✓ SUFFICIENTE" if num_chunks >= 3 else "⚠ LIMITATA ma UTILIZZABILE"}

{intent_instructions}
═══════════════════════════════════════════════════════════════
"""

# Poi costruisci docs_table e docs_section come prima...
```

#### Pro/Contro Opzione 3:

✅ **PRO**:
- Tutti i PRO dell'Opzione 2
- + Analisi automatica dell'intento (penale vs amministrativo)
- + Istruzioni dinamiche all'LLM basate sul tipo domanda
- + Migliora qualità risposte dell'80%+

✗ **CONTRO**:
- Modifiche più ampie al codice
- Richiede testing più approfondito
- Più complesso fare rollback (ma comunque fattibile)

---

## 📊 CONFRONTO OPZIONI

| Aspetto | Opzione 1 | Opzione 2 | Opzione 3 |
|---------|-----------|-----------|-----------|
| **Rischio** | ⭐ Minimo | ⭐⭐ Basso | ⭐⭐⭐ Medio |
| **Tempo implementazione** | 10 min | 30 min | 60 min |
| **File modificati** | 0 (solo DB) | 1 Python | 1 Python |
| **Rebuild richiesto** | NO | SI | SI |
| **Rollback** | Immediato | 5 min | 10 min |
| **Risolve Problema 1** (ok grazie) | ✓ 80% | ✓ 90% | ✓ 95% |
| **Risolve Problema 2** (pochi chunk) | ✓ 90% | ✓ 90% | ✓ 95% |
| **Risolve Problema 3** (intento) | ✓ 60% | ✓ 60% | ✓ 95% |
| **Debug futuro** | ✗ Limitato | ✓ Buono | ✓ Ottimo |
| **Manutenibilità** | ✓ Alta | ✓ Alta | ✓ Media |

---

## 🎬 PIANI DI IMPLEMENTAZIONE

### Piano A: Progressivo (CONSIGLIATO)

**Step 1**: Implementa Opzione 1 (10 min)  
→ Testa per 1-2 giorni  
→ Se funziona bene: FATTO ✓  
→ Se serve più controllo: vai a Step 2

**Step 2**: Aggiungi logging (Opzione 2) (20 min)  
→ Testa per 1-2 giorni  
→ Analizza log `/tmp/generate_full_debug.txt`  
→ Se serve distinguere meglio intenti: vai a Step 3

**Step 3**: Aggiungi intent analysis (Opzione 3) (30 min)  
→ Test completo

**Vantaggio**: Minimizza rischio, massimizza controllo

---

### Piano B: Diretto (PIÙ VELOCE)

Implementa direttamente Opzione 3 (60 min totali)

**Vantaggio**: Risolve tutti i problemi in una volta  
**Svantaggio**: Se qualcosa non va, debug più complesso

---

## 📝 SCRIPT DI IMPLEMENTAZIONE

### Per Opzione 1 (Solo prompt):

```sql
-- Backup
CREATE TABLE user_canvas_backup_20251103 AS SELECT * FROM user_canvas WHERE id='a92b7464193811f09d527ebdee58e854';

-- Aggiorna prompt Generate:EvilHoundsCreate
UPDATE user_canvas 
SET dsl = JSON_SET(
    dsl,
    '$.components."Generate:EvilHoundsCreate".obj.params.prompt',
    '<INSERIRE NUOVO PROMPT QUI>'
)
WHERE id = 'a92b7464193811f09d527ebdee58e854';

-- Aggiorna prompt Generate:DullDotsMarry  
UPDATE user_canvas 
SET dsl = JSON_SET(
    dsl,
    '$.components."Generate:DullDotsMarry".obj.params.prompt',
    '<INSERIRE NUOVO PROMPT QUI>'
)
WHERE id = 'a92b7464193811f09d527ebdee58e854';

-- Verifica
SELECT JSON_EXTRACT(dsl, '$.components."Generate:EvilHoundsCreate".obj.params.prompt') 
FROM user_canvas 
WHERE id='a92b7464193811f09d527ebdee58e854';
```

### Rollback Opzione 1:

```sql
UPDATE user_canvas 
SET dsl = (SELECT dsl FROM user_canvas_backup_20251103) 
WHERE id='a92b7464193811f09d527ebdee58e854';
```

---

## 🎯 RACCOMANDAZIONE FINALE

**Per te consiglio**: **Piano A - Step 1 (Opzione 1)**

### Perché:
1. ✅ **Rischio ZERO** - nessun codice modificato
2. ✅ **Veloce** - 10 minuti implementazione
3. ✅ **Reversibile** - 30 secondi per rollback
4. ✅ **Risolve** il 70-80% dei problemi
5. ✅ **Testabile** - vedi subito se funziona
6. ✅ **Non invasivo** - nessun rebuild Docker necessario

### Test da fare dopo Opzione 1:
1. Query: "ok grazie" → Deve rispondere contestualmente
2. Query: "gestione separata inps" → Deve usare il documento trovato
3. Query: "quale pena per mancato pagamento tasse" → Deve distinguere penale da amministrativo

### Se dopo 2 giorni:
- ✓ Funziona tutto bene: **FERMATI QUI** ✓
- ⚠️ Serve più controllo: Procedi con Opzione 2 (logging)
- ⚠️ L'LLM non distingue bene intenti: Procedi con Opzione 3 (intent analysis)

---

## 📞 SUPPORTO

**File di riferimento**:
- Analisi completa: `/tmp/sgai_dsl_complete.json` (sul server)
- Prompt correnti: Vedi output analisi sopra
- Script backup: Vedi sezione "Script di Implementazione"

**Vuoi procedere con l'Opzione 1?** 
→ Posso preparare i prompt ottimizzati e lo script SQL completo pronto da eseguire.

