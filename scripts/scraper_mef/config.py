"""Configurazione da env — nessun segreto hardcoded."""
from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DEFAULT_TMP = ROOT / ".tmp_downloads"
DEFAULT_CHECKPOINT = ROOT / ".checkpoint.json"
DEFAULT_CACHE_KEYS = ROOT / "data" / "cache_nomi_base_local.txt"

# Default tipici sul PC di Matteo (Fase 2 test locale)
DEFAULT_MATTEO_SGAI = Path(r"C:\Users\meko srl\.cursor\Matteo_folder\SGAI")
DEFAULT_OUTPUT_DIR = DEFAULT_MATTEO_SGAI / "downloads_mef"
DEFAULT_SERVER_CACHES = [
    Path(
        r"C:\Users\meko srl\Downloads\SGAI_RAGFlow_pacchetto_collega_2026-07-24_1556"
        r"\pacchetto_collega\dati\cache_nomi_base.txt"
    ),
    DEFAULT_MATTEO_SGAI / "mef_skip_from_d_2025.txt",
    DEFAULT_MATTEO_SGAI / "mef_skip_from_d_all.txt",
]


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
        # Punto 3: default 1; hard-cap a 2 nel RunLimits
        self.max_download_concurrency = max(1, min(2, env_int("MEF_SCRAPER_DL_CONCURRENCY", 1)))
        self.max_upload_concurrency = max(1, min(1, env_int("MEF_SCRAPER_UL_CONCURRENCY", 1)))
        self.page_delay_sec = env_float("MEF_SCRAPER_PAGE_DELAY", 25.0)
        self.download_delay_min = env_float("MEF_SCRAPER_DL_DELAY_MIN", 18.0)
        self.download_delay_max = env_float("MEF_SCRAPER_DL_DELAY_MAX", 32.0)
        self.min_pdf_bytes = env_int("MEF_SCRAPER_MIN_PDF_BYTES", 1000)
        self.max_pdf_bytes = env_int("MEF_SCRAPER_MAX_PDF_BYTES", 80_000_000)
        self.upload_enabled = os.environ.get("MEF_SCRAPER_UPLOAD", "0") == "1"

    def default_server_caches(self) -> list[Path]:
        paths = []
        env_list = os.environ.get("MEF_SCRAPER_SERVER_CACHES", "")
        if env_list.strip():
            paths.extend(Path(p.strip()) for p in env_list.split(";") if p.strip())
        else:
            paths.extend(DEFAULT_SERVER_CACHES)
        # piccolo file locale del modulo (esempi |embedded)
        paths.append(self.cache_keys_path)
        return paths
