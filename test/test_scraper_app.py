import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import time
import types

import pytest
from flask import Flask

_ROOT = Path(__file__).resolve().parents[1]
api_package = types.ModuleType("api")
api_package.__path__ = [str(_ROOT / "api")]
utils_package = types.ModuleType("api.utils")
utils_package.__path__ = [str(_ROOT / "api" / "utils")]
sys.modules.setdefault("api", api_package)
sys.modules.setdefault("api.utils", utils_package)

_UTILS_PATH = _ROOT / "api" / "utils" / "sentenze_utils.py"
_UTILS_SPEC = importlib.util.spec_from_file_location("api.utils.sentenze_utils", _UTILS_PATH)
sentenze_utils = importlib.util.module_from_spec(_UTILS_SPEC)
assert _UTILS_SPEC and _UTILS_SPEC.loader
sys.modules["api.utils.sentenze_utils"] = sentenze_utils
_UTILS_SPEC.loader.exec_module(sentenze_utils)

build_nome_base = sentenze_utils.build_nome_base
parse_sentenza_name = sentenze_utils.parse_sentenza_name
resolve_lookup_key = sentenze_utils.resolve_lookup_key

_MODULE_PATH = _ROOT / "api" / "apps" / "scraper_app.py"
_SPEC = importlib.util.spec_from_file_location("scraper_app_unit", _MODULE_PATH)
scraper_app = importlib.util.module_from_spec(_SPEC)
assert _SPEC and _SPEC.loader
_SPEC.loader.exec_module(scraper_app)


@pytest.fixture()
def client(monkeypatch):
    app = Flask(__name__)
    app.secret_key = "unit-test-only"
    app.register_blueprint(scraper_app.manager, url_prefix="/v1/scraper")
    monkeypatch.setattr(
        scraper_app,
        "_manifest",
        lambda: ({"totalFiles": 0, "uniqueBase": 0, "duplicateGroups": 0, "index": {}}, object()),
    )
    monkeypatch.setattr(scraper_app, "_docs_for_key", lambda key: ([], object()))
    return app.test_client()


def test_auth_fails_closed_when_tokens_are_absent(client, monkeypatch):
    monkeypatch.delenv("SGAI_SCRAPER_API_TOKEN", raising=False)
    monkeypatch.delenv("SGAI_ADMIN_API_TOKEN", raising=False)
    assert client.get("/v1/scraper/check?nome_base=Sentenza_V10_1_2026").status_code == 401


def test_worker_auth_uses_bearer_token(client, monkeypatch):
    monkeypatch.setenv("SGAI_SCRAPER_API_TOKEN", "worker-secret")
    response = client.get(
        "/v1/scraper/check?nome_base=Sentenza_V10_1_2026",
        headers={"Authorization": "Bearer worker-secret"},
    )
    assert response.status_code == 200
    assert response.get_json()["data"]["shouldUpload"] is True
    assert client.get(
        "/v1/scraper/duplicates",
        headers={"Authorization": "Bearer worker-secret"},
    ).status_code == 401


def test_admin_session_authorizes_admin_and_authenticated_routes(client):
    with client.session_transaction() as browser_session:
        browser_session[scraper_app.ADMIN_SESSION_KEY] = True
        browser_session[scraper_app.ADMIN_LOGIN_AT_KEY] = time.time()
    assert client.get("/v1/scraper/duplicates").status_code == 200
    assert client.get(
        "/v1/scraper/check?nome_base=Sentenza_V10_1_2026"
    ).status_code == 200


def test_control_admin_write_worker_read_and_audit(client, monkeypatch):
    class FakeRedis:
        def __init__(self):
            self.values = {}
            self.saved = []

        def set_obj(self, key, value, exp):
            self.values[key] = json.dumps(value)
            self.saved.append((key, value, exp))
            return True

        def get(self, key):
            return self.values.get(key)

    fake = FakeRedis()
    redis_module = types.ModuleType("rag.utils.redis_conn")
    redis_module.REDIS_CONN = fake
    monkeypatch.setitem(sys.modules, "rag", types.ModuleType("rag"))
    monkeypatch.setitem(sys.modules, "rag.utils", types.ModuleType("rag.utils"))
    monkeypatch.setitem(sys.modules, "rag.utils.redis_conn", redis_module)
    monkeypatch.setenv("SGAI_SCRAPER_API_TOKEN", "worker-secret")
    with client.session_transaction() as browser_session:
        browser_session[scraper_app.ADMIN_SESSION_KEY] = True
        browser_session[scraper_app.ADMIN_LOGIN_AT_KEY] = time.time()

    written = client.post(
        "/v1/scraper/control",
        json={"action": "drain", "workerId": "worker-1"},
    )
    assert written.status_code == 200
    assert len(fake.saved) == 2
    assert any(":audit:" in key for key, _value, _ttl in fake.saved)

    read = client.get(
        "/v1/scraper/control?workerId=worker-1",
        headers={"Authorization": "Bearer worker-secret"},
    )
    assert read.status_code == 200
    assert read.get_json()["data"]["action"] == "drain"


