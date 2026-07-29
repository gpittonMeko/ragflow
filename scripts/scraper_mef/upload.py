"""Client SGAI, wake manager e coda upload SQLite crash-safe."""
from __future__ import annotations

import hashlib
import json
import random
import re
import sqlite3
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import requests


class UploadDisabledError(RuntimeError):
    pass


class SgaiOfflineError(RuntimeError):
    """SGAI non è raggiungibile a livello trasporto."""


class SgaiApplicationError(RuntimeError):
    """SGAI ha risposto con un errore applicativo."""

    def __init__(self, message: str, status: int, *, retryable: bool = False) -> None:
        self.status = int(status)
        self.retryable = retryable
        super().__init__(message)


@dataclass(frozen=True)
class QueueItem:
    nome_base: str
    path: str
    sha256: str
    status: str
    attempts: int
    next_retry: float
    document_id: str | None
    error: str | None
    lease_until: float | None


class UploadQueue:
    STATES = {"pending", "uploading", "uploaded", "embedding", "done", "dead"}

    def __init__(self, path: Path) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._local = threading.local()
        self._migrate()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.path), timeout=30, isolation_level=None)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=FULL")
        conn.execute("PRAGMA busy_timeout=30000")
        return conn

    def _migrate(self) -> None:
        conn = self._connect()
        try:
            conn.execute("BEGIN IMMEDIATE")
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS upload_queue (
                    nome_base TEXT PRIMARY KEY COLLATE NOCASE,
                    path TEXT NOT NULL,
                    sha256 TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'pending',
                    attempts INTEGER NOT NULL DEFAULT 0,
                    next_retry REAL NOT NULL DEFAULT 0,
                    document_id TEXT,
                    error TEXT,
                    lease_until REAL,
                    created_at REAL NOT NULL,
                    updated_at REAL NOT NULL,
                    CHECK(status IN ('pending','uploading','uploaded','embedding','done','dead'))
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS upload_queue_due ON upload_queue(status,next_retry,created_at)"
            )
            conn.execute("COMMIT")
        except Exception:
            conn.execute("ROLLBACK")
            raise
        finally:
            conn.close()

    @staticmethod
    def canonical_base(path: Path, nome_base: str | None = None) -> str:
        base = (nome_base or path.stem).strip()
        match = re.fullmatch(
            r"(Sentenza|Ordinanza|Decreto)_([A-Z0-9]+)_(\d+)_(\d{4})", base
        )
        if (
            not match
            or "/" in base
            or "\\" in base
            or path.name != f"{base}.pdf"
        ):
            raise ValueError("nome_base/path PDF non canonico")
        return base

    def enqueue(
        self, path: Path, *, nome_base: str | None = None, sha256: str | None = None
    ) -> dict[str, Any]:
        path = Path(path).resolve()
        base = self.canonical_base(path, nome_base)
        digest = sha256 or hashlib.sha256(path.read_bytes()).hexdigest()
        now = time.time()
        conn = self._connect()
        try:
            conn.execute("BEGIN IMMEDIATE")
            conn.execute(
                """
                INSERT INTO upload_queue
                    (nome_base,path,sha256,status,attempts,next_retry,created_at,updated_at)
                VALUES (?,?,?,'pending',0,0,?,?)
                ON CONFLICT(nome_base) DO UPDATE SET
                    path=CASE WHEN upload_queue.status IN ('pending','dead')
                              THEN excluded.path ELSE upload_queue.path END,
                    sha256=CASE WHEN upload_queue.status IN ('pending','dead')
                                THEN excluded.sha256 ELSE upload_queue.sha256 END,
                    updated_at=excluded.updated_at
                """,
                (base, str(path), digest, now, now),
            )
            row = conn.execute(
                "SELECT * FROM upload_queue WHERE nome_base=?", (base,)
            ).fetchone()
            conn.execute("COMMIT")
            return dict(row)
        except Exception:
            conn.execute("ROLLBACK")
            raise
        finally:
            conn.close()

    def recover_expired(self, now: float | None = None) -> int:
        now = time.time() if now is None else now
        conn = self._connect()
        try:
            cur = conn.execute(
                """
                UPDATE upload_queue
                SET status='pending', lease_until=NULL, updated_at=?,
                    error=COALESCE(error,'recovered expired upload lease')
                WHERE status='uploading' AND lease_until IS NOT NULL AND lease_until<=?
                """,
                (now, now),
            )
            return cur.rowcount
        finally:
            conn.close()

    def claim(self, *, lease_sec: int = 600, now: float | None = None) -> QueueItem | None:
        now = time.time() if now is None else now
        self.recover_expired(now)
        conn = self._connect()
        try:
            conn.execute("BEGIN IMMEDIATE")
            row = conn.execute(
                """
                SELECT * FROM upload_queue
                WHERE status='pending' AND next_retry<=?
                ORDER BY created_at LIMIT 1
                """,
                (now,),
            ).fetchone()
            if row is None:
                conn.execute("COMMIT")
                return None
            conn.execute(
                """
                UPDATE upload_queue SET status='uploading', attempts=attempts+1,
                    lease_until=?, updated_at=?, error=NULL
                WHERE nome_base=? AND status='pending'
                """,
                (now + lease_sec, now, row["nome_base"]),
            )
            claimed = conn.execute(
                "SELECT * FROM upload_queue WHERE nome_base=?", (row["nome_base"],)
            ).fetchone()
            conn.execute("COMMIT")
            return QueueItem(**{k: claimed[k] for k in QueueItem.__dataclass_fields__})
        except Exception:
            conn.execute("ROLLBACK")
            raise
        finally:
            conn.close()

    def transition(
        self,
        nome_base: str,
        status: str,
        *,
        document_id: str | None = None,
        error: str | None = None,
        next_retry: float = 0,
    ) -> None:
        if status not in self.STATES:
            raise ValueError(f"stato coda non valido: {status}")
        conn = self._connect()
        try:
            conn.execute(
                """
                UPDATE upload_queue SET status=?, document_id=COALESCE(?,document_id),
                    error=?, next_retry=?, lease_until=NULL, updated_at=?
                WHERE nome_base=?
                """,
                (status, document_id, error, next_retry, time.time(), nome_base),
            )
        finally:
            conn.close()

    def retry(
        self, item: QueueItem, error: Exception, *, max_attempts: int, delay: float
    ) -> str:
        status = "dead" if item.attempts >= max_attempts else "pending"
        self.transition(
            item.nome_base,
            status,
            error=str(error)[:1000],
            next_retry=time.time() + max(0, delay) if status == "pending" else 0,
        )
        return status

    def items(self, *statuses: str) -> list[dict[str, Any]]:
        conn = self._connect()
        try:
            if statuses:
                marks = ",".join("?" for _ in statuses)
                rows = conn.execute(
                    f"SELECT * FROM upload_queue WHERE status IN ({marks}) ORDER BY created_at",
                    statuses,
                ).fetchall()
            else:
                rows = conn.execute("SELECT * FROM upload_queue ORDER BY created_at").fetchall()
            return [dict(row) for row in rows]
        finally:
            conn.close()

    def summary(self) -> dict[str, int]:
        result = {state: 0 for state in sorted(self.STATES)}
        conn = self._connect()
        try:
            for row in conn.execute(
                "SELECT status,COUNT(*) AS n FROM upload_queue GROUP BY status"
            ):
                result[row["status"]] = int(row["n"])
        finally:
            conn.close()
        result["active"] = sum(
            result[state] for state in ("pending", "uploading", "uploaded", "embedding")
        )
        return result


