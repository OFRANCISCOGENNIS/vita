"""Shared Pydantic base: SPEC JSON payloads are camelCase (e.g. durationSeconds,
scoreBreakdown.nicheFit) while the database is snake_case — the alias
generator bridges both."""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )


class ErrorBody(CamelModel):
    code: str
    message: str


class ErrorEnvelope(CamelModel):
    error: ErrorBody
