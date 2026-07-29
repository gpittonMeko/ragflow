import importlib.util
from pathlib import Path
import sys
import types

import pytest
from flask import Flask

ROOT = Path(__file__).resolve().parents[1]

api_package = types.ModuleType("api")
api_package.__path__ = [str(ROOT / "api")]
api_package.settings = types.SimpleNamespace(
    RetCode=types.SimpleNamespace(ARGUMENT_ERROR=400, DATA_ERROR=500)
)
utils_package = types.ModuleType("api.utils")
utils_package.__path__ = [str(ROOT / "api" / "utils")]
utils_package.timestamp_to_date = lambda value: str(value)
api_db = types.ModuleType("api.db")
api_db.TaskStatus = types.SimpleNamespace(
    UNSTART=types.SimpleNamespace(value="0"),
    RUNNING=types.SimpleNamespace(value="1"),
    CANCEL=types.SimpleNamespace(value="2"),
    DONE=types.SimpleNamespace(value="3"),
    FAIL=types.SimpleNamespace(value="4"),
)
api_db.StatusEnum = types.SimpleNamespace(VALID=types.SimpleNamespace(value="1"))
db_models = types.ModuleType("api.db.db_models")
for name in ("API4Conversation", "DB", "Document", "Knowledgebase", "Task"):
    setattr(db_models, name, object())
api_utils = types.ModuleType("api.utils.api_utils")
api_utils.server_error_response = lambda error: ({"error": str(error)}, 500)
api_utils.get_json_result = lambda data=None, **_kwargs: {"data": data}
peewee = types.ModuleType("peewee")
peewee.fn = types.SimpleNamespace()
peewee.Case = object

sys.modules.setdefault("api", api_package)
sys.modules.setdefault("api.utils", utils_package)
sys.modules.setdefault("api.db", api_db)
sys.modules.setdefault("api.db.db_models", db_models)
sys.modules.setdefault("api.utils.api_utils", api_utils)
sys.modules.setdefault("peewee", peewee)

spec = importlib.util.spec_from_file_location(
    "admin_app_auth_unit", ROOT / "api" / "apps" / "admin_app.py"
)
admin_app = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(admin_app)


@pytest.fixture()
def client():
    app = Flask(__name__)
    app.secret_key = "unit-test-only"
    app.register_blueprint(admin_app.manager, url_prefix="/v1/admin")
    return app.test_client()


def test_login_fails_closed_without_configured_password(client, monkeypatch):
    monkeypatch.delenv("SGAI_ADMIN_PASSWORD", raising=False)
    response = client.post("/v1/admin/auth/login", json={"password": "anything"})
    assert response.status_code == 401
    assert client.get("/v1/admin/auth/status").get_json()["data"]["authenticated"] is False


def test_session_login_status_logout(client, monkeypatch):
    monkeypatch.setenv("SGAI_ADMIN_PASSWORD", "server-secret")
    assert client.post(
        "/v1/admin/auth/login", json={"password": "wrong"}
    ).status_code == 401
    login = client.post(
        "/v1/admin/auth/login", json={"password": "server-secret"}
    )
    assert login.status_code == 200
    assert client.get("/v1/admin/auth/status").get_json()["data"]["authenticated"] is True
    assert client.post("/v1/admin/auth/logout").status_code == 200
    assert client.get("/v1/admin/auth/status").get_json()["data"]["authenticated"] is False


def test_admin_api_bearer_is_allowed_for_automation(client, monkeypatch):
    monkeypatch.setenv("SGAI_ADMIN_API_TOKEN", "automation-secret")
    response = client.get(
        "/v1/admin/auth/status",
        headers={"Authorization": "Bearer automation-secret"},
    )
    assert response.get_json()["data"]["authenticated"] is True


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("post", "/v1/admin/auth/logout"),
        ("post", "/v1/admin/user-sessions"),
        ("get", "/v1/admin/knowledge-status"),
        ("get", "/v1/admin/sentenze-inventory"),
        ("get", "/v1/admin/sentenze-export"),
        ("get", "/v1/admin/sentenze-manifest"),
        ("get", "/v1/admin/sentenze-check"),
        ("get", "/v1/admin/sentenze-codici"),
        ("post", "/v1/admin/requeue-unstart-documents"),
    ],
)
def test_every_admin_route_requires_authentication(client, monkeypatch, method, path):
    monkeypatch.delenv("SGAI_ADMIN_API_TOKEN", raising=False)
    response = getattr(client, method)(path)
    assert response.status_code == 401


def test_sentenze_routes_are_registered():
    app = Flask(__name__)
    app.secret_key = "unit-test-only"
    app.register_blueprint(admin_app.manager, url_prefix="/v1/admin")
    registered = {rule.rule for rule in app.url_map.iter_rules()}
    assert {
        "/v1/admin/sentenze-inventory",
        "/v1/admin/sentenze-export",
        "/v1/admin/sentenze-manifest",
        "/v1/admin/sentenze-check",
        "/v1/admin/sentenze-codici",
    } <= registered
