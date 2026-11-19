import os
import sys
import tempfile
from pathlib import Path

_tmp = Path(tempfile.mkdtemp(prefix="statisfy-test-"))
os.environ["STATISFY_DB_URL"] = f"sqlite:///{(_tmp / 'test.db').as_posix()}"
os.environ["STATISFY_BCRYPT_ROUNDS"] = "4"
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.db import engine  # noqa: E402
from app.main import app  # noqa: E402
from app.seed import reset  # noqa: E402


@pytest.fixture
def client():
    reset()
    with TestClient(app) as c:
        yield c
    engine.dispose()


def login(client, username, password=None):
    r = client.post("/api/auth/login", json={"username": username, "password": password or username})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture
def master(client):
    return login(client, "master")


@pytest.fixture
def p1(client):
    return login(client, "giocatore1")


@pytest.fixture
def p2(client):
    return login(client, "giocatore2")
