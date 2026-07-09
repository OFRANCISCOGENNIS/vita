from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import Field

from app.schemas.common import CamelModel

JobType = Literal["import", "transcribe", "analyze", "render", "radar_scan"]
JobStatus = Literal["queued", "running", "done", "error"]


class JobOut(CamelModel):
    id: str
    user_id: str | None = None
    project_id: str | None = None
    cut_id: str | None = None
    type: JobType
    status: JobStatus
    progress: int = 0
    eta_seconds: int | None = None
    error_message: str | None = None
    payload: dict | None = None
    created_at: datetime | None = None
    finished_at: datetime | None = None


class RenderJobOut(JobOut):
    """GET /renders/{jobId} — output URLs appear when status == done."""

    download_url: str | None = None
    srt_url: str | None = None
    thumb_url: str | None = None
    meta_txt_url: str | None = None


class RenderRequestIn(CamelModel):
    cut_ids: list[str] = Field(min_length=1)
    resolution: str = "1080p"
    fps: int = 30
    codec: Literal["h264", "h265"] = "h264"
    preset: str = "tiktok"


class RenderBatchOut(CamelModel):
    jobs: list[JobOut]


class BatchZipIn(CamelModel):
    job_ids: list[str] = Field(min_length=1)


class BatchZipOut(CamelModel):
    zip_url: str
