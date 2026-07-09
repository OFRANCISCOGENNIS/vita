"""Test bootstrap: sqlite database + no external services required."""
import os
import tempfile

# Must be set before any `app.*` import (settings are cached at import time).
_tmpdir = tempfile.mkdtemp(prefix="cortaai-tests-")
os.environ["DATABASE_URL"] = f"sqlite:///{_tmpdir}/test.db"
os.environ["SEED_ON_STARTUP"] = "0"
os.environ["REDIS_URL"] = "redis://localhost:1/0"  # intentionally unreachable
os.environ["CORTAAI_LOCAL_STORAGE"] = _tmpdir

import pytest


@pytest.fixture(scope="session", autouse=True)
def _database():
    from app.database import create_all_tables

    create_all_tables()
    yield


@pytest.fixture(scope="session")
def client():
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as c:
        yield c
