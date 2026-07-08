from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import Field

from app.schemas.common import CamelModel

SourceType = Literal["upload", "youtube", "twitch", "vimeo"]
Resolution = Literal["720p", "1080p", "1440p", "2160p"]
Language = Literal["pt-BR", "en", "es", "auto"]
ProjectStatus = Literal["importing", "transcribing", "analyzing", "ready", "error"]
CutMode = Literal["viral", "qa", "tutorial", "quotes", "manual"]


class ProjectOut(CamelModel):
    id: str
    user_id: str
    title: str
    source_type: SourceType
    source_url: str | None = None
    original_filename: str | None = None
    duration_seconds: float | None = None
    resolution: Resolution | None = None
    fps: float | None = None
    language: str = "auto"
    status: ProjectStatus
    thumbnail_url: str | None = None
    storage_key: str | None = None
    created_at: datetime | None = None


class UploadInitIn(CamelModel):
    filename: str
    size_bytes: int = Field(gt=0)
    content_type: str = "video/mp4"


class UploadInitOut(CamelModel):
    upload_id: str
    chunk_size: int
    presigned_urls: list[str]


class UploadCompleteIn(CamelModel):
    upload_id: str


class ImportUrlIn(CamelModel):
    url: str
    quality: str = "1080p"


class UrlPreviewOut(CamelModel):
    title: str
    channel: str | None = None
    duration_seconds: float | None = None
    thumbnail_url: str | None = None
    available_resolutions: list[str] = []


class GenerateCutsIn(CamelModel):
    mode: CutMode = "viral"
    aggressiveness: int = Field(default=3, ge=1, le=5)
    count: int = Field(default=6, ge=1, le=20)


class JobRef(CamelModel):
    job_id: str
