"""Servizio continuativo: scraping/spool locale e drain SGAI indipendenti."""
from __future__ import annotations

import json
import os
import random
import shutil
import threading
import time
from pathlib import Path
from typing import Callable

from .checkpoint import Checkpoint
from .config import Config
from .limits import StopController
from .logging_utils import setup_logger
from .runner import run_scraper
from .upload import (
    SgaiApplicationError,
    SgaiClient,
    SgaiOfflineError,
    SgaiWakeManager,
    UploadQueue,
)

log = setup_logger()


def disk_guard(path: Path, *, max_spool_bytes: int, min_free_bytes: int) -> tuple[bool, dict]:
    path.mkdir(parents=True, exist_ok=True)
    spool = sum(p.stat().st_size for p in path.rglob("*.pdf") if p.is_file())
    free = shutil.disk_usage(path).free
    ok = (max_spool_bytes <= 0 or spool < max_spool_bytes) and (
        min_free_bytes <= 0 or free >= min_free_bytes
    )
    return ok, {"spoolBytes": spool, "freeBytes": free}


class ServiceLock:
    def __init__(self, path: Path) -> None:
        self.path = Path(path)
        self.acquired = False

    @staticmethod
    def _alive(pid: int) -> bool:
        try:
            os.kill(pid, 0)
            return True
        except OSError:
            return False

    def acquire(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        for _ in range(2):
            try:
                fd = os.open(str(self.path), os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
                with os.fdopen(fd, "w", encoding="ascii") as stream:
                    stream.write(str(os.getpid()))
                self.acquired = True
                return
            except FileExistsError:
                try:
                    pid = int(self.path.read_text(encoding="ascii").strip())
                except (OSError, ValueError):
                    pid = -1
                if pid > 0 and self._alive(pid):
                    raise RuntimeError(f"servizio già attivo (pid {pid})")
                try:
                    self.path.unlink()
                except FileNotFoundError:
                    pass
        raise RuntimeError("impossibile acquisire lock servizio")

    def release(self) -> None:
        if self.acquired:
            try:
                self.path.unlink()
            except FileNotFoundError:
                pass
            self.acquired = False

    def __enter__(self):
        self.acquire()
        return self

    def __exit__(self, *_exc):
        self.release()


class ScraperService:
    def __init__(
        self,
        cfg: Config,
        *,
        queue: UploadQueue | None = None,
        client: SgaiClient | None = None,
        wake: SgaiWakeManager | None = None,
        scrape: Callable[[], int] | None = None,
        clock=time.time,
        sleep=time.sleep,
        jitter: Callable[[float, float], float] = random.uniform,
    ) -> None:
        self.cfg = cfg
        self.queue = queue or UploadQueue(cfg.queue_path)
        self.client = client
        if cfg.upload_enabled and self.client is None:
            self.client = SgaiClient(
                cfg.sgai_base_url,
                cfg.sgai_worker_token,
                timeout=cfg.http_timeout,
                retries=cfg.http_retries,
                backoff=cfg.retry_base,
            )
        self.wake = wake
        if cfg.upload_enabled and self.wake is None and self.client is not None:
            self.wake = SgaiWakeManager(
                self.client,
                cfg.sgai_wake_url,
                cfg.sgai_wake_target,
                cooldown=cfg.wake_cooldown_sec,
            )
        self.scrape = scrape or self._scrape_live
        self.clock = clock
        self.sleep = sleep
        self.jitter = jitter
        self.stop = StopController()
        self.next_scrape_at = 0.0
        self.last_heartbeat = 0.0
        self.last_progress_poll = 0.0
        self.last_control_poll = 0.0
        self.metrics = {
            "cycles": 0,
            "downloaded": 0,
            "uploaded": 0,
            "embedded": 0,
            "errors": 0,
            "uploadErrors": 0,
            "offline": 0,
        }
        self.state = "starting"
        self.desired_state = "resume"
        self.error: str | None = None
        self._state_lock = threading.Lock()

    def _scrape_live(self) -> int:
        return run_scraper(
            cfg=self.cfg,
            mode="live",
            max_downloads=self.cfg.cycle_max_downloads,
            fixture=None,
            output_dir=self.cfg.output_dir,
            server_caches=[],
            cdp_url=self.cfg.cdp_url,
            resume=True,
        )

    def _checkpoint(self) -> dict:
        cp = Checkpoint(self.cfg.checkpoint_path)
        return {
            "page": cp.data.get("last_page"),
            "row": cp.data.get("last_row_index"),
            "document": cp.data.get("last_document"),
            "status": cp.data.get("status"),
        }

    def _write_state(self, disk: dict | None = None) -> None:
        with self._state_lock:
            payload = {
                "workerId": self.cfg.worker_id,
                "status": self.state,
                "desiredState": self.desired_state,
                "currentState": self.state,
                "updatedAt": int(self.clock()),
                "nextScrapeAt": int(self.next_scrape_at),
                "checkpoint": self._checkpoint(),
                "metrics": self.metrics,
                "queue": self.queue.summary(),
                "disk": disk or {},
                "error": self.error,
            }
            self.cfg.state_path.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.cfg.state_path.with_suffix(self.cfg.state_path.suffix + ".tmp")
            tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
            os.replace(tmp, self.cfg.state_path)

    def _heartbeat(self, *, force: bool = False) -> bool:
        if not self.client:
            return False
        now = self.clock()
        if not force and now - self.last_heartbeat < self.cfg.heartbeat_sec:
            return True
        try:
            self.client.heartbeat(
                self.cfg.worker_id,
                self.state,
                checkpoint=self._checkpoint(),
                metrics=self.metrics,
                queue=self.queue.summary(),
                error=self.error,
                desired_state=self.desired_state,
                current_state=self.state,
            )
            self.last_heartbeat = now
            return True
        except SgaiOfflineError:
            self.metrics["offline"] += 1
            return False

    def _poll_control(self, *, force: bool = False) -> str:
        if not self.client or not hasattr(self.client, "control"):
            return self.desired_state
        now = self.clock()
        if not force and now - self.last_control_poll < self.cfg.service_poll_sec:
            return self.desired_state
        try:
            command = self.client.control(self.cfg.worker_id) or {}
            action = str(command.get("action") or "resume").lower()
            if action not in {"pause", "resume", "stop", "drain"}:
                raise SgaiApplicationError("comando control non valido", 502)
            self.desired_state = action
            self.last_control_poll = now
            if action == "stop":
                self.state = "stopping"
                self.stop.request_stop()
            elif action == "pause":
                self.state = "paused"
            elif action == "drain":
                self.state = "draining"
            elif self.state in {"paused", "draining"}:
                self.state = "idle"
            return action
        except SgaiOfflineError:
            self.metrics["offline"] += 1
        except SgaiApplicationError as exc:
            self.error = str(exc)
        return self.desired_state

    def _retry_delay(self, attempts: int) -> float:
        ceiling = min(self.cfg.retry_max, self.cfg.retry_base * (2 ** max(0, attempts - 1)))
        return self.jitter(ceiling * 0.75, ceiling * 1.25)

    @staticmethod
    def _document_id(payload: dict) -> str | None:
        document = payload.get("document") or payload.get("bestFile") or {}
        return document.get("id")

    def _poll_embedding(self, *, force: bool = False) -> None:
        if not self.client:
            return
        now = self.clock()
        if not force and now - self.last_progress_poll < self.cfg.progress_poll_sec:
            return
        self.last_progress_poll = now
        for row in self.queue.items("uploaded", "embedding"):
            if self.stop.should_stop:
                return
            if row["status"] == "uploaded":
                self.queue.transition(
                    row["nome_base"], "embedding", document_id=row.get("document_id")
                )
            try:
                progress = self.client.progress(row["nome_base"])
            except SgaiOfflineError:
                self.metrics["offline"] += 1
                return
            except SgaiApplicationError as exc:
                self.error = str(exc)
                continue
            if progress.get("hasEmbedding"):
                self.queue.transition(
                    row["nome_base"], "done", document_id=row.get("document_id")
                )
                self.metrics["embedded"] += 1

    def _upload_one(self) -> bool:
        if not self.client:
            return False
        item = self.queue.claim(lease_sec=self.cfg.claim_lease_sec)
        if item is None:
            return False
        try:
            path = Path(item.path)
            if not path.is_file():
                raise SgaiApplicationError("PDF spool mancante", 422)
            checked = self.client.check(item.nome_base)
            if checked.get("has"):
                document_id = self._document_id(checked)
                if checked.get("hasEmbedding"):
                    self.queue.transition(item.nome_base, "done", document_id=document_id)
                    self.metrics["embedded"] += 1
                else:
                    self.queue.transition(item.nome_base, "embedding", document_id=document_id)
                return True
            if not checked.get("shouldUpload", False):
                raise SgaiApplicationError("check SGAI non autorizza upload", 409, retryable=True)
            uploaded = self.client.upload(path, item.sha256)
            document_id = self._document_id(uploaded)
            self.queue.transition(item.nome_base, "uploaded", document_id=document_id)
            self.metrics["uploaded"] += 1
            return True
        except (SgaiOfflineError, SgaiApplicationError, OSError) as exc:
            self.metrics["uploadErrors"] += 1
            if isinstance(exc, SgaiOfflineError):
                self.metrics["offline"] += 1
            self.queue.retry(
                item,
                exc,
                max_attempts=self.cfg.max_attempts,
                delay=self._retry_delay(item.attempts),
            )
            self.error = str(exc)
            return False

    def drain_uploads(self) -> None:
        if not self.cfg.upload_enabled or not self.client or not self.wake:
            return
        summary = self.queue.summary()
        active = summary["active"] > 0
        if not active:
            return
        self.state = "waiting"
        try:
            if not self.wake.ensure_awake(pending=True, wait_seconds=self.cfg.wake_wait_sec):
                self.metrics["offline"] += 1
                return
        except SgaiOfflineError as exc:
            self.metrics["offline"] += 1
            self.error = str(exc)
            return
        self.state = "running"
        self._poll_embedding()
        uploaded_any = False
        for _ in range(self.cfg.upload_batch_size):
            if self.stop.should_stop:
                break
            if not self._upload_one():
                break
            uploaded_any = True
        self._poll_embedding(force=uploaded_any)
        if self.queue.summary()["active"] > 0:
            try:
                self.wake.wake()
            except SgaiOfflineError:
                self.metrics["offline"] += 1
        self._heartbeat()

    def run_once(self, *, scrape_due: bool = True, drain: bool = True) -> None:
        self.metrics["cycles"] += 1
        action = self._poll_control(force=True)
        ok, disk = disk_guard(
            self.cfg.output_dir,
            max_spool_bytes=self.cfg.max_spool_bytes,
            min_free_bytes=self.cfg.min_free_bytes,
        )
        now = self.clock()
        if action == "stop":
            self._write_state(disk)
            self._heartbeat(force=True)
            return
        if action == "resume" and scrape_due and now >= self.next_scrape_at:
            if ok:
                self.state = "running"
                before_downloads = sum(
                    self.queue.summary().get(name, 0)
                    for name in ("pending", "uploading", "uploaded", "embedding", "done", "dead")
                )
                code = self.scrape()
                after_downloads = sum(
                    self.queue.summary().get(name, 0)
                    for name in ("pending", "uploading", "uploaded", "embedding", "done", "dead")
                )
                self.metrics["downloaded"] += max(0, after_downloads - before_downloads)
                self.metrics["errors"] += int(code not in (0, 3))
                if code == 3:
                    self.state = "blocked"
                    self.next_scrape_at = now + self.cfg.blocked_backoff_sec
                else:
                    self.next_scrape_at = now + self.cfg.cycle_interval_sec
                    self.state = "idle" if code == 0 else "error"
            else:
                self.state = "paused"
                self.error = "download sospesi dai limiti disco"
        if drain or action in {"pause", "drain"}:
            self.drain_uploads()
        if action == "pause":
            self.state = "paused"
        elif action == "drain":
            self.state = "draining"
        elif self.state not in {"blocked", "paused", "draining", "error"}:
            self.state = "idle"
        self._write_state(disk)
        self._heartbeat()

    def _upload_loop(self) -> None:
        while not self.stop.should_stop:
            try:
                self._poll_control()
                if self.stop.should_stop:
                    break
                self.drain_uploads()
                self._write_state()
            except Exception as exc:
                self.state = "error"
                self.error = str(exc)[:1000]
                log.exception("errore loop upload")
                self._write_state()
            end = self.clock() + self.cfg.service_poll_sec
            while not self.stop.should_stop and self.clock() < end:
                self.sleep(min(0.5, end - self.clock()))

    def run(self, *, once: bool = False) -> int:
        self.stop.install_signals()
        with ServiceLock(self.cfg.lock_path):
            upload_thread = None
            if not once:
                upload_thread = threading.Thread(
                    target=self._upload_loop, name="sgai-upload-drain", daemon=True
                )
                upload_thread.start()
            try:
                while not self.stop.should_stop:
                    self.run_once(drain=once)
                    if once:
                        break
                    end = self.clock() + self.cfg.service_poll_sec
                    while not self.stop.should_stop and self.clock() < end:
                        self.sleep(min(0.5, end - self.clock()))
            finally:
                self.stop.request_stop()
                if upload_thread:
                    upload_thread.join(timeout=max(1.0, self.cfg.http_timeout + 1))
                self.state = "stopping"
                self._write_state()
                self._heartbeat(force=True)
        return 0


def run_service(cfg: Config, *, once: bool = False) -> int:
    return ScraperService(cfg).run(once=once)
