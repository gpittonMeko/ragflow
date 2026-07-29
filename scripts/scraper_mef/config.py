"""Configurazione da env / CLI — nessun path assoluto del PC sviluppatore."""
from __future__ import annotations

import os
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DEFAULT_TMP = ROOT / ".tmp_downloads"
DEFAULT_CHECKPOINT = ROOT / ".checkpoint.json"
DEFAULT_QUEUE = ROOT / ".upload_queue.sqlite3"
DEFAULT_STATE = ROOT / ".service_state.json"
DEFAULT_LOCK = ROOT / ".service.lock"
DEFAULT_CACHE_KEYS = ROOT / "data" / "cache_nomi_base_local.txt"
# Output relativo al modulo; override con MEF_SCRAPER_OUTPUT o --output-dir
DEFAULT_OUTPUT_DIR = ROOT / "downloads_out"
MIN_SEARCH_YEAR = 2021


def parse_search_years(raw: str | None, *, current_year: int | None = None) -> list[int]:
    """Parsa una lista (2026,2025) o un intervallo (2021-2026)."""
    current = int(current_year or datetime.now().year)
    value = (raw or "").strip()
    if not value:
        return list(range(current, MIN_SEARCH_YEAR - 1, -1))
    if "," in value and "-" in value:
        raise ValueError("MEF_SCRAPER_SEARCH_YEARS: usare una lista o un intervallo")
    if "-" in value:
        parts = [part.strip() for part in value.split("-")]
        if len(parts) != 2 or not all(part.isdigit() for part in parts):
            raise ValueError("MEF_SCRAPER_SEARCH_YEARS: intervallo non valido")
        first, last = map(int, parts)
        low, high = sorted((first, last))
        years = list(range(high, low - 1, -1))
    else:
        parts = [part.strip() for part in value.split(",")]
        if not parts or any(not part.isdigit() for part in parts):
            raise ValueError("MEF_SCRAPER_SEARCH_YEARS: lista non valida")
        years = []
        for part in parts:
            year = int(part)
            if year not in years:
                years.append(year)
    invalid = [year for year in years if not MIN_SEARCH_YEAR <= year <= current]
    if invalid:
        raise ValueError(
            f"MEF_SCRAPER_SEARCH_YEARS: anni fuori intervallo "
            f"{MIN_SEARCH_YEAR}..{current}: {invalid}"
        )
    return years


def env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    return int(raw)


def env_float(name: str, default: float) -> float:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    return float(raw)


