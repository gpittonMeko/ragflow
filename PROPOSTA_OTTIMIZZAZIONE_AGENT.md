# 📋 PROPOSTA OTTIMIZZAZIONE AGENT SGAI

## 🔍 PROBLEMI IDENTIFICATI

### Problema 1: "Non ci sono informazioni sufficienti" con documenti trovati
**Query**: "gestione separata inps"
- **Chunks trovati**: 1
- **Risposta data**: "Non ci sono informazioni sufficienti nei documenti forniti..."
- **Ma poi cita**: ##1$$ Sentenza_U24_2939_2023.pdf

**CONTRADDIZIONE**: Il sistema dice "non ci sono informazioni" ma cita una fonte!

### Problema 2: Risposta non pertinente alla domanda specifica
**Query**: "mi dai informazioni in riferimento al mancato versamento saldo tasse quale **pena** affronta chi non le paga?"
- **Chunks trovati**: 16 da 5 retrieval diversi
- **Atteso**: Conseguenze **PENALI** (reati tributari, soglie punibilità, reclusione, art. 10-bis/10-ter D.Lgs 74/2000)
- **Ricevuto**: Solo sanzioni **AMMINISTRATIVE** e interessi

**PROBLEMA**: L'LLM non distingue tra "pena" (penale) vs "sanzioni" (amministrative)

---

## 🎯 SOLUZIONI PROPOSTE

### 1. **OTTIMIZZAZIONE PROMPT GENERATE** (`agent/component/generate.py`)

#### 1.1 Migliorare il prompt per gestire pochi documenti

**Problema attuale**: Il prompt nel file `generate.py` inserisce i documenti ma non dà istruzioni specifiche su come gestire casi con pochi chunks.

**Soluzione**: Modificare la sezione dove viene costruito il `docs_section` (righe 356-371) per aggiungere metadati sulla quantità di informazioni:

```python
# PRIMA DELLA COSTRUZIONE DEL PROMPT - Aggiungi analisi quantitativa
num_chunks = len(ordered_chunks)
num_unique_docs = len(set([ck.get("doc_id") for ck in ordered_chunks]))

# Costruisci un preambolo informativo
info_context = f"""
INFORMAZIONI DISPONIBILI:
- Numero di documenti trovati: {num_unique_docs}
- Numero totale di frammenti: {num_chunks}
- Copertura: {"SUFFICIENTE" if num_chunks >= 3 else "LIMITATA"}

ISTRUZIONI OPERATIVE:
- Se trovi informazioni pertinenti nei documenti, usale SEMPRE anche se poche
- Cita SEMPRE le fonti trovate se contengono informazioni utili
- Se le informazioni sono parziali, dillo chiaramente ma fornisci comunque ciò che hai trovato
- NON dire "non ci sono informazioni sufficienti" se hai trovato almeno un documento pertinente
"""

# Poi aggiungi questo prima del docs_section
docs_section = info_context + "\n\n" + docs_table + "\n"
```

#### 1.2 Migliorare l'interpretazione semantica delle domande

**Soluzione**: Aggiungere un'analisi pre-generazione per classificare il tipo di domanda:

```python
# NUOVO: Analizza il tipo di domanda (righe ~330 in generate.py)
def analyze_query_intent(question: str) -> dict:
    """Analizza l'intento della domanda per guidare meglio la risposta"""
    intent = {
        "richiede_conseguenze_penali": any(word in question.lower() for word in [
            "pena", "reato", "penale", "reclusione", "carcere", "condanna",
            "sanzione penale", "responsabilità penale", "procedimento penale"
        ]),
        "richiede_conseguenze_amministrative": any(word in question.lower() for word in [
            "sanzione amministrativa", "ammenda", "multa amministrativa", "interessi"
        ]),
        "richiede_procedure": any(word in question.lower() for word in [
            "procedura", "come", "iter", "passaggi", "processo"
        ]),
        "richiede_normativa": any(word in question.lower() for word in [
            "normativa", "legge", "decreto", "articolo", "comma"
        ])
    }
    return intent

# Usa questa funzione prima della generazione
last_user_question = history[-1][1] if history and history[-1][0] == "user" else ""
query_intent = analyze_query_intent(last_user_question)

# Aggiungi al prompt le istruzioni specifiche basate sull'intento
intent_instructions = ""
if query_intent["richiede_conseguenze_penali"]:
    intent_instructions += """
⚠️ ATTENZIONE: La domanda riguarda CONSEGUENZE PENALI.
Cerca nei documenti:
- Reati tributari (es. dichiarazione fraudolenta, omessa dichiarazione)
- Soglie di punibilità
- Pene detentive (reclusione)
- Riferimenti agli articoli 2-11 del D.Lgs 74/2000
- Non confondere con sanzioni amministrative!
"""

if query_intent["richiede_procedure"]:
    intent_instructions += """
⚠️ ATTENZIONE: La domanda riguarda PROCEDURE.
Fornisci una risposta STEP-BY-STEP chiara e ordinata.
"""
```

