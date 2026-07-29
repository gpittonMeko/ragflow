from __future__ import annotations

import tempfile
import time
import unittest
from pathlib import Path

import requests

from scraper_mef.client import ACTIVE_PAGE_SELECTOR, NEXT_PAGE_SELECTOR, LiveMefClient
from scraper_mef.config import Config
from scraper_mef.service import ScraperService, disk_guard
from scraper_mef.upload import SgaiClient, SgaiOfflineError, SgaiWakeManager, UploadQueue


class Response:
    def __init__(self, status=200, data=None):
        self.status_code = status
        self._data = {"data": data or {}}

    def json(self):
        return self._data

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.HTTPError(str(self.status_code))


class RequestSession:
    def __init__(self, outcomes):
        self.outcomes = list(outcomes)
        self.calls = 0

    def request(self, *_args, **_kwargs):
        self.calls += 1
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


class WakeSession:
    def __init__(self):
        self.calls = 0

    def post(self, *_args, **_kwargs):
        self.calls += 1
        return Response()


class TestUploadQueue(unittest.TestCase):
    def test_idempotence_lease_and_crash_recovery(self):
        with tempfile.TemporaryDirectory() as tmp:
            pdf = Path(tmp) / "Sentenza_V10_1_2026.pdf"
            pdf.write_bytes(b"%PDF-1.4\n%%EOF")
            queue = UploadQueue(Path(tmp) / "queue.db")
            first = queue.enqueue(pdf)
            second = queue.enqueue(pdf)
            self.assertEqual(first["nome_base"], second["nome_base"])
            self.assertEqual(len(queue.items()), 1)
            item = queue.claim(lease_sec=1, now=10)
            self.assertEqual(item.status, "uploading")
            self.assertIsNone(queue.claim(now=10.5))
            self.assertEqual(queue.recover_expired(now=12), 1)
            recovered = queue.claim(now=12)
            self.assertEqual(recovered.nome_base, item.nome_base)
            self.assertEqual(recovered.attempts, 2)


class TestSgaiClient(unittest.TestCase):
    def test_transport_retry_then_success(self):
        session = RequestSession(
            [requests.ConnectionError("offline"), Response(data={"shouldUpload": True})]
        )
        client = SgaiClient(
            "https://sgai.invalid", "secret", retries=1, backoff=0, session=session, sleep=lambda _: None
        )
        self.assertTrue(client.check("Sentenza_V10_1_2026")["shouldUpload"])
        self.assertEqual(session.calls, 2)

    def test_control_poll_uses_worker_endpoint(self):
        session = RequestSession([Response(data={"action": "pause"})])
        client = SgaiClient(
            "https://sgai.invalid", "secret", retries=0, session=session
        )
        self.assertEqual(client.control("worker-1")["action"], "pause")

    def test_offline_wakes_and_waits_for_progress(self):
        class Client:
            calls = 0

            def progress(self):
                self.calls += 1
                if self.calls < 2:
                    raise SgaiOfflineError("offline")
                return {}

        now = [0.0]
        wake_session = WakeSession()
        manager = SgaiWakeManager(
            Client(),
            "https://wake.invalid",
            "target",
            cooldown=10,
            session=wake_session,
            sleep=lambda seconds: now.__setitem__(0, now[0] + seconds),
            clock=lambda: now[0],
        )
        self.assertTrue(manager.ensure_awake(pending=True, wait_seconds=30))
        self.assertEqual(wake_session.calls, 1)


class Locator:
    def __init__(self, *, text="", attrs=None, count=1, parent=None, click=None):
        self.text = text
        self.attrs = attrs or {}
        self._count = count
        self._parent = parent
        self._click = click

    @property
    def first(self):
        return self

    def count(self):
        return self._count

    def inner_text(self, **_kwargs):
        return self.text

    def get_attribute(self, name):
        return self.attrs.get(name)

    def locator(self, _selector):
        return self._parent or Locator(attrs={})

    def click(self):
        if self._click:
            self._click()


class FakePage:
    def __init__(self):
        self.number = 1
        self.href = "/doc/1"

    def locator(self, selector):
        if selector == ACTIVE_PAGE_SELECTOR:
            return Locator(text=str(self.number))
        if selector == NEXT_PAGE_SELECTOR:
            return Locator(
                attrs={"aria-disabled": "false"},
                parent=Locator(attrs={"class": "page-item"}),
                click=self._next,
            )
        return Locator(attrs={"href": self.href})

    def _next(self):
        self.number = 2
        self.href = "/doc/2"

    def wait_for_selector(self, *_args, **_kwargs):
        return True


class TestPagination(unittest.TestCase):
    def test_current_next_has_next(self):
        client = LiveMefClient(min_action_interval=0)
        client.page = FakePage()
        self.assertEqual(client.current_page_number(), 1)
        self.assertTrue(client.has_next_page())
        self.assertTrue(client.next_page(timeout_ms=100))
        self.assertEqual(client.current_page_number(), 2)


class FakeWake:
    def ensure_awake(self, **_kwargs):
        return True

    def wake(self):
        return False


class FakeSgai:
    def __init__(self):
        self.progress_done = False
        self.upload_calls = 0
        self.control_action = "resume"

    def heartbeat(self, *_args, **_kwargs):
        return {}

    def check(self, _nome):
        return {"has": False, "shouldUpload": True}

    def control(self, _worker_id):
        return {"action": self.control_action}

    def upload(self, _path, _sha):
        self.upload_calls += 1
        return {"document": {"id": "doc-1"}}

    def progress(self, _nome=None):
        return {"hasEmbedding": self.progress_done}


