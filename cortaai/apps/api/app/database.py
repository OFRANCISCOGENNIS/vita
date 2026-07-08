"""SQLAlchemy engine/session management.

Engine creation is lazy so importing the app never requires a live database
(sqlite fallback covers tests and local dev without Postgres).
"""
from __future__ import annotations

from collections.abc import Generator
from functools import lru_cache

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings


@lru_cache
def get_engine() -> Engine:
    url = settings.database_url
    kwargs: dict = {"pool_pre_ping": True}
    if url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}
    return create_engine(url, **kwargs)


@lru_cache
def get_sessionmaker() -> sessionmaker[Session]:
    return sessionmaker(bind=get_engine(), autoflush=False, expire_on_commit=False)


def SessionLocal() -> Session:
    """Open a new session (workers, seed, background threads)."""
    return get_sessionmaker()()


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_all_tables() -> None:
    """Dev/test convenience — production uses Alembic migrations."""
    from app.models import Base

    Base.metadata.create_all(bind=get_engine())
