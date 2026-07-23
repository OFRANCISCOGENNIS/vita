"""Declarative base + shared column helpers.

- ids are uuid v4 strings (SPEC convention) stored as String(36) for
  cross-database portability (Postgres in prod, sqlite in tests).
- jsonb columns use JSON with a JSONB variant on Postgres.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, mapped_column


class Base(DeclarativeBase):
    pass


# JSON everywhere, JSONB when running on PostgreSQL.
JsonB = sa.JSON().with_variant(JSONB(), "postgresql")


def new_uuid() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def uuid_pk():  # noqa: ANN201 - SQLAlchemy mapped_column factory
    return mapped_column(sa.String(36), primary_key=True, default=new_uuid)


def created_at_col():  # noqa: ANN201
    return mapped_column(sa.DateTime(timezone=True), nullable=False, default=utcnow)