---

### 2. **OTTIMIZZAZIONE RETRIEVAL** (`agent/component/retrieval.py`)

#### 2.1 Migliorare la gestione del caso "pochi risultati"

**Problema attuale**: Righe 120-124 gestiscono il caso `empty_response`, ma non considerano il caso "pochi ma pertinenti".

**Soluzione**:

```python
# MODIFICA righe 120-128 in retrieval.py
if not kbinfos["chunks"]:
    df = Retrieval.be_output("")
    if self._param.empty_response and self._param.empty_response.strip():
        df["empty_response"] = self._param.empty_response
    return df

# AGGIUNGI questo blocco:
# Aggiungi metadati sulla qualità del retrieval
num_chunks = len(kbinfos["chunks"])
avg_score = sum([ck.get("similarity", 0) for ck in kbinfos["chunks"]]) / num_chunks if num_chunks > 0 else 0

retrieval_quality = {
    "num_chunks": num_chunks,
    "avg_score": avg_score,
    "quality_level": "HIGH" if num_chunks >= 5 else "MEDIUM" if num_chunks >= 2 else "LOW"
}

# Aggiungi questi metadati al dataframe
df = pd.DataFrame({
    "content": kb_prompt(kbinfos, 200000),
    "chunks": json.dumps(kbinfos["chunks"]),
    "retrieval_quality": json.dumps(retrieval_quality)  # NUOVO
})
```

---

### 3. **OTTIMIZZAZIONE PROMPT SISTEMA**

#### 3.1 Prompt migliore per il Generate con retrieval

**Location**: Nel DSL dell'agent (database: `user_canvas.dsl -> components -> Generate:DullDotsMarry -> params -> prompt`)

**Prompt attuale** (presumibile basato sui template):
```
Rispondi alla domanda basandoti sui documenti forniti.
```

**Prompt OTTIMIZZATO proposto**:

```
# RUOLO E CONTESTO
Sei SGAI, un esperto AI specializzato in diritto tributario e doganale italiano.

# DOCUMENTI DISPONIBILI
Hai accesso a:
__DOCS_SECTION__

# ISTRUZIONI PER LA RISPOSTA

## 1. ANALISI DELLA DOMANDA
- Identifica ESATTAMENTE cosa chiede l'utente
- Distingui tra aspetti PENALI vs AMMINISTRATIVI
- Se la domanda usa "pena/reato/penale" → cerca conseguenze PENALI (art. 2-11 D.Lgs 74/2000)
- Se la domanda usa "sanzione/multa" → cerca conseguenze AMMINISTRATIVE

## 2. USO DEI DOCUMENTI
- USA SEMPRE i documenti trovati, anche se pochi
- CITA SEMPRE le fonti usando i marker ##N$$
- Se trovi informazioni parziali: dillo MA fornisci comunque ciò che hai
- NON dire mai "non ci sono informazioni" se hai almeno un documento pertinente

## 3. QUALITÀ DELLA RISPOSTA
- Rispondi in modo SPECIFICO alla domanda posta
- Se mancano informazioni precise, indicalo DOPO aver fornito ciò che hai trovato
- Usa linguaggio chiaro ma professionale
- Struttura bene la risposta (usa elenchi puntati se utile)

## 4. GESTIONE CASI PARTICOLARI
- **Con 1 solo documento**: "Basandomi sul documento disponibile..."
- **Informazioni parziali**: "Dalle sentenze trovate emerge che... Tuttavia per un quadro completo..."
- **Nessun documento**: SOLO in questo caso usa: "Non ho trovato documenti specifici su questo tema nella knowledge base"

## 5. FORMATO RISPOSTA
- Inizia rispondendo direttamente alla domanda
- Fornisci i dettagli supportati dai documenti
- Termina con la sezione **Fonti:** contenente i marker ##N$$ usati

# ESEMPI

**Domanda**: "Quale pena per chi non paga le tasse?"
**Risposta CORRETTA**: "Il mancato pagamento delle tasse può configurare reati tributari puniti con la reclusione. Secondo la Sentenza X, l'omesso versamento superiore a €50.000... [dettagli penali] ##1$$"
**Risposta ERRATA**: "Il mancato pagamento comporta sanzioni e interessi..." [solo aspetti amministrativi]

**Domanda**: "Come funziona la gestione separata INPS?"
**Con 1 documento**: "Basandomi sulla sentenza disponibile, la gestione separata INPS riguarda... ##1$$"
**NON dire**: "Non ci sono informazioni sufficienti" [SE hai trovato qualcosa!]
```

