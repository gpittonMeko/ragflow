"""Backend SGAI per worker scraper autonomi.

Nessuna migrazione: stato effimero dei worker e lock vivono in Redis; documenti e
task usano esclusivamente i servizi RAGFlow esistenti.
"""
from __future__ import annotations

import hashlib
import hmac
import io
import json
import logging
import os
import re
import threading
import time
import uuid
from functools import wraps

from flask import Blueprint, Response, jsonify, request, session
from werkzeug.datastructures import FileStorage

from api.utils.sentenze_utils import (
    build_manifest_index,
    lookup_in_manifest,
    parse_sentenza_name,
    resolve_lookup_key,
)

manager = globals().get("manager") or Blueprint("scraper", __name__)
page_name = "scraper"

HEARTBEAT_TTL = 180
MAX_REQUEUE = 200
CONTROL_ACTIONS = {"pause", "resume", "stop", "drain"}
WORKER_STATES = {
    "starting", "idle", "running", "error", "stopping",
    "paused", "draining", "waiting", "rate_limited", "blocked", "completed",
}
RUN_NAMES = {"0": "unstart", "1": "running", "2": "cancel", "3": "done", "4": "fail"}
WORKER_REGISTRY = "sgai:scraper:workers"
ADMIN_SESSION_KEY = "sgai_admin_authenticated"
ADMIN_LOGIN_AT_KEY = "sgai_admin_login_at"
ADMIN_SESSION_MAX_AGE = 8 * 60 * 60
_MANIFEST_CACHE = {"expires": 0.0, "data": None, "kb": None}
_MANIFEST_CACHE_LOCK = threading.Lock()
DOCUMENT_LOOKUP_LIMIT = 200
MANIFEST_BATCH_SIZE = 2000


class LockUnavailable(RuntimeError):
    pass


class QueueSubmissionError(RuntimeError):
    def __init__(self, document):
        super().__init__("document created but parsing queue submission failed")
        self.document = document


def _json(data=None, status=200, **extra):
    payload = {"data": data}
    payload.update(extra)
    return jsonify(payload), status


def _bearer_token() -> str:
    value = request.headers.get("Authorization", "")
    match = re.fullmatch(r"Bearer\s+(\S+)", value, re.IGNORECASE)
    return match.group(1) if match else ""


def token_matches(supplied: str, expected: str | None) -> bool:
    """Fail closed e confronto constant-time, anche per stringhe vuote."""
    configured = expected or ""
    candidate = supplied or ""
    matched = hmac.compare_digest(candidate.encode(), configured.encode())
    return bool(configured) and bool(candidate) and matched


def _has_admin_session() -> bool:
    try:
        if not session.get(ADMIN_SESSION_KEY):
            return False
        login_at = float(session.get(ADMIN_LOGIN_AT_KEY, 0))
        if login_at <= 0 or time.time() - login_at > ADMIN_SESSION_MAX_AGE:
            session.clear()
            return False
        return True
    except (RuntimeError, TypeError, ValueError):
        return False


def _has_role(role: str) -> bool:
    supplied = _bearer_token()
    if role == "admin":
        return _has_admin_session() or token_matches(
            supplied, os.getenv("SGAI_ADMIN_API_TOKEN")
        )
    if token_matches(supplied, os.getenv("SGAI_SCRAPER_API_TOKEN")):
        return True
    return role == "authenticated" and (
        _has_admin_session()
        or token_matches(supplied, os.getenv("SGAI_ADMIN_API_TOKEN"))
    )


def require_role(role: str):
    def decorate(func):
        @wraps(func)
        def wrapped(*args, **kwargs):
            if not _has_role(role):
                return _json(None, 401, error="unauthorized")
            return func(*args, **kwargs)
        return wrapped
    return decorate


def canonical_pdf(filename: str) -> tuple[str, str] | None:
    parsed = parse_sentenza_name(filename)
    if not parsed:
        return None
    canonical_name = f"{parsed['nomeBase']}.pdf"
    if filename != canonical_name:
        return None
    return parsed["nomeBase"], canonical_name


def verify_sha256(blob: bytes, supplied: str) -> bool:
    expected = (supplied or "").strip().lower()
    if not re.fullmatch(r"[0-9a-f]{64}", expected):
        return False
    return hmac.compare_digest(hashlib.sha256(blob).hexdigest(), expected)