def configured(tmp: str) -> Config:
    cfg = Config()
    root = Path(tmp)
    cfg.output_dir = root / "spool"
    cfg.tmp_dir = root / "tmp"
    cfg.queue_path = root / "queue.db"
    cfg.state_path = root / "state.json"
    cfg.checkpoint_path = root / "checkpoint.json"
    cfg.lock_path = root / "service.lock"
    cfg.upload_enabled = True
    cfg.sgai_worker_token = "not-logged"
    cfg.upload_batch_size = 1
    cfg.max_attempts = 3
    cfg.claim_lease_sec = 60
    cfg.progress_poll_sec = 0
    cfg.retry_base = 0.01
    cfg.retry_max = 0.01
    cfg.max_spool_bytes = 10_000_000
    cfg.min_free_bytes = 0
    cfg.cycle_interval_sec = 60
    return cfg


class TestService(unittest.TestCase):
    def test_disk_guard(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp)
            (path / "x.pdf").write_bytes(b"x" * 20)
            ok, info = disk_guard(path, max_spool_bytes=10, min_free_bytes=0)
            self.assertFalse(ok)
            self.assertEqual(info["spoolBytes"], 20)

    def test_single_run_upload_then_progress_done(self):
        with tempfile.TemporaryDirectory() as tmp:
            cfg = configured(tmp)
            cfg.output_dir.mkdir()
            pdf = cfg.output_dir / "Sentenza_V10_1_2026.pdf"
            pdf.write_bytes(b"%PDF-1.4\n%%EOF")
            queue = UploadQueue(cfg.queue_path)
            queue.enqueue(pdf)
            sgai = FakeSgai()
            service = ScraperService(
                cfg,
                queue=queue,
                client=sgai,
                wake=FakeWake(),
                scrape=lambda: 0,
                jitter=lambda a, _b: a,
            )
            service.run_once()
            self.assertEqual(queue.items()[0]["status"], "embedding")
            sgai.progress_done = True
            service.run_once(scrape_due=False)
            self.assertEqual(queue.items()[0]["status"], "done")
            self.assertTrue(cfg.state_path.exists())
            self.assertEqual(sgai.upload_calls, 1)

    def test_upload_failure_retries_without_deleting_pdf(self):
        with tempfile.TemporaryDirectory() as tmp:
            cfg = configured(tmp)
            cfg.output_dir.mkdir()
            pdf = cfg.output_dir / "Sentenza_V10_2_2026.pdf"
            pdf.write_bytes(b"%PDF-1.4\n%%EOF")
            queue = UploadQueue(cfg.queue_path)
            queue.enqueue(pdf)

            class Offline(FakeSgai):
                def upload(self, _path, _sha):
                    raise SgaiOfflineError("offline")

            service = ScraperService(
                cfg, queue=queue, client=Offline(), wake=FakeWake(), scrape=lambda: 0
            )
            service.run_once()
            row = queue.items()[0]
            self.assertEqual(row["status"], "pending")
            self.assertEqual(row["attempts"], 1)
            self.assertTrue(pdf.exists())

    def test_service_single_run_acquires_and_releases_lock(self):
        with tempfile.TemporaryDirectory() as tmp:
            cfg = configured(tmp)
            cfg.upload_enabled = False
            calls = []
            service = ScraperService(cfg, scrape=lambda: calls.append(1) or 0)
            self.assertEqual(service.run(once=True), 0)
            self.assertEqual(calls, [1])
            self.assertFalse(cfg.lock_path.exists())
            self.assertTrue(cfg.state_path.exists())

    def test_retryable_portal_error_uses_short_service_backoff(self):
        with tempfile.TemporaryDirectory() as tmp:
            cfg = configured(tmp)
            cfg.upload_enabled = False
            cfg.blocked_backoff_sec = 21600
            service = ScraperService(
                cfg,
                scrape=lambda: 4,
                clock=lambda: 100.0,
                jitter=lambda low, _high: low,
            )
            service.run_once(drain=False)
            self.assertEqual(service.state, "error")
            self.assertGreater(service.next_scrape_at, 100.0)
            self.assertLess(service.next_scrape_at, 100.0 + cfg.blocked_backoff_sec)

    def test_control_pause_drain_resume_and_stop_transitions(self):
        with tempfile.TemporaryDirectory() as tmp:
            cfg = configured(tmp)
            cfg.upload_enabled = False
            scrape_calls = []
            sgai = FakeSgai()
            service = ScraperService(
                cfg,
                client=sgai,
                scrape=lambda: scrape_calls.append(1) or 0,
            )

            sgai.control_action = "pause"
            service.run_once()
            self.assertEqual(service.state, "paused")
            self.assertEqual(scrape_calls, [])

            sgai.control_action = "drain"
            service.run_once()
            self.assertEqual(service.state, "draining")
            self.assertEqual(scrape_calls, [])

            sgai.control_action = "resume"
            service.run_once()
            self.assertEqual(service.desired_state, "resume")
            self.assertEqual(scrape_calls, [1])

        with tempfile.TemporaryDirectory() as tmp:
            cfg = configured(tmp)
            cfg.upload_enabled = False
            sgai = FakeSgai()
            sgai.control_action = "stop"
            service = ScraperService(cfg, client=sgai, scrape=lambda: 0)
            service.run_once()
            self.assertTrue(service.stop.should_stop)
            self.assertEqual(service.state, "stopping")


if __name__ == "__main__":
    unittest.main()
