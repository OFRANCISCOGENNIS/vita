"""CortaAí API — FastAPI application entrypoint."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.errors import register_exception_handlers
from app.routers import admin, auth, cuts, dashboard, projects, radar, renders, studio, ws

logger = logging.getLogger("cortaai")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # SEED_ON_STARTUP=1 (docker-compose): create schema + idempotent demo data.
    if settings.seed_on_startup:
        try:
            from app.database import create_all_tables
            from app.seed import run_seed

            create_all_tables()
            run_seed()
            logger.info("Seed executado com sucesso.")
        except Exception:
            logger.exception("Seed falhou (a API continua subindo).")
    yield


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/api/v1/docs",
    openapi_url="/api/v1/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,  # http://localhost:3000
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_exception_handlers(app)

API_PREFIX = settings.api_prefix  # /api/v1
app.include_router(auth.router, prefix=API_PREFIX)
app.include_router(radar.router, prefix=API_PREFIX)
app.include_router(projects.router, prefix=API_PREFIX)
app.include_router(cuts.router, prefix=API_PREFIX)
app.include_router(renders.router, prefix=API_PREFIX)
app.include_router(dashboard.router, prefix=API_PREFIX)
app.include_router(studio.router, prefix=API_PREFIX)
app.include_router(admin.router, prefix=API_PREFIX)
app.include_router(ws.router, prefix=API_PREFIX)


@app.get("/healthz")
def healthz() -> dict:
    return {"status": "ok", "service": "cortaai-api"}