def validate_pdf(blob: bytes) -> list[str]:
    errors = []
    if not blob.startswith(b"%PDF-"):
        errors.append("PDF header missing")
    if b"%%EOF" not in blob[-4096:]:
        errors.append("PDF EOF missing")
    try:
        from pypdf import PdfReader
    except ImportError:
        return errors + ["pypdf unavailable"]
    try:
        reader = PdfReader(io.BytesIO(blob), strict=False)
        trailer = reader.trailer
        if trailer is None or trailer.get("/Root") is None:
            errors.append("PDF trailer/root missing")
        if reader.root_object is None:
            errors.append("PDF catalog missing")
    except Exception as exc:
        errors.append(f"PDF structure invalid: {exc}")
    return errors


def _json_depth(value, depth=0):
    if depth > 5:
        raise ValueError("payload nesting exceeds limit")
    if isinstance(value, dict):
        if len(value) > 256:
            raise ValueError("payload object exceeds item limit")
        for key, item in value.items():
            if not isinstance(key, str) or len(key) > 128:
                raise ValueError("invalid payload key")
            _json_depth(item, depth + 1)
    elif isinstance(value, list):
        if len(value) > 256:
            raise ValueError("payload array exceeds item limit")
        for item in value:
            _json_depth(item, depth + 1)
    elif value is not None and not isinstance(value, (str, int, float, bool)):
        raise ValueError("unsupported payload value")


def bounded_json_field(value, allowed_types, field_name: str):
    if not isinstance(value, allowed_types):
        raise ValueError(f"{field_name} has invalid type")
    _json_depth(value)
    try:
        encoded = json.dumps(value, ensure_ascii=False, allow_nan=False).encode("utf-8")
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{field_name} is not valid JSON") from exc
    max_bytes = int(os.getenv("SGAI_SCRAPER_HEARTBEAT_FIELD_BYTES", "16384"))
    if len(encoded) > max_bytes:
        raise ValueError(f"{field_name} exceeds size limit")
    return value


def capped_requeue_limit(value) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = MAX_REQUEUE
    return max(1, min(parsed, MAX_REQUEUE))


def _control_ttl() -> int:
    try:
        return max(60, min(int(os.getenv("SGAI_SCRAPER_CONTROL_TTL", "86400")), 604800))
    except ValueError:
        return 86400


def _control_key(worker_id: str) -> str:
    return f"sgai:scraper:control:{worker_id}"


def _decode_redis_json(raw):
    if not raw:
        return None
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8")
    try:
        value = json.loads(raw)
    except (TypeError, ValueError, UnicodeDecodeError):
        return None
    return value if isinstance(value, dict) else None


def _read_control(redis_conn, worker_id: str) -> dict:
    getter = getattr(redis_conn, "get", None)
    if not getter:
        specific = global_command = None
    else:
        specific = _decode_redis_json(getter(_control_key(worker_id)))
        global_command = _decode_redis_json(getter(_control_key("all")))
    commands = [item for item in (specific, global_command) if item]
    if not commands:
        return {
            "action": "resume",
            "workerId": worker_id,
            "requestedAt": 0,
            "source": "default",
        }
    return max(commands, key=lambda item: int(item.get("requestedAt") or 0))


def idempotent_create(find_existing, create, lock):
    """Esegue il controllo autoritativo nel lock distribuito."""
    if not lock.acquire():
        raise LockUnavailable("lock busy")
    try:
        existing = find_existing()
        if existing:
            return "existing", existing
        return "created", create()
    finally:
        lock.release()


def _dataset():
    from api.db.services.knowledgebase_service import KnowledgebaseService

    configured = (
        os.getenv("SGAI_SENTENZE_DATASET") or "SENTENZE BANCA DATI MEF"
    ).strip()
    matches = KnowledgebaseService.query(id=configured)
    if not matches:
        matches = KnowledgebaseService.query(name=configured)
    if len(matches) != 1:
        raise LookupError("configured dataset must resolve to exactly one dataset")
    return matches[0]


def _as_dict(doc):
    if isinstance(doc, dict):
        return dict(doc)
    if hasattr(doc, "to_dict"):
        return doc.to_dict()
    return {
        key: getattr(doc, key, None)
        for key in ("id", "name", "kb_id", "run", "progress", "progress_msg",
                    "chunk_num", "token_num", "size", "update_time")
    }


