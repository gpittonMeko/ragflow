"""Download PDF + verifiche + salvataggio atomico in output_dir."""
from __future__ import annotations

import hashlib
import os
from pathlib import Path


def is_pdf_bytes(data: bytes) -> bool:
    return data[:5] == b"%PDF-"


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def make_minimal_pdf(min_bytes: int = 1200) -> bytes:
    """PDF sintetico solo per --simulate (non è una sentenza reale)."""
    core = (
        b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"
        b"1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n"
        b"2 0 obj<< /Type /Pages /Kids [] /Count 0 >>endobj\n"
        b"xref\n0 3\n0000000000 65535 f \n"
        b"trailer<< /Size 3 /Root 1 0 R >>\n"
        b"startxref\n0\n%%EOF\n"
    )
    if len(core) >= min_bytes:
        return core
    return core + (b"%" + b"0" * (min_bytes - len(core) - 1) + b"\n")


def verify_pdf(
    data: bytes,
    *,
    min_bytes: int,
    max_bytes: int,
) -> list[str]:
    errors: list[str] = []
    if len(data) < min_bytes:
        errors.append(f"troppo piccolo: {len(data)} < {min_bytes}")
    if len(data) > max_bytes:
        errors.append(f"troppo grande: {len(data)} > {max_bytes}")
    if not is_pdf_bytes(data):
        errors.append("firma PDF assente (%PDF-)")
        head = data[:200].lstrip().lower()
        if head.startswith(b"<!doctype") or head.startswith(b"<html"):
            errors.append("contenuto HTML invece di PDF")
    return errors


def save_pdf_atomic(dest: Path, data: bytes, *, overwrite: bool = False) -> dict:
    """Scrive via file .tmp poi os.replace. Ritorna info sha/size."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and not overwrite:
        raise FileExistsError(str(dest))
    tmp = dest.with_suffix(dest.suffix + ".tmp")
    tmp.write_bytes(data)
    os.replace(tmp, dest)
    return {
        "path": str(dest),
        "sha256": sha256_bytes(data),
        "size": len(data),
    }


def ingest_pdf_bytes(
    data: bytes,
    dest: Path,
    *,
    min_bytes: int,
    max_bytes: int,
    overwrite: bool = False,
) -> dict:
    errors = verify_pdf(data, min_bytes=min_bytes, max_bytes=max_bytes)
    if errors:
        return {"ok": False, "errors": errors}
    info = save_pdf_atomic(dest, data, overwrite=overwrite)
    return {"ok": True, **info}


def cleanup_tmp_dir(tmp_dir: Path, keep_newest: int = 20) -> int:
    """Non accumulare migliaia di PDF temp: tiene solo i più recenti."""
    if not tmp_dir.exists():
        return 0
    files = sorted(tmp_dir.glob("*"), key=lambda p: p.stat().st_mtime, reverse=True)
    removed = 0
    for path in files[keep_newest:]:
        try:
            if path.is_file():
                path.unlink()
                removed += 1
        except OSError:
            pass
    return removed