class SgaiClient:
    def __init__(
        self,
        base_url: str,
        token: str,
        *,
        timeout: float = 20,
        retries: int = 2,
        backoff: float = 1,
        session=None,
        sleep=time.sleep,
    ) -> None:
        if not token:
            raise ValueError("SGAI_SCRAPER_API_TOKEN non configurato")
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.retries = max(0, retries)
        self.backoff = max(0, backoff)
        self.session = session or requests.Session()
        self.sleep = sleep
        self.headers = {"Authorization": f"Bearer {token}"}

    def _request(self, method: str, endpoint: str, **kwargs):
        last_transport = None
        extra_headers = kwargs.pop("headers", {})
        file_positions = {}
        for value in (kwargs.get("files") or {}).values():
            candidate = value[1] if isinstance(value, tuple) and len(value) > 1 else value
            if hasattr(candidate, "tell"):
                file_positions[id(candidate)] = (candidate, candidate.tell())
        for attempt in range(self.retries + 1):
            for stream, position in file_positions.values():
                stream.seek(position)
            try:
                response = self.session.request(
                    method,
                    f"{self.base_url}/v1/scraper/{endpoint.lstrip('/')}",
                    headers={**self.headers, **extra_headers},
                    timeout=self.timeout,
                    **kwargs,
                )
            except requests.RequestException as exc:
                last_transport = exc
                if attempt < self.retries:
                    self.sleep(self.backoff * (2**attempt))
                    continue
                raise SgaiOfflineError(f"SGAI non raggiungibile: {type(exc).__name__}") from exc
            if response.status_code >= 500 and attempt < self.retries:
                self.sleep(self.backoff * (2**attempt))
                continue
            if response.status_code >= 400:
                try:
                    payload = response.json()
                    message = payload.get("error") or f"HTTP {response.status_code}"
                except Exception:
                    message = f"HTTP {response.status_code}"
                raise SgaiApplicationError(
                    str(message), response.status_code, retryable=response.status_code >= 409
                )
            try:
                return response.json().get("data")
            except Exception as exc:
                raise SgaiApplicationError("risposta JSON SGAI non valida", 502, retryable=True) from exc
        raise SgaiOfflineError(f"SGAI non raggiungibile: {last_transport}")

    def check(self, nome_base: str) -> dict:
        return self._request("GET", "check", params={"nome_base": nome_base})

    def upload(self, path: Path, sha256: str | None = None) -> dict:
        path = Path(path)
        digest = sha256 or hashlib.sha256(path.read_bytes()).hexdigest()
        with path.open("rb") as stream:
            return self._request(
                "POST",
                "upload",
                files={"file": (path.name, stream, "application/pdf")},
                data={"sha256": digest},
            )

    def heartbeat(
        self, worker_id: str, status: str, *, checkpoint: dict, metrics: dict, queue: dict,
        error: str | dict | None = None, desired_state: str | None = None,
        current_state: str | None = None,
    ) -> dict:
        return self._request(
            "POST",
            "heartbeat",
            json={
                "workerId": worker_id,
                "status": status,
                "checkpoint": checkpoint,
                "metrics": metrics,
                "queue": queue,
                "error": error,
                "desiredState": desired_state,
                "currentState": current_state or status,
            },
        )

    def control(self, worker_id: str) -> dict:
        return self._request("GET", "control", params={"workerId": worker_id})

    def progress(self, nome_base: str | None = None) -> dict:
        params = {"nome_base": nome_base} if nome_base else None
        return self._request("GET", "progress", params=params)


