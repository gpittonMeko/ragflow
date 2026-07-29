"""Utility canoniche condivise per i provvedimenti tributari SGAI."""
from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path
from typing import Any

STATUS_DONE = "done"
TIPI_PROVVEDIMENTO = ("Sentenza", "Ordinanza", "Decreto")
_TIPO_BY_LOWER = {tipo.lower(): tipo for tipo in TIPI_PROVVEDIMENTO}
_CODICI_PATH = Path(__file__).resolve().parents[2] / "scripts" / "scraper_mef" / "data" / "codici_corte.json"


def _load_codici() -> dict[str, str]:
    try:
        data = json.loads(_CODICI_PATH.read_text(encoding="utf-8"))
        return data.get("corteToCodice") or {}
    except (OSError, ValueError, TypeError):
        return {}


CODICI_CORTE = _load_codici()
CODICE_TO_CORTE: dict[str, dict[str, str]] = {}
for corte_key, codice in CODICI_CORTE.items():
    grado, *rest = corte_key.split("_", 1)
    denominazione = rest[0].replace("_", " ") if rest else corte_key
    CODICE_TO_CORTE[codice.upper()] = {
        "codice": codice.upper(),
        "grado": grado.replace("1°", "1").replace("2°", "2"),
        "gradoLabel": grado.replace("1°", "1° grado").replace("2°", "2° grado"),
        "denominazione": denominazione,
        "corteKey": corte_key,
    }

PROVVEDIMENTO_RE = re.compile(
    r"^(Sentenza|Ordinanza|Decreto)_([A-Z0-9]+)_(\d+)_(\d{4})"
    r"(?:\s*-\s*.+)?(?:\s*\(\d+\))?\.pdf$",
    re.IGNORECASE,
)
# Compatibilità per import legacy.
SENTENZA_RE = PROVVEDIMENTO_RE


def normalize_tipo(tipo: str | None) -> str | None:
    return _TIPO_BY_LOWER.get((tipo or "Sentenza").strip().lower())


def nome_base(nome_file: str) -> str:
    """Rimuove estensione, suffisso download e copia ``(n)`` senza alterare il tipo."""
    base = (nome_file or "").strip()
    base = base.split(" - ")[0].strip()
    base = re.sub(r"\.pdf$", "", base, flags=re.IGNORECASE)
    base = re.sub(r"\s*\(\d+\)\s*$", "", base)
    return re.sub(r"\s+", " ", base)


def build_nome_base(
    codice: str, numero: str | int, anno: str | int, tipo: str = "Sentenza"
) -> str:
    tipo_norm = normalize_tipo(tipo)
    if not tipo_norm:
        raise ValueError("tipo must be Sentenza, Ordinanza or Decreto")
    codice_norm = (codice or "").strip().upper()
    numero_norm, anno_norm = str(numero).strip(), str(anno).strip()
    if not re.fullmatch(r"[A-Z0-9]+", codice_norm):
        raise ValueError("codice non valido")
    if not re.fullmatch(r"\d+", numero_norm) or not re.fullmatch(r"\d{4}", anno_norm):
        raise ValueError("numero o anno non valido")
    return f"{tipo_norm}_{codice_norm}_{numero_norm}_{anno_norm}"


def parse_sentenza_name(nome_file: str) -> dict[str, Any] | None:
    """Parser storico, ora valido per tutti i tre tipi canonici."""
    base = nome_base(nome_file)
    match = re.fullmatch(
        r"(Sentenza|Ordinanza|Decreto)_([A-Z0-9]+)_(\d+)_(\d{4})",
        base,
        re.IGNORECASE,
    )
    if not match:
        return None
    tipo = normalize_tipo(match.group(1))
    codice, numero, anno = match.group(2).upper(), match.group(3), match.group(4)
    canonical = build_nome_base(codice, numero, anno, tipo or "")
    corte = CODICE_TO_CORTE.get(codice)
    return {
        "nomeBase": canonical,
        "tipo": tipo,
        "codice": codice,
        "numero": numero,
        "anno": anno,
        "corte": corte,
        "humanLabel": (
            f"{tipo} CGT {corte['denominazione']} – {corte['gradoLabel']} n. {numero}/{anno}"
            if corte else None
        ),
    }


parse_provvedimento_name = parse_sentenza_name


def resolve_lookup_key(
    nome_file: str = "",
    nome_base_param: str = "",
    codice: str = "",
    numero: str = "",
    anno: str = "",
    tipo: str = "Sentenza",
) -> str | None:
    candidate = nome_base_param or nome_file
    if candidate:
        parsed = parse_sentenza_name(candidate)
        return parsed["nomeBase"] if parsed else None
    if codice and numero and anno:
        try:
            return build_nome_base(codice, numero, anno, tipo)
        except ValueError:
            return None
    return None