def _iter_document_rows(kb_id, batch_size=MANIFEST_BATCH_SIZE):
    """Itera i documenti validi con keyset pagination, senza OFFSET crescente."""
    from api.db import StatusEnum
    from api.db.db_models import DB, Document

    last_id = None
    with DB.connection_context():
        while True:
            where = [
                Document.kb_id == kb_id,
                Document.status == StatusEnum.VALID.value,
            ]
            if last_id is not None:
                where.append(Document.id > last_id)
            rows = list(
                Document
                .select(
                    Document.id, Document.name, Document.run, Document.progress,
                    Document.progress_msg, Document.chunk_num, Document.token_num,
                    Document.size, Document.update_time,
                )
                .where(*where)
                .order_by(Document.id.asc())
                .limit(batch_size)
                .dicts()
            )
            if not rows:
                break
            yield from rows
            last_id = rows[-1]["id"]


def _rows():
    """Compatibilità requeue: lettura batch, senza DocumentService.query globale."""
    kb = _dataset()
    return list(_iter_document_rows(kb.id)), kb


def dataset_progress_summary(rows):
    counts = {name: 0 for name in RUN_NAMES.values()}
    with_embedding = total_chunks = 0
    progress_sum = 0.0
    for row in rows:
        status = RUN_NAMES.get(str(row.get("run")), "unknown")
        if status in counts:
            counts[status] += 1
        chunks = int(row.get("chunk_num") or 0)
        total_chunks += chunks
        with_embedding += int(chunks > 0)
        progress_sum += float(row.get("progress") or 0)
    total = len(rows)
    progresses = [float(row.get("progress") or 0) for row in rows]
    average_progress = progress_sum / total if total else 0.0
    return {
        "totalDocuments": total,
        "statusCounts": counts,
        "withEmbedding": with_embedding,
        "withoutEmbedding": total - with_embedding,
        "totalChunks": total_chunks,
        "averageProgress": average_progress,
        "progress": {
            "average": average_progress,
            "minimum": min(progresses) if progresses else 0.0,
            "maximum": max(progresses) if progresses else 0.0,
        },
    }


def dataset_progress_summary_from_aggregates(rows):
    """Compone la shape API da righe SQL aggregate per stato ``run``."""
    counts = {name: 0 for name in RUN_NAMES.values()}
    total = with_embedding = total_chunks = 0
    weighted_progress = 0.0
    minimum = maximum = None
    for row in rows:
        count = int(row.get("doc_count") or 0)
        status = RUN_NAMES.get(str(row.get("run_status")), "unknown")
        if status in counts:
            counts[status] += count
        total += count
        with_embedding += int(row.get("with_embeddings") or 0)
        total_chunks += int(row.get("chunk_sum") or 0)
        weighted_progress += float(row.get("avg_progress") or 0) * count
        if count:
            row_min = float(row.get("min_progress") or 0)
            row_max = float(row.get("max_progress") or 0)
            minimum = row_min if minimum is None else min(minimum, row_min)
            maximum = row_max if maximum is None else max(maximum, row_max)
    average = weighted_progress / total if total else 0.0
    return {
        "totalDocuments": total,
        "statusCounts": counts,
        "withEmbedding": with_embedding,
        "withoutEmbedding": total - with_embedding,
        "totalChunks": total_chunks,
        "averageProgress": average,
        "progress": {
            "average": average,
            "minimum": minimum if minimum is not None else 0.0,
            "maximum": maximum if maximum is not None else 0.0,
        },
    }


def _progress_aggregate_rows(kb_id):
    from peewee import Case, fn

    from api.db import StatusEnum
    from api.db.db_models import DB, Document

    with DB.connection_context():
        return list(
            Document
            .select(
                Document.run.alias("run_status"),
                fn.COUNT(Document.id).alias("doc_count"),
                fn.SUM(Document.chunk_num).alias("chunk_sum"),
                fn.SUM(
                    Case(None, [(Document.chunk_num > 0, 1)], 0)
                ).alias("with_embeddings"),
                fn.AVG(Document.progress).alias("avg_progress"),
                fn.MIN(Document.progress).alias("min_progress"),
                fn.MAX(Document.progress).alias("max_progress"),
            )
            .where(
                Document.kb_id == kb_id,
                Document.status == StatusEnum.VALID.value,
            )
            .group_by(Document.run)
            .dicts()
        )