def env_bool(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


class Config:
    def __init__(self) -> None:
        self.tmp_dir = Path(os.environ.get("MEF_SCRAPER_TMP", str(DEFAULT_TMP)))
        self.checkpoint_path = Path(
            os.environ.get("MEF_SCRAPER_CHECKPOINT", str(DEFAULT_CHECKPOINT))
        )
        self.cache_keys_path = Path(
            os.environ.get("MEF_SCRAPER_CACHE", str(DEFAULT_CACHE_KEYS))
        )
        self.output_dir = Path(
            os.environ.get("MEF_SCRAPER_OUTPUT", str(DEFAULT_OUTPUT_DIR))
        )
        # Concorrenza stub: default 1, hard-cap 2 (non è un worker pool reale)
        self.max_download_concurrency = max(1, min(2, env_int("MEF_SCRAPER_DL_CONCURRENCY", 1)))
        self.max_upload_concurrency = max(1, min(1, env_int("MEF_SCRAPER_UL_CONCURRENCY", 1)))
        self.page_delay_sec = env_float("MEF_SCRAPER_PAGE_DELAY", 25.0)
        self.download_delay_min = env_float("MEF_SCRAPER_DL_DELAY_MIN", 18.0)
        self.download_delay_max = env_float("MEF_SCRAPER_DL_DELAY_MAX", 32.0)
        self.min_pdf_bytes = env_int("MEF_SCRAPER_MIN_PDF_BYTES", 1000)
        self.max_pdf_bytes = env_int("MEF_SCRAPER_MAX_PDF_BYTES", 80_000_000)
        self.upload_enabled = os.environ.get("MEF_SCRAPER_UPLOAD", "0") == "1"
        self.queue_path = Path(os.environ.get("MEF_SCRAPER_QUEUE", str(DEFAULT_QUEUE)))
        self.state_path = Path(os.environ.get("MEF_SCRAPER_STATE", str(DEFAULT_STATE)))
        self.lock_path = Path(os.environ.get("MEF_SCRAPER_LOCK", str(DEFAULT_LOCK)))
        self.worker_id = os.environ.get("MEF_SCRAPER_WORKER_ID", os.uname().nodename if hasattr(os, "uname") else "mef-scraper")
        self.sgai_base_url = os.environ.get("SGAI_BASE_URL", "https://sgailegal.com").rstrip("/")
        self.sgai_worker_token = os.environ.get("SGAI_SCRAPER_API_TOKEN", "")
        self.sgai_wake_url = os.environ.get(
            "SGAI_WAKE_URL",
            "https://91k2hfw1n3.execute-api.eu-north-1.amazonaws.com/wake-up",
        )
        self.sgai_wake_target = os.environ.get("SGAI_WAKE_TARGET", "SGAI-Production")
        self.http_timeout = env_float("MEF_SCRAPER_HTTP_TIMEOUT", 20.0)
        self.http_retries = max(0, env_int("MEF_SCRAPER_HTTP_RETRIES", 2))
        self.retry_base = max(0.1, env_float("MEF_SCRAPER_RETRY_BASE", 5.0))
        self.retry_max = max(self.retry_base, env_float("MEF_SCRAPER_RETRY_MAX", 1800.0))
        self.max_attempts = max(1, env_int("MEF_SCRAPER_MAX_ATTEMPTS", 8))
        self.claim_lease_sec = max(30, env_int("MEF_SCRAPER_CLAIM_LEASE", 600))
        self.upload_batch_size = max(1, env_int("MEF_SCRAPER_UPLOAD_BATCH", 1))
        self.progress_poll_sec = max(1.0, env_float("MEF_SCRAPER_PROGRESS_POLL", 30.0))
        self.heartbeat_sec = max(5.0, env_float("MEF_SCRAPER_HEARTBEAT_INTERVAL", 60.0))
        self.wake_cooldown_sec = max(10.0, env_float("MEF_SCRAPER_WAKE_COOLDOWN", 180.0))
        self.wake_wait_sec = max(1.0, env_float("MEF_SCRAPER_WAKE_WAIT", 360.0))
        self.service_poll_sec = max(1.0, env_float("MEF_SCRAPER_SERVICE_POLL", 15.0))
        self.cycle_interval_sec = max(1.0, env_float("MEF_SCRAPER_CYCLE_INTERVAL", 3600.0))
        self.blocked_backoff_sec = max(60.0, env_float("MEF_SCRAPER_BLOCKED_BACKOFF", 21600.0))
        self.cycle_max_downloads = max(1, env_int("MEF_SCRAPER_CYCLE_MAX", 10000))
        self.max_spool_bytes = max(0, env_int("MEF_SCRAPER_MAX_SPOOL_BYTES", 20 * 1024**3))
        self.min_free_bytes = max(0, env_int("MEF_SCRAPER_MIN_FREE_BYTES", 2 * 1024**3))
        self.cdp_url = os.environ.get("MEF_SCRAPER_CDP_URL", "http://127.0.0.1:9222")
        self.browser_profile = os.environ.get("MEF_SCRAPER_BROWSER_PROFILE", "")
        self.browser_start_url = os.environ.get(
            "MEF_SCRAPER_START_URL",
            "https://bancadatigiurisprudenza.giustiziatributaria.gov.it/ricerca",
        )
        self.browser_headless = env_bool("MEF_SCRAPER_BROWSER_HEADLESS", True)
        self.search_years = parse_search_years(
            os.environ.get("MEF_SCRAPER_SEARCH_YEARS")
        )

    def default_server_caches(self) -> list[Path]:
        """
        Cache server solo da env MEF_SCRAPER_SERVER_CACHES (path separati da ';')
        più il file locale del modulo. Nessun path assoluto hardcoded.
        """
        paths: list[Path] = []
        env_list = os.environ.get("MEF_SCRAPER_SERVER_CACHES", "")
        if env_list.strip():
            paths.extend(Path(p.strip()) for p in env_list.split(";") if p.strip())
        paths.append(self.cache_keys_path)
        return paths