def _normalize_portal_place(place: str) -> str:
    text = (place or "").strip().upper().replace("Â°", "").replace("°", "")
    text = text.replace("-", "_")
    text = re.sub(r"\s+", "_", text)
    return re.sub(r"_+", "_", text).strip("_")


def corte_portale_to_codice(corte_portale: str) -> str | None:
    corte = (corte_portale or "").replace("Â°", "°").strip()
    match = re.match(r"CGT\s*(1|2)[°º]?\s+(.+)", corte, re.IGNORECASE)
    if not match:
        return None
    key = f"{match.group(1)}°_{_normalize_portal_place(match.group(2))}"
    return next((v for k, v in CODICI_CORTE.items() if k.upper() == key.upper()), None)


def build_filename_from_portal(
    corte_portale: str,
    numero: str | int,
    anno: str | int,
    tipo: str = "Sentenza",
) -> dict[str, Any]:
    codice, tipo_norm = corte_portale_to_codice(corte_portale), normalize_tipo(tipo)
    if not codice or not tipo_norm:
        return {"ok": False, "error": "Corte o tipo non valido", "cortePortale": corte_portale}
    base = build_nome_base(codice, numero, anno, tipo_norm)
    return {
        "ok": True, "tipo": tipo_norm, "codice": codice, "numero": str(numero),
        "anno": str(anno), "nomeBase": base, "nomeFile": f"{base}.pdf",
        "cortePortale": corte_portale, "corte": CODICE_TO_CORTE.get(codice),
    }


def parse_portal_row(numero, anno, corte_portale, tipo="Sentenza") -> dict[str, Any]:
    return build_filename_from_portal(corte_portale, numero, anno, tipo)


def parse_portal_title(title: str) -> dict[str, Any] | None:
    raw = (title or "").strip()
    match = re.search(
        r"n\.?\s*(\d+)\s*/\s*(\d{4})\s+CGT\s*(1|2)\s*[°º]?\s*(.+)$",
        raw, re.IGNORECASE,
    )
    if not match:
        return None
    tipo_match = re.search(r"\b(sentenza|ordinanza|decreto)\b", raw, re.IGNORECASE)
    tipo = tipo_match.group(1) if tipo_match else "Sentenza"
    result = build_filename_from_portal(
        f"CGT {match.group(3)}° {match.group(4).strip()}",
        match.group(1), match.group(2), tipo,
    )
    result["portalTitle"] = raw
    return result


def build_manifest_index(rows: list[dict[str, Any]]) -> dict[str, Any]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    status_map = {"0": "unstart", "1": "running", "2": "cancel", "3": "done", "4": "fail"}
    for row in rows:
        name = str(row.get("name") or row.get("nome_file") or "").strip()
        parsed = parse_sentenza_name(name)
        if not parsed:
            continue
        status = row.get("status")
        if status not in {"unstart", "running", "cancel", "done", "fail"}:
            # In Document.status, "1" means a valid DB row, not parsing RUNNING.
            status = status_map.get(str(row.get("run", "0")), "unknown")
        has_embedding = row.get("hasEmbedding")
        if has_embedding is None:
            has_embedding = int(row.get("chunk_num") or row.get("chunkNum") or 0) > 0
        groups[parsed["nomeBase"].lower()].append({
            "id": row.get("id", ""), "name": name, "nomeBase": parsed["nomeBase"],
            "status": status, "hasEmbedding": bool(has_embedding),
            "chunkNum": row.get("chunk_num") or row.get("chunkNum") or 0,
        })
    index = {}
    for key, files in groups.items():
        best = next((f for f in files if f["status"] == STATUS_DONE and f["hasEmbedding"]), None)
        best = best or next((f for f in files if f["status"] == STATUS_DONE), None) or files[0]
        index[key] = {
            "nomeBase": files[0]["nomeBase"], "copies": len(files),
            "isDuplicate": len(files) > 1,
            "hasDone": any(f["status"] == STATUS_DONE for f in files),
            "hasEmbedding": any(f["hasEmbedding"] for f in files),
            "bestFile": best, "files": files,
            "parsed": parse_sentenza_name(files[0]["name"]),
        }
    return {
        "totalFiles": sum(len(v) for v in groups.values()),
        "uniqueBase": len(index),
        "duplicateGroups": sum(1 for v in groups.values() if len(v) > 1),
        "index": index,
    }


def lookup_in_manifest(manifest: dict[str, Any], lookup_key: str) -> dict[str, Any]:
    entry = manifest.get("index", {}).get(lookup_key.lower())
    if not entry:
        return {
            "has": False, "nomeBase": lookup_key, "parsed": parse_sentenza_name(lookup_key),
            "copies": 0, "isDuplicate": False, "hasDone": False,
            "hasEmbedding": False, "files": [], "bestFile": None,
            "shouldUpload": True,
        }
    result = dict(entry)
    result["has"] = True
    result["shouldUpload"] = False
    return result