def _manifest_cache_ttl():
    try:
        return max(1, int(os.getenv("SGAI_SCRAPER_MANIFEST_TTL", "300")))
    except ValueError:
        return 300


def _invalidate_manifest_cache():
    with _MANIFEST_CACHE_LOCK:
        _MANIFEST_CACHE.update({"expires": 0.0, "data": None, "kb": None})


def _manifest():
    now = time.monotonic()
    with _MANIFEST_CACHE_LOCK:
        if _MANIFEST_CACHE["data"] is not None and now < _MANIFEST_CACHE["expires"]:
            return _MANIFEST_CACHE["data"], _MANIFEST_CACHE["kb"]
        kb = _dataset()
        data = build_manifest_index(_iter_document_rows(kb.id))
        _MANIFEST_CACHE.update({
            "expires": now + _manifest_cache_ttl(),
            "data": data,
            "kb": kb,
        })
        return data, kb


def _progress_summary():
    kb = _dataset()
    return dataset_progress_summary_from_aggregates(
        _progress_aggregate_rows(kb.id)
    )


def _docs_for_key(key):
    from api.db import StatusEnum
    from api.db.db_models import DB, Document

    kb = _dataset()
    canonical_name = f"{key}.pdf"
    copy_prefix = f"{key} ("
    with DB.connection_context():
        docs = list(
            Document
            .select(
                Document.id, Document.name, Document.run, Document.progress,
                Document.progress_msg, Document.chunk_num,
            )
            .where(
                Document.kb_id == kb.id,
                Document.status == StatusEnum.VALID.value,
                (
                    (Document.name == canonical_name)
                    | Document.name.startswith(copy_prefix)
                ),
            )
            .order_by(Document.name.asc())
            .limit(DOCUMENT_LOOKUP_LIMIT)
            .dicts()
        )
    result = [
        doc for doc in docs
        if (
            (parsed := parse_sentenza_name(doc.get("name", "")))
            and parsed["nomeBase"].lower() == key.lower()
        )
    ]
    return result, kb


def _existing_doc_for_key(key):
    rows, _ = _docs_for_key(key)
    return _doc_public(rows[0]) if rows else None


def _doc_public(doc):
    row = _as_dict(doc)
    result = {
        "id": row.get("id"),
        "name": row.get("name"),
        "status": RUN_NAMES.get(str(row.get("run")), "unknown"),
        "progress": row.get("progress") or 0,
        "progressMessage": row.get("progress_msg") or "",
        "chunkNum": row.get("chunk_num") or 0,
        "hasEmbedding": (row.get("chunk_num") or 0) > 0,
    }
    result["needsRequeue"] = not result["hasEmbedding"] and result["status"] in {
        "unstart", "fail", "done"
    }
    return result


@manager.route("/check", methods=["GET"])
@require_role("authenticated")
def check():
    key = resolve_lookup_key(
        nome_base_param=request.args.get("nome_base", ""),
        codice=request.args.get("codice", ""),
        numero=request.args.get("numero", ""),
        anno=request.args.get("anno", ""),
        tipo=request.args.get("tipo", "Sentenza"),
    )
    if not key:
        return _json(None, 400, error="canonical lookup parameters required")
    rows, _ = _docs_for_key(key)
    manifest = build_manifest_index(rows)
    result = lookup_in_manifest(manifest, key)
    # Idempotenza upload: qualsiasi copia impedisce un altro inserimento.
    result["shouldUpload"] = not result["has"]
    best = result.get("bestFile") or {}
    result["needsRequeue"] = bool(
        result["has"] and not best.get("hasEmbedding")
        and best.get("status") in {"unstart", "fail", "done"}
    )
    return _json(result)


@manager.route("/manifest", defaults={"path_format": None}, methods=["GET"])
@manager.route("/manifest/<path_format>", methods=["GET"])
@require_role("authenticated")
def manifest(path_format=None):
    fmt = (path_format or request.args.get("format", "summary")).lower()
    data, _ = _manifest()
    if fmt == "summary":
        return _json({k: data[k] for k in ("totalFiles", "uniqueBase", "duplicateGroups")})
    if fmt == "keys":
        return _json(sorted(entry["nomeBase"] for entry in data["index"].values()))
    if fmt == "jsonl":
        def records():
            for entry in data["index"].values():
                compact = {
                    "nomeBase": entry["nomeBase"],
                    "copies": entry["copies"],
                    "hasDone": entry["hasDone"],
                    "hasEmbedding": entry["hasEmbedding"],
                    "bestFile": entry.get("bestFile"),
                }
                yield json.dumps(compact, ensure_ascii=False, separators=(",", ":")) + "\n"
        return Response(records(), mimetype="application/x-ndjson")
    return _json(None, 400, error="format must be summary, keys or jsonl")


