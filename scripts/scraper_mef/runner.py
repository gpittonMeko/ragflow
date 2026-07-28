"""Orchestrazione comando `run` (Fase 2): skip A/B/C + download limitato, no upload."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .cache import SkipIndex
from .checkpoint import Checkpoint
from .client import LiveMefClient, MefClient
from .config import Config
from .download import cleanup_tmp_dir, ingest_pdf_bytes, make_minimal_pdf
from .limits import RunLimits
from .logging_utils import setup_logger
from .metrics import Metrics
from .parse import PortalRow, iter_validated
from .upload import UploadDisabledError, enqueue_upload

log = setup_logger()


def _build_index(cfg: Config, output_dir: Path, server_caches: list[Path]) -> SkipIndex:
    files = list(server_caches) if server_caches else cfg.default_server_caches()
    return SkipIndex(output_dir=output_dir, server_cache_files=files, embedded_files=files)


def run_scraper(
    *,
    cfg: Config,
    mode: str,
    max_downloads: int,
    fixture: Path | None,
    output_dir: Path,
    server_caches: list[Path],
    cdp_url: str,
) -> int:
    """
    mode:
      - simulate: usa fixture + PDF sintetico (test pipeline/limiti, no portale)
      - live: CDP browser già aperto sulla pagina risultati MEF
    """
    max_downloads = max(1, int(max_downloads))
    limits = RunLimits(
        max_download_concurrency=cfg.max_download_concurrency,
        delay_min=cfg.download_delay_min,
        delay_max=cfg.download_delay_max,
        page_delay=cfg.page_delay_sec,
    )
    limits.stop.install_signals()

    index = _build_index(cfg, output_dir, server_caches)
    checkpoint = Checkpoint(cfg.checkpoint_path)
    metrics = Metrics()
    cfg.tmp_dir.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)

    results: list[dict[str, Any]] = []
    downloaded_now = 0

    def handle_row(row: PortalRow, row_index: int | None, fetch_bytes) -> bool:
        """True se ha raggiunto max_downloads."""
        nonlocal downloaded_now
        metrics.discovered += 1
        errs = []
        meta = {}
        for r, m, e in iter_validated([row]):
            errs, meta = e, m
        if errs:
            metrics.skipped_invalid += 1
            results.append({"action": "skip_invalid", "errors": errs, "row": row.__dict__})
            return False

        decision = index.decide(meta["nomeBase"])
        item = {
            **decision.to_dict(),
            "nomeFile": meta["nomeFile"],
            "nomeBase": meta["nomeBase"],
        }
        if decision.action == "skip_local":
            metrics.skipped_local += 1
            results.append(item)
            return False
        if decision.action == "skip_server":
            metrics.skipped_server += 1
            results.append(item)
            return False
        if decision.action == "skip_embedded":
            metrics.skipped_embedded += 1
            results.append(item)
            return False

        if limits.stop.should_stop:
            item["action"] = "stopped_before_download"
            results.append(item)
            return True

        if downloaded_now >= max_downloads:
            item["action"] = "would_download_capped"
            metrics.would_download += 1
            results.append(item)
            return True

        dest = output_dir / meta["nomeFile"]
        tmp = cfg.tmp_dir / f"{meta['nomeBase']}.bin"
        try:
            with limits.download_slot():
                log.info(
                    "DOWNLOAD %s (mode=%s, slot concurrency=%s)",
                    meta["nomeFile"],
                    mode,
                    limits.max_download_concurrency,
                )
                data = fetch_bytes(row_index)
                outcome = ingest_pdf_bytes(
                    data,
                    dest,
                    min_bytes=cfg.min_pdf_bytes,
                    max_bytes=cfg.max_pdf_bytes,
                )
            if not outcome.get("ok"):
                metrics.errors += 1
                item.update({"action": "download_error", "errors": outcome.get("errors")})
                results.append(item)
                return False

            metrics.downloaded += 1
            downloaded_now += 1
            checkpoint.mark_processed(meta["nomeBase"])
            index.server_keys.add(meta["nomeBase"].lower())  # evita ridownload in-loop
            item.update(
                {
                    "action": "downloaded",
                    "sha256": outcome["sha256"],
                    "size": outcome["size"],
                    "path": outcome["path"],
                }
            )
            # Upload sempre bloccato in Fase 2 salvo flag esplicito (non consigliato)
            try:
                enqueue_upload(dest, enabled=cfg.upload_enabled)
                metrics.uploaded += 1
            except UploadDisabledError:
                item["upload"] = "disabled"
            except NotImplementedError as exc:
                item["upload"] = f"stub:{exc}"
            results.append(item)
            cleanup_tmp_dir(cfg.tmp_dir, keep_newest=20)
            if downloaded_now < max_downloads and not limits.stop.should_stop:
                limits.pause_between_downloads(log=lambda m: log.info(m))
            return downloaded_now >= max_downloads
        except Exception as exc:
            metrics.errors += 1
            item.update({"action": "download_error", "error": str(exc)[:300]})
            results.append(item)
            log.error("errore download: %s", exc)
            return False

    if mode == "simulate":
        if not fixture or not fixture.exists():
            log.error("simulate richiede --fixture esistente")
            return 2
        rows = MefClient().rows_from_fixture(fixture)
        for i, row in enumerate(rows):
            if limits.stop.should_stop:
                break
            done = handle_row(
                row,
                i,
                fetch_bytes=lambda _idx: make_minimal_pdf(cfg.min_pdf_bytes),
            )
            if done:
                break
    elif mode == "live":
        log.info("LIVE: connessione CDP %s (browser già aperto sulla lista risultati)", cdp_url)
        try:
            with LiveMefClient(cdp_url=cdp_url) as client:
                rows = client.current_rows()
                if not rows:
                    log.error("Nessuna riga tabella sulla tab MEF — fai prima una Ricerca nel browser")
                    return 2
                # mappa indice link ≈ indice riga valida
                for i, row in enumerate(rows):
                    if limits.stop.should_stop:
                        break

                    def _fetch(idx: int, _row=row) -> bytes:
                        # trova indice Visualizza corrispondente: usa i
                        return client.download_row_pdf(idx, cfg.tmp_dir / f"live_{idx}.pdf")

                    done = handle_row(row, i, fetch_bytes=_fetch)
                    if done:
                        break
        except Exception as exc:
            log.error("LIVE fallito: %s", exc)
            log.error(
                "Avvia Edge/Opera con remote debugging (es. porta 9222) "
                "e lascia aperta la pagina risultati MEF, poi riprova."
            )
            return 2
    else:
        log.error("mode sconosciuta: %s", mode)
        return 2

    payload = {
        "mode": mode,
        "limits": {
            "max_downloads": max_downloads,
            "download_concurrency": limits.max_download_concurrency,
            "delay_min": limits.delay_min,
            "delay_max": limits.delay_max,
            "page_delay": limits.page_delay,
            "upload_enabled": cfg.upload_enabled,
        },
        "output_dir": str(output_dir),
        "sources": index.sources,
        "metrics": metrics.as_dict(),
        "items": results,
        "stopped": limits.stop.should_stop,
    }
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    log.info(
        "run fine: downloaded=%s errors=%s stop=%s",
        metrics.downloaded,
        metrics.errors,
        limits.stop.should_stop,
    )
    return 0 if metrics.errors == 0 else 1