class SgaiWakeManager:
    def __init__(
        self,
        client: SgaiClient,
        wake_url: str,
        target: str,
        *,
        cooldown: float = 180,
        session=None,
        timeout: float = 15,
        sleep=time.sleep,
        clock=time.monotonic,
    ) -> None:
        self.client = client
        self.wake_url = wake_url
        self.target = target
        self.cooldown = cooldown
        self.session = session or requests.Session()
        self.timeout = timeout
        self.sleep = sleep
        self.clock = clock
        self.last_wake = float("-inf")

    def wake(self, *, force: bool = False) -> bool:
        now = self.clock()
        if not force and now - self.last_wake < self.cooldown:
            return False
        try:
            response = self.session.post(
                self.wake_url,
                json={"force_start": True, "target_instance": self.target},
                timeout=self.timeout,
            )
            response.raise_for_status()
        except requests.RequestException as exc:
            raise SgaiOfflineError(f"wake endpoint non raggiungibile: {type(exc).__name__}") from exc
        self.last_wake = now
        return True

    def ensure_awake(self, *, pending: bool, wait_seconds: float = 360) -> bool:
        try:
            self.client.progress()
            return True
        except SgaiApplicationError as exc:
            if not exc.retryable:
                raise
            if not pending:
                return False
        except SgaiOfflineError:
            if not pending:
                return False
        self.wake()
        deadline = self.clock() + max(0, wait_seconds)
        while self.clock() < deadline:
            try:
                self.client.progress()
                return True
            except SgaiApplicationError as exc:
                if not exc.retryable:
                    raise
            except SgaiOfflineError:
                pass
            if pending:
                self.wake()
            self.sleep(min(10.0, max(0.1, deadline - self.clock())))
        return False


def enqueue_upload(
    path: Path,
    *,
    enabled: bool = False,
    queue: UploadQueue | None = None,
    nome_base: str | None = None,
    sha256: str | None = None,
) -> dict:
    if not enabled:
        raise UploadDisabledError(
            "Upload SGAI disabilitato (MEF_SCRAPER_UPLOAD!=1 / Gate 2 non aperto)"
        )
    if queue is None:
        raise ValueError("UploadQueue richiesta quando upload è abilitato")
    return queue.enqueue(path, nome_base=nome_base, sha256=sha256)