@manager.route("/heartbeat", methods=["POST"])
@require_role("worker")
def heartbeat():
    body = request.get_json(silent=True) or {}
    worker_id = str(body.get("workerId") or body.get("worker_id") or "").strip()
    state = str(body.get("status") or "").strip().lower()
    if not re.fullmatch(r"[A-Za-z0-9_.:-]{1,80}", worker_id) or state not in WORKER_STATES:
        return _json(None, 400, error="invalid workerId or status")
    try:
        heartbeat_data = {
            "workerId": worker_id,
            "status": state,
            "updatedAt": int(time.time()),
            "checkpoint": bounded_json_field(body.get("checkpoint", {}), (dict,), "checkpoint"),
            "metrics": bounded_json_field(body.get("metrics", {}), (dict,), "metrics"),
            "queue": bounded_json_field(body.get("queue", {}), (dict, list), "queue"),
            "error": bounded_json_field(body.get("error"), (dict, str, type(None)), "error"),
        }
        if len(json.dumps(heartbeat_data, ensure_ascii=False).encode("utf-8")) > 49152:
            raise ValueError("heartbeat exceeds total size limit")
    except ValueError as exc:
        return _json(None, 400, error=str(exc))
    from rag.utils.redis_conn import REDIS_CONN

    desired = _read_control(REDIS_CONN, worker_id)
    current_state = str(body.get("currentState") or state).strip().lower()
    if current_state not in WORKER_STATES:
        return _json(None, 400, error="invalid currentState")
    # SADD ritorna 0 quando il worker è già registrato: è il caso normale
    # degli heartbeat successivi, non un errore Redis.
    heartbeat_data["desiredState"] = str(desired.get("action") or "resume").lower()
    heartbeat_data["currentState"] = current_state
    REDIS_CONN.sadd(WORKER_REGISTRY, worker_id)
    if not REDIS_CONN.set_obj(
        f"sgai:scraper:worker:{worker_id}", heartbeat_data, HEARTBEAT_TTL
    ):
        return _json(None, 503, error="redis unavailable")
    return _json(heartbeat_data)


@manager.route("/control", methods=["GET", "POST"])
def control():
    if request.method == "GET":
        if not _has_role("worker"):
            return _json(None, 401, error="unauthorized")
        from rag.utils.redis_conn import REDIS_CONN

        worker_id = str(request.args.get("workerId") or "").strip()
        if not re.fullmatch(r"[A-Za-z0-9_.:-]{1,80}", worker_id):
            return _json(None, 400, error="valid workerId is required")
        return _json(_read_control(REDIS_CONN, worker_id))

    if not _has_role("admin"):
        return _json(None, 401, error="unauthorized")
    from rag.utils.redis_conn import REDIS_CONN

    body = request.get_json(silent=True) or {}
    action = str(body.get("action") or "").strip().lower()
    worker_id = str(body.get("workerId") or "all").strip()
    if action not in CONTROL_ACTIONS:
        return _json(None, 400, error="action must be pause, resume, stop or drain")
    if worker_id != "all" and not re.fullmatch(r"[A-Za-z0-9_.:-]{1,80}", worker_id):
        return _json(None, 400, error="invalid workerId")
    now = int(time.time())
    command = {
        "id": uuid.uuid4().hex,
        "action": action,
        "workerId": worker_id,
        "requestedAt": now,
        "requestedBy": "admin-session" if _has_admin_session() else "admin-api-token",
        "remoteAddr": request.remote_addr,
        "source": "admin",
    }
    ttl = _control_ttl()
    if not REDIS_CONN.set_obj(_control_key(worker_id), command, ttl):
        return _json(None, 503, error="redis unavailable")
    audit_key = f"sgai:scraper:control:audit:{now}:{command['id']}"
    if not REDIS_CONN.set_obj(audit_key, command, ttl):
        logging.error("[SGAI SCRAPER AUDIT] failed to persist control audit id=%s", command["id"])
        return _json(None, 503, error="control saved but audit persistence failed")
    logging.info(
        "[SGAI SCRAPER AUDIT] control action=%s worker=%s request=%s remote=%s",
        action, worker_id, command["id"], request.remote_addr,
    )
    return _json(command)


