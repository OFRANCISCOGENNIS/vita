"""Application settings, loaded from environment variables (pydantic-settings).

Every external integration key is optional: when absent the code paths fall
back to deterministic mocks so the whole stack runs offline.
"""
from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    app_name: str = "CortaAí API"
    environment: str = "development"
    api_prefix: str = "/api/v1"

    # --- Infra -----------------------------------------------------------
    # DATABASE_URL — Postgres in docker-compose; sqlite fallback keeps the app
    # importable/runnable without Postgres (dev + tests).
    database_url: str = "sqlite:///./cortaai_dev.db"
    redis_url: str = "redis://localhost:6379/0"

    # --- Auth ------------------------------------------------------------
    jwt_secret: str = "dev-secret-troque-em-producao-0123456789abcdef"
    jwt_algorithm: str = "HS256"
    jwt_expires_minutes: int = 60 * 24 * 7  # 7 days
    # INTEGRAÇÃO PAGA/EXTERNA: Google OAuth (client id used to verify id_token)
    google_client_id: str | None = None

    # --- Storage (MinIO / S3) ---------------------------------------------
    s3_endpoint_url: str = "http://localhost:9000"
    s3_public_endpoint_url: str | None = None  # URL the browser can reach (defaults to endpoint)
    s3_access_key: str = "minioadmin"
    s3_secret_key: str = "minioadmin"
    s3_bucket: str = "cortaai"
    s3_region: str = "us-east-1"
    upload_chunk_size_bytes: int = 8 * 1024 * 1024  # 8 MiB multipart chunks

    # --- External paid services -------------------------------------------
    # INTEGRAÇÃO PAGA: Stripe
    stripe_secret_key: str | None = None
    stripe_webhook_secret: str | None = None
    # INTEGRAÇÃO PAGA: YouTube Data API v3 (Radar Viral)
    youtube_api_key: str | None = None
    # INTEGRAÇÃO PAGA: LLM (títulos/descrições/hashtags/Raio-X)
    openai_api_key: str | None = None
    anthropic_api_key: str | None = None
    # INTEGRAÇÃO PAGA: Kling AI API (ESTÚDIO IA — geração de vídeo por IA).
    # Alternativas equivalentes: Runway, Luma (Dream Machine), Pika.
    # Sem chave, o Estúdio usa o mock determinístico (model="mock").
    kling_api_key: str | None = None
    kling_api_base: str = "https://api.klingai.com"
    kling_model: str = "kling-v1"
    # Teto de gerações do Estúdio IA no plano Grátis (SPEC: recurso pesado de GPU).
    studio_free_generation_limit: int = 3

    # --- App behaviour -----------------------------------------------------
    cors_origins: str = "http://localhost:3000"
    seed_on_startup: bool = False  # SEED_ON_STARTUP=1 in docker-compose
    admin_emails: str = "admin@cortaai.com"
    radar_cache_ttl_seconds: int = 1800  # quota-safe cache for the YouTube API

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def admin_emails_list(self) -> list[str]:
        return [e.strip().lower() for e in self.admin_emails.split(",") if e.strip()]

    @property
    def s3_public_endpoint(self) -> str:
        return self.s3_public_endpoint_url or self.s3_endpoint_url


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
