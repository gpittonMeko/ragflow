# Admin Scripts

Script di amministrazione per il server di produzione sgailegal.com

## 🔧 Script Disponibili

### Logging e Debug

- **`add_llm_logging.py`** - Aggiunge logging dettagliato alle chiamate LLM
  - Si connette via SSH a sgailegal.com (13.49.16.179)
  - Modifica `agent/component/generate.py` per aggiungere logging
  - Riavvia i container Docker

- **`add_logging_simple.py`** - Versione semplificata del logging LLM
  - Aggiunge logging base senza riavvio

- **`add_openai_logging.py`** - Logging specifico per chiamate OpenAI
  - Logga input completi prima delle chiamate LLM
  - Mostra primi 300 caratteri del system prompt
  - Lista tutti i messaggi con preview

- **`fix_stream_logging.py`** - Aggiunge logging per streaming LLM
  - Monitora le chiamate `chat_streamly`
  - Utile per debug del token streaming

### Database e Prompt

- **`check_current_prompt.py`** - Legge prompt correnti dal database MySQL
  - Query diretta al container `ragflow-mysql`
  - Estrae prompt dal campo JSON `dsl`
  - Mostra primi e ultimi 500 caratteri

- **`check_llm_response.py`** - Verifica risposte LLM dal database
  - Analizza conversazioni salvate
  - Debug delle risposte generate

- **`applica_prompt_v3_sarcastico.py`** - Applica prompt personalizzato
  - Legge da `prompt_evilhounds_v3_sarcastico.txt`
  - Aggiorna il database MySQL
  - Canvas ID: `a92b7464193811f09d527ebdee58e854`

## 🔑 Requisiti

- **SSH Key**: `C:\Users\user\Documents\LLM_14.pem`
- **Server**: ubuntu@13.49.16.179 (sgailegal.com)
- **Python 3.x** sul PC locale

## ⚠️ Attenzione

Questi script modificano codice e database in produzione. Usare con cautela!

## 📝 Uso Tipico

```bash
# Esempio: Aggiungere logging
python scripts/admin/add_openai_logging.py

# Esempio: Controllare prompt corrente
python scripts/admin/check_current_prompt.py

# Esempio: Applicare nuovo prompt
python scripts/admin/applica_prompt_v3_sarcastico.py
```