@manager.route("/workers/status", methods=["GET"])
@require_role("admin")
def workers_status():
    from rag.utils.redis_conn import REDIS_CONN

    now, workers = int(time.time()), []
    for worker_id in sorted(REDIS_CONN.smembers(WORKER_REGISTRY) or []):
        raw = REDIS_CONN.get(f"sgai:scraper:worker:{worker_id}")
        if not raw:
            workers.append({"workerId": worker_id, "live": False, "status": "stale"})
            continue
        try:
            item = json.loads(raw)
        except (TypeError, ValueError):
            item = {"workerId": worker_id, "status": "invalid"}
        item["live"] = now - int(item.get("updatedAt") or 0) <= HEARTBEAT_TTL
        workers.append(item)
    return _json({
        "workers": workers,
        "dataset": _progress_summary(),
    })


@manager.route("/upload", methods=["POST"])
@require_role("worker")
def upload():
    from api.db.db_models import Task
    from api.db.services.document_service import DocumentService
    from api.db.services.file2document_service import File2DocumentService
    from api.db.services.file_service import FileService
    from api.db.services.task_service import TaskService, queue_tasks
    from rag.utils.redis_conn import RedisDistributedLock

    file_obj = request.files.get("file")
    if not file_obj or not file_obj.filename:
        return _json(None, 400, error="file is required")
    canonical = canonical_pdf(file_obj.filename)
    if not canonical:
        return _json(None, 400, error="filename is not canonical")
    nome, filename = canonical
    max_bytes = int(os.getenv("SGAI_SCRAPER_MAX_UPLOAD_BYTES", str(25 * 1024 * 1024)))
    blob = file_obj.read(max_bytes + 1)
    if not blob or len(blob) > max_bytes:
        return _json(None, 413, error="invalid upload size")
    supplied_sha = request.form.get("sha256") or request.headers.get("X-Content-SHA256", "")
    if not verify_sha256(blob, supplied_sha):
        return _json(None, 400, error="sha256 mismatch")
    pdf_errors = validate_pdf(blob)
    if pdf_errors:
        return _json(None, 400, error="invalid PDF", validationErrors=pdf_errors)
    try:
        kb = _dataset()
        lock = RedisDistributedLock(
            f"sgai:scraper:upload:{nome.lower()}", timeout=120, blocking_timeout=5
        )

        def find_existing():
            return _existing_doc_for_key(nome)

        def create():
            upload_file = FileStorage(
                stream=io.BytesIO(blob), filename=filename, content_type="application/pdf"
            )
            errors, files = FileService.upload_document(kb, [upload_file], kb.tenant_id)
            if errors or len(files) != 1 or files[0][0]["name"] != filename:
                raise RuntimeError("; ".join(errors) or "non-canonical upload result")
            doc = files[0][0]
            _invalidate_manifest_cache()
            DocumentService.update_by_id(doc["id"], {
                "run": "1", "progress": 0, "progress_msg": "", "chunk_num": 0, "token_num": 0
            })
            TaskService.filter_delete([Task.doc_id == doc["id"]])
            exists, stored_doc = DocumentService.get_by_id(doc["id"])
            if not exists:
                raise RuntimeError("uploaded document missing")
            queued = stored_doc.to_dict()
            queued["tenant_id"] = kb.tenant_id
            bucket, storage_name = File2DocumentService.get_storage_address(doc_id=doc["id"])
            try:
                queue_tasks(queued, bucket, storage_name, 0)
            except Exception as exc:
                message = f"SGAI queue submission failed: {exc}"
                DocumentService.update_by_id(doc["id"], {
                    "run": "4", "progress": 0, "progress_msg": message[:1024]
                })
                failed = _doc_public({**queued, "run": "4", "progress_msg": message})
                logging.exception("[SGAI SCRAPER] %s doc=%s", message, doc["id"])
                raise QueueSubmissionError(failed) from exc
            return _doc_public(queued)

        outcome, doc = idempotent_create(find_existing, create, lock)
        return _json({"outcome": outcome, "document": doc}, 200 if outcome == "existing" else 201)
    except LockUnavailable:
        return _json(None, 409, error="upload already in progress")
    except QueueSubmissionError as exc:
        return _json(
            {"outcome": "queue_failed", "document": exc.document},
            503,
            error=str(exc),
        )
    except LookupError as exc:
        return _json(None, 503, error=str(exc))
    except Exception:
        logging.exception("[SGAI SCRAPER] upload failed")
        return _json(None, 503, error="upload failed closed")


