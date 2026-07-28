# scraper_mef (Fase 2 — locale)

Modulo scraper sentenze MEF **senza upload/requeue in produzione** finché non arriva Gate 2.

## Comandi

Dalla root della repo `ragflow`:

### dry-run (solo skip A/B/C)
```powershell
python -m scripts.scraper_mef dry-run
```

### probe
```powershell
python -m scripts.scraper_mef probe Sentenza_V70_100_2025.pdf
```

### run — simulate (default, sicuro, 1 PDF sintetico)
```powershell
python -m scripts.scraper_mef run --max 1
```
Salva in `scripts/scraper_mef/.tmp_out_simulate` (non sporca `downloads_mef`).

### run — live (browser già aperto + CDP)
```powershell
python -m scripts.scraper_mef run --live --max 1 --cdp http://127.0.0.1:9222
```
Richiede Edge/Opera con remote debugging e pagina risultati MEF aperta.

## Limiti (punto 3)
- download concurrency default **1** (max 2)
- delay tra download 18–32s (env `MEF_SCRAPER_DL_DELAY_*`)
- upload **disabilitato** (`MEF_SCRAPER_UPLOAD=0`)
- Ctrl+C = stop pulito dopo il file corrente
- cleanup tmp (tiene pochi file recenti)

## Skip
- `skip_local` (A) — PDF in `downloads_mef`
- `skip_server` (B) — cache nomi / skip D:
- `skip_embedded` — `|embedded`
- `would_download` / `downloaded` (C)

## Test

```powershell
cd scripts
python -m unittest scraper_mef.tests.test_parse_names scraper_mef.tests.test_cache_skip scraper_mef.tests.test_checkpoint
```

## Mappa corti

File: `data/codici_corte.json` (usato da `portal_to_filename.py` / `names.py`).

## Upload

Disabilitato di default (`MEF_SCRAPER_UPLOAD=0`). Non abilitare senza autorizzazione.