def test_worker_token_cannot_write_control(client, monkeypatch):
    monkeypatch.setenv("SGAI_SCRAPER_API_TOKEN", "worker-secret")
    response = client.post(
        "/v1/scraper/control",
        json={"action": "stop", "workerId": "all"},
        headers={"Authorization": "Bearer worker-secret"},
    )
    assert response.status_code == 401


@pytest.mark.parametrize("tipo", ["Sentenza", "Ordinanza", "Decreto"])
def test_canonical_names_support_all_types(tipo):
    base = build_nome_base("v10", 13747, 2021, tipo)
    parsed = parse_sentenza_name(f"{base}.pdf")
    assert parsed["nomeBase"] == base
    assert parsed["tipo"] == tipo
    assert resolve_lookup_key(codice="v10", numero="13747", anno="2021", tipo=tipo) == base


def test_historical_sentenza_and_noncanonical_copy():
    assert parse_sentenza_name("Sentenza_V10_13747_2021.pdf")["tipo"] == "Sentenza"
    assert scraper_app.canonical_pdf("Sentenza_V10_13747_2021 (1).pdf") is None


def test_sha256_is_required_and_verified():
    blob = b"%PDF-1.4 test"
    digest = hashlib.sha256(blob).hexdigest()
    assert scraper_app.verify_sha256(blob, digest)
    assert not scraper_app.verify_sha256(blob, "")
    assert not scraper_app.verify_sha256(blob + b"x", digest)


def test_requeue_limit_is_capped():
    assert scraper_app.capped_requeue_limit(9999) == 200
    assert scraper_app.capped_requeue_limit(0) == 1
    assert scraper_app.capped_requeue_limit("bad") == 200


class FakeLock:
    def __init__(self, acquired=True):
        self.acquired = acquired
        self.released = False

    def acquire(self):
        return self.acquired

    def release(self):
        self.released = True


def test_idempotence_checks_inside_lock_and_does_not_create_existing():
    events = []
    lock = FakeLock()

    def find_existing():
        events.append("find")
        return {"id": "existing"}

    outcome, value = scraper_app.idempotent_create(
        find_existing, lambda: events.append("create"), lock
    )
    assert outcome == "existing"
    assert value["id"] == "existing"
    assert events == ["find"]
    assert lock.released


def test_idempotence_fails_if_lock_unavailable():
    with pytest.raises(scraper_app.LockUnavailable):
        scraper_app.idempotent_create(lambda: None, lambda: {}, FakeLock(False))


@pytest.mark.parametrize(
    "state",
    ["paused", "waiting", "rate_limited", "blocked", "completed"],
)
def test_heartbeat_accepts_operational_states_and_preserves_fields(
    state, client, monkeypatch
):
    class FakeRedis:
        saved = None

        def sadd(self, key, value):
            return True

        def set_obj(self, key, value, exp):
            self.saved = value
            return True

    fake = FakeRedis()
    redis_module = types.ModuleType("rag.utils.redis_conn")
    redis_module.REDIS_CONN = fake
    monkeypatch.setitem(sys.modules, "rag", types.ModuleType("rag"))
    monkeypatch.setitem(sys.modules, "rag.utils", types.ModuleType("rag.utils"))
    monkeypatch.setitem(sys.modules, "rag.utils.redis_conn", redis_module)
    monkeypatch.setenv("SGAI_SCRAPER_API_TOKEN", "worker-secret")
    payload = {
        "workerId": "worker-1",
        "status": state,
        "checkpoint": {"page": 7},
        "metrics": {"uploaded": 3},
        "queue": [{"name": "pending", "size": 2}],
        "error": None,
    }
    response = client.post(
        "/v1/scraper/heartbeat",
        json=payload,
        headers={"Authorization": "Bearer worker-secret"},
    )
    assert response.status_code == 200
    assert fake.saved["status"] == state
    assert fake.saved["checkpoint"] == {"page": 7}
    assert fake.saved["metrics"] == {"uploaded": 3}
    assert fake.saved["queue"][0]["size"] == 2
    assert "error" in fake.saved