@manager.route("/duplicates", methods=["GET"])
@require_role("admin")
def duplicates():
    page = max(1, request.args.get("page", 1, type=int))
    size = max(1, min(request.args.get("page_size", 50, type=int), 200))
    data, _ = _manifest()
    groups = [entry for entry in data["index"].values() if entry["isDuplicate"]]
    groups.sort(key=lambda item: item["nomeBase"])
    start = (page - 1) * size
    return _json({"items": groups[start:start + size], "total": len(groups), "page": page})


def _selected_for_requeue(rows, status):
    if status == "unstart":
        return [row for row in rows if str(row.get("run")) == "0"]
    if status == "fail":
        return [row for row in rows if str(row.get("run")) == "4"]
    if status == "done_without_embeddings":
        return [row for row in rows if str(row.get("run")) == "3" and not (row.get("chunk_num") or 0)]
    raise ValueError("invalid status")


@manager.route("/requeue", methods=["POST"])
@require_role("admin")
def requeue():
    from api.db.db_models import Task
    from api.db.services.document_service import DocumentService
    from api.db.services.file2document_service import File2DocumentService
    from api.db.services.task_service import TaskService, queue_tasks

    body = request.get_json(silent=True) or {}
    status = str(body.get("status") or "unstart").lower()
    dry_run = body.get("dry_run", True) is not False
    limit = capped_requeue_limit(body.get("limit", MAX_REQUEUE))
    try:
        rows, kb = _rows()
        selected = _selected_for_requeue(rows, status)[:limit]
    except ValueError as exc:
        return _json(None, 400, error=str(exc))
    if dry_run:
        return _json({"dryRun": True, "matched": len(selected), "queued": 0, "limit": limit})
    queued, errors = 0, []
    for row in selected:
        try:
            current = DocumentService.query(id=row["id"], kb_id=kb.id)
            if not current or _as_dict(current[0]).get("run") != row.get("run"):
                continue
            bucket, name = File2DocumentService.get_storage_address(doc_id=row["id"])
            if not bucket or not name:
                raise RuntimeError("storage address missing")
            DocumentService.update_by_id(row["id"], {
                "run": "1", "progress": 0, "progress_msg": "SGAI admin requeue"
            })
            TaskService.filter_delete([Task.doc_id == row["id"]])
            row["tenant_id"] = kb.tenant_id
            queue_tasks(row, bucket, name, 0)
            queued += 1
            logging.info(
                "[SGAI SCRAPER AUDIT] requeued doc=%s source_status=%s remote=%s",
                row["id"], status, request.remote_addr,
            )
        except Exception as exc:
            logging.exception("[SGAI SCRAPER AUDIT] requeue failed doc=%s", row.get("id"))
            errors.append({"id": row.get("id"), "error": str(exc)})
    if selected:
        _invalidate_manifest_cache()
    return _json({"dryRun": False, "matched": len(selected), "queued": queued, "errors": errors[:20]})


@manager.route("/progress", methods=["GET"])
@require_role("authenticated")
def progress():
    has_lookup = any(
        request.args.get(name)
        for name in ("nome_base", "codice", "numero", "anno", "tipo")
    )
    if not has_lookup:
        return _json(_progress_summary())
    key = resolve_lookup_key(
        nome_base_param=request.args.get("nome_base", ""),
        codice=request.args.get("codice", ""),
        numero=request.args.get("numero", ""),
        anno=request.args.get("anno", ""),
        tipo=request.args.get("tipo", "Sentenza"),
    )
    if not key:
        return _json(None, 400, error="canonical lookup parameters required")
    rows, _ = _docs_for_key(key)
    docs = [_doc_public(row) for row in rows]
    return _json({
        "nomeBase": key, "documents": docs, "copies": len(docs),
        "hasEmbedding": any(doc["hasEmbedding"] for doc in docs),
    })