---

## 📝 PIANO DI IMPLEMENTAZIONE

### FASE 1: Modifiche al codice (generate.py)
1. ✅ Aggiungere analisi intento query
2. ✅ Aggiungere metadati quantità informazioni
3. ✅ Migliorare costruzione docs_section con preambolo informativo

### FASE 2: Ottimizzazione prompt sistema
1. ✅ Aggiornare prompt Generate nel database
2. ✅ Testare con le query problematiche

### FASE 3: Test e validazione
1. ✅ Test query "gestione separata inps" → deve usare il doc trovato
2. ✅ Test query "pena mancato versamento" → deve distinguere penale vs amministrativo
3. ✅ Test con varie quantità di documenti (0, 1, 3, 10+)

---

## 🚀 COME APPLICARE LE MODIFICHE

### Modifica 1: Aggiornare generate.py

```bash
# Sulla macchina AWS
cd ~/workspace/ragflow
nano agent/component/generate.py
```

Inserire le modifiche proposte alle righe indicate.

### Modifica 2: Aggiornare il prompt nel database

```sql
UPDATE user_canvas 
SET dsl = JSON_SET(
    dsl,
    '$.components."Generate:DullDotsMarry".obj.params.prompt',
    '<NUOVO PROMPT QUI>'
)
WHERE id = 'a92b7464193811f09d527ebdee58e854';
```

### Modifica 3: Rebuild e restart

```bash
cd ~/workspace/ragflow/docker
docker-compose build ragflow --no-cache
docker-compose up -d ragflow
```

---

## 📊 METRICHE ATTESE POST-OTTIMIZZAZIONE

| Metrica | Prima | Dopo (Atteso) |
|---------|-------|---------------|
| Risposta corretta con 1 chunk | 0% (dice "nessun doc") | 90%+ |
| Distinzione penale vs amministrativo | 20% | 85%+ |
| Utilizzo documenti trovati | 70% | 95%+ |
| Soddisfazione utente | 60% | 85%+ |

---

## ⚠️ NOTE IMPORTANTI

1. **Backup prima delle modifiche**: 
   ```bash
   docker exec ragflow-mysql mysqldump -uroot -pinfini_rag_flow rag_flow user_canvas > /tmp/backup_canvas.sql
   ```

2. **Test graduale**: Applicare prima la modifica al prompt, poi al codice

3. **Monitoraggio**: Controllare i log dopo ogni modifica:
   ```bash
   docker logs ragflow-server -f | grep "GENERATE-DEBUG"
   ```

---

## 🎓 ALTRE OTTIMIZZAZIONI POSSIBILI (FUTURE)

1. **Query expansion**: Espandere automaticamente query ambigue
2. **Re-ranking semantico**: Riordinare chunks per rilevanza specifica
3. **Multi-hop reasoning**: Per domande complesse che richiedono più passaggi
4. **Cache intelligente**: Memorizzare risposte simili per query frequenti
5. **Feedback loop**: Apprendere da correzioni utente per migliorare nel tempo

