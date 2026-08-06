"""
MoneyPrinterV2 web dashboard.

Serves a REST API over the same JSON caches and config.json the CLI uses,
plus a single-page frontend. Run from the project root:

    uvicorn web.server:app --port 8000
"""

import os
import sys
import json
import shutil
from uuid import uuid4

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(PROJECT_ROOT, "src")

# config.py derives ROOT_DIR from sys.path[0], so src must be first on the
# path before it is imported (same contract as `python src/main.py`).
if sys.path[0] != SRC_DIR:
    sys.path.insert(0, SRC_DIR)

# The CLI requires config.json to exist; the web server bootstraps it from
# the example so a fresh clone can start without manual setup.
_config_path = os.path.join(PROJECT_ROOT, "config.json")
if not os.path.exists(_config_path):
    shutil.copyfile(os.path.join(PROJECT_ROOT, "config.example.json"), _config_path)

import config as mp_config

mp_config.ROOT_DIR = PROJECT_ROOT

from cache import (
    get_accounts,
    add_account,
    remove_account,
    get_products,
    add_product,
)

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from web.jobs import JobManager

app = FastAPI(title="MoneyPrinterV2", docs_url="/api/docs", openapi_url="/api/openapi.json")

jobs = JobManager(log_dir=os.path.join(PROJECT_ROOT, ".mp", "jobs"))

PROVIDERS = {"youtube", "twitter"}

SECRET_MARKERS = ("api_key", "password", "smtp", "token", "secret")


class YouTubeAccountIn(BaseModel):
    nickname: str = Field(min_length=1)
    firefox_profile: str = ""
    niche: str = Field(min_length=1)
    language: str = Field(min_length=1)


class TwitterAccountIn(BaseModel):
    nickname: str = Field(min_length=1)
    firefox_profile: str = ""
    topic: str = Field(min_length=1)


class ProductIn(BaseModel):
    affiliate_link: str = Field(min_length=1)
    twitter_uuid: str = Field(min_length=1)


def _require_provider(provider: str) -> None:
    if provider not in PROVIDERS:
        raise HTTPException(status_code=404, detail=f"Unknown provider '{provider}'.")


def _mask_secrets(value, key_hint: str = ""):
    """Recursively masks values whose keys look like credentials."""
    if isinstance(value, dict):
        return {k: _mask_secrets(v, k) for k, v in value.items()}
    if isinstance(value, list):
        return [_mask_secrets(v, key_hint) for v in value]
    hint = key_hint.lower()
    if isinstance(value, str) and value and any(m in hint for m in SECRET_MARKERS):
        return "••••••" + value[-4:] if len(value) > 4 else "••••••"
    return value


@app.get("/api/status")
def status():
    youtube_accounts = get_accounts("youtube")
    twitter_accounts = get_accounts("twitter")
    products = get_products()

    ollama_ok = False
    ollama_models: list[str] = []
    try:
        from llm_provider import list_models

        ollama_models = list_models()
        ollama_ok = True
    except Exception:
        pass

    return {
        "youtube_accounts": len(youtube_accounts),
        "twitter_accounts": len(twitter_accounts),
        "products": len(products),
        "videos": sum(len(a.get("videos", [])) for a in youtube_accounts),
        "posts": sum(len(a.get("posts", [])) for a in twitter_accounts),
        "ollama": {"reachable": ollama_ok, "models": ollama_models},
    }


@app.get("/api/accounts/{provider}")
def list_accounts(provider: str):
    _require_provider(provider)
    return get_accounts(provider)


@app.post("/api/accounts/youtube", status_code=201)
def create_youtube_account(payload: YouTubeAccountIn):
    account = {
        "id": str(uuid4()),
        "nickname": payload.nickname,
        "firefox_profile": payload.firefox_profile,
        "niche": payload.niche,
        "language": payload.language,
        "videos": [],
    }
    add_account("youtube", account)
    return account


@app.post("/api/accounts/twitter", status_code=201)
def create_twitter_account(payload: TwitterAccountIn):
    account = {
        "id": str(uuid4()),
        "nickname": payload.nickname,
        "firefox_profile": payload.firefox_profile,
        "topic": payload.topic,
        "posts": [],
    }
    add_account("twitter", account)
    return account


@app.delete("/api/accounts/{provider}/{account_id}", status_code=204)
def delete_account(provider: str, account_id: str):
    _require_provider(provider)
    if not any(a["id"] == account_id for a in get_accounts(provider)):
        raise HTTPException(status_code=404, detail="Account not found.")
    remove_account(provider, account_id)


@app.get("/api/accounts/youtube/{account_id}/videos")
def list_videos(account_id: str):
    for account in get_accounts("youtube"):
        if account["id"] == account_id:
            return account.get("videos", [])
    raise HTTPException(status_code=404, detail="Account not found.")


@app.get("/api/accounts/twitter/{account_id}/posts")
def list_posts(account_id: str):
    for account in get_accounts("twitter"):
        if account["id"] == account_id:
            return account.get("posts", [])
    raise HTTPException(status_code=404, detail="Account not found.")


@app.get("/api/products")
def list_products():
    return get_products()


@app.post("/api/products", status_code=201)
def create_product(payload: ProductIn):
    if not any(a["id"] == payload.twitter_uuid for a in get_accounts("twitter")):
        raise HTTPException(status_code=422, detail="twitter_uuid does not match any Twitter account.")
    product = {
        "id": str(uuid4()),
        "affiliate_link": payload.affiliate_link,
        "twitter_uuid": payload.twitter_uuid,
    }
    add_product(product)
    return product


@app.get("/api/config")
def read_config():
    with open(_config_path, "r") as file:
        return _mask_secrets(json.load(file))


@app.post("/api/jobs/{provider}/{account_id}", status_code=202)
def run_job(provider: str, account_id: str):
    """
    Fires a one-off generation job (same entry point the CLI scheduler uses).
    Requires a reachable Ollama server with at least one model. The job runs
    in the background; track it via GET /api/jobs/{job_id}.
    """
    _require_provider(provider)
    if not any(a["id"] == account_id for a in get_accounts(provider)):
        raise HTTPException(status_code=404, detail="Account not found.")

    try:
        from llm_provider import list_models

        models = list_models()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Ollama unreachable: {e}")
    if not models:
        raise HTTPException(status_code=503, detail="No Ollama models available.")

    model = mp_config.get_ollama_model() or models[0]
    cron_path = os.path.join(SRC_DIR, "cron.py")
    return jobs.enqueue(
        [sys.executable, cron_path, provider, account_id, model],
        cwd=PROJECT_ROOT,
        meta={"provider": provider, "account_id": account_id, "model": model},
    )


@app.get("/api/jobs")
def list_jobs():
    return jobs.list()


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str):
    job = jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    return job


STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/", include_in_schema=False)
def index():
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))