def test_heartbeat_rejects_excessive_depth(client, monkeypatch):
    monkeypatch.setenv("SGAI_SCRAPER_API_TOKEN", "worker-secret")
    deep = {"a": {"b": {"c": {"d": {"e": {"f": 1}}}}}}
    response = client.post(
        "/v1/scraper/heartbeat",
        json={"workerId": "worker-1", "status": "idle", "checkpoint": deep},
        headers={"Authorization": "Bearer worker-secret"},
    )
    assert response.status_code == 400


def test_repeated_heartbeat_accepts_existing_registry_member(client, monkeypatch):
    class FakeRedis:
        def sadd(self, key, value):
            return 0

        def set_obj(self, key, value, exp):
            return True

    redis_module = types.ModuleType("rag.utils.redis_conn")
    redis_module.REDIS_CONN = FakeRedis()
    monkeypatch.setitem(sys.modules, "rag", types.ModuleType("rag"))
    monkeypatch.setitem(sys.modules, "rag.utils", types.ModuleType("rag.utils"))
    monkeypatch.setitem(sys.modules, "rag.utils.redis_conn", redis_module)
    monkeypatch.setenv("SGAI_SCRAPER_API_TOKEN", "worker-secret")
    response = client.post(
        "/v1/scraper/heartbeat",
        json={"workerId": "worker-1", "status": "idle"},
        headers={"Authorization": "Bearer worker-secret"},
    )
    assert response.status_code == 200


def test_dataset_progress_summary():
    summary = scraper_app.dataset_progress_summary([
        {"run": "0", "chunk_num": 0, "progress": 0},
        {"run": "1", "chunk_num": 0, "progress": 0.5},
        {"run": "3", "chunk_num": 8, "progress": 1},
        {"run": "4", "chunk_num": 0, "progress": 0},
    ])
    assert summary["statusCounts"] == {
        "unstart": 1, "running": 1, "cancel": 0, "done": 1, "fail": 1
    }
    assert summary["withEmbedding"] == 1
    assert summary["withoutEmbedding"] == 3
    assert summary["totalChunks"] == 8
    assert summary["averageProgress"] == pytest.approx(0.375)


def test_manifest_uses_run_not_row_validity_status():
    manifest = sentenze_utils.build_manifest_index([
        {
            "id": "doc-1",
            "name": "Sentenza_V10_1_2026.pdf",
            "status": "1",
            "run": "3",
            "chunk_num": 4,
        }
    ])
    entry = manifest["index"]["sentenza_v10_1_2026"]
    assert entry["hasDone"] is True
    assert entry["hasEmbedding"] is True


def test_invalid_pdf_fails_closed():
    errors = scraper_app.validate_pdf(b"%PDF-1.7\nnot a real pdf\n%%EOF")
    assert errors
    assert any("structure" in error or "trailer" in error for error in errors)
    assert scraper_app.validate_pdf(b"plain text")


def test_manifest_cache_and_invalidation(monkeypatch):
    calls = []
    kb = types.SimpleNamespace(id="kb")
    monkeypatch.setenv("SGAI_SCRAPER_MANIFEST_TTL", "300")
    monkeypatch.setattr(
        scraper_app,
        "_rows",
        lambda: (calls.append(1) or [{"name": "Sentenza_V10_1_2026.pdf", "run": "0"}], kb),
    )
    scraper_app._invalidate_manifest_cache()
    first, _ = scraper_app._manifest()
    second, _ = scraper_app._manifest()
    assert first is second
    assert len(calls) == 1
    scraper_app._invalidate_manifest_cache()
    scraper_app._manifest()
    assert len(calls) == 2


@pytest.mark.parametrize("run", ["0", "3", "4"])
def test_existing_without_embeddings_needs_requeue(run):
    document = scraper_app._doc_public({
        "id": "doc-1", "name": "Sentenza_V10_1_2026.pdf",
        "run": run, "chunk_num": 0,
    })
    assert document["needsRequeue"] is True
