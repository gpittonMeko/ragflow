# SGAI scraper MEF

Worker continuativo con spool PDF locale e upload asincrono verso
`/v1/scraper/*`. La disponibilità SGAI non blocca i download: ogni PDF valido
viene prima salvato, poi inserito idempotentemente nella coda SQLite.

## Comandi

```bash
python -m scripts.scraper_mef dry-run
python -m scripts.scraper_mef run --simulate --max 1
python -m scripts.scraper_mef run --live --max 100
python -m scripts.scraper_mef service
python -m scripts.scraper_mef service --once
```

`run --live` attraversa tutte le pagine fino all'ultima o al budget `--max`.
`service` ripete i cicli, conserva checkpoint pagina/riga, applica i limiti
disco, drena batch seriali e segue ogni documento fino a `hasEmbedding=true`.
I PDF non vengono mai eliminati automaticamente. Gli elementi `dead` non sono
riaccodati automaticamente.

Il browser può essere:

- CDP esistente tramite `MEF_SCRAPER_CDP_URL`;
- Chromium Playwright persistente tramite `MEF_SCRAPER_BROWSER_PROFILE`, con
  sessione riutilizzabile e URL iniziale `MEF_SCRAPER_START_URL`.

La prima autenticazione/CAPTCHA può richiedere bootstrap manuale del profilo.
In seguito il servizio non dipende da una tab manuale. Su 403, 429 o CAPTCHA
salva il checkpoint, entra in `blocked` e usa un backoff lungo; non esegue
rotazione VPN/IP.

## Coda e wake

SQLite usa WAL, transazioni `BEGIN IMMEDIATE`, chiave `nome_base` case-insensitive
e lease sugli upload. Un lease scaduto dopo crash torna `pending`. Stati:
`pending`, `uploading`, `uploaded`, `embedding`, `done`, `dead`.

Quando esistono elementi attivi, il worker verifica `progress`, chiama la Lambda
wake se SGAI è offline e ripete il wake rispettando il cooldown. Quando la coda
non ha upload o embedding pendenti non invia altri wake, lasciando lavorare
l'auto-shutdown SGAI.

## Configurazione

Copiare `.env.example`; nessun segreto è incluso. Variabili principali:

- percorsi: `MEF_SCRAPER_OUTPUT`, `MEF_SCRAPER_TMP`,
  `MEF_SCRAPER_CHECKPOINT`, `MEF_SCRAPER_QUEUE`, `MEF_SCRAPER_STATE`,
  `MEF_SCRAPER_LOCK`;
- SGAI: `MEF_SCRAPER_UPLOAD`, `SGAI_BASE_URL`,
  `SGAI_SCRAPER_API_TOKEN`, `SGAI_WAKE_URL`, `SGAI_WAKE_TARGET`;
- retry: `MEF_SCRAPER_HTTP_TIMEOUT`, `MEF_SCRAPER_HTTP_RETRIES`,
  `MEF_SCRAPER_RETRY_BASE`, `MEF_SCRAPER_RETRY_MAX`,
  `MEF_SCRAPER_MAX_ATTEMPTS`, `MEF_SCRAPER_CLAIM_LEASE`;
- loop: `MEF_SCRAPER_UPLOAD_BATCH`, `MEF_SCRAPER_SERVICE_POLL`,
  `MEF_SCRAPER_CYCLE_INTERVAL`, `MEF_SCRAPER_BLOCKED_BACKOFF`,
  `MEF_SCRAPER_CYCLE_MAX`, `MEF_SCRAPER_HEARTBEAT_INTERVAL`,
  `MEF_SCRAPER_WAKE_COOLDOWN`, `MEF_SCRAPER_WAKE_WAIT`;
- portale: `MEF_SCRAPER_DL_DELAY_MIN`, `MEF_SCRAPER_DL_DELAY_MAX`,
  `MEF_SCRAPER_PAGE_DELAY`, `MEF_SCRAPER_BROWSER_PROFILE`,
  `MEF_SCRAPER_START_URL`, `MEF_SCRAPER_BROWSER_HEADLESS`;
- disco/PDF: `MEF_SCRAPER_MAX_SPOOL_BYTES`, `MEF_SCRAPER_MIN_FREE_BYTES`,
  `MEF_SCRAPER_MIN_PDF_BYTES`, `MEF_SCRAPER_MAX_PDF_BYTES`.

L'elenco completo con default è in `.env.example`. Se
`MEF_SCRAPER_UPLOAD=0`, simulate/live restano compatibili e non creano upload.

## Installazione Ubuntu

I file in `deploy/sgai-scraper/` includono unit systemd, env di esempio,
bootstrap venv/Playwright Chromium e script di aggiornamento. Non creano risorse
AWS e non contengono credenziali.

## Test senza rete

```bash
cd scripts
python -m unittest discover -s scraper_mef/tests -v
cd ..
python -m pytest test/test_scraper_app.py -q
```
