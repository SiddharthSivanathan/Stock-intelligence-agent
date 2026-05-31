"""Centralized application configuration.

All settings are loaded from environment variables (or .env) via pydantic-settings.
Access via the cached `settings` singleton — never read os.environ directly elsewhere
in the codebase, so we have one place to validate and document every knob.
"""
from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ---- App ----
    app_name: str = "Stock Intelligence System"
    app_env: Literal["dev", "staging", "prod"] = "dev"
    api_prefix: str = "/api/v1"
    cors_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:5173", "http://localhost:3000"]
    )

    # ---- PostgreSQL ----
    postgres_user: str = "stockai"
    postgres_password: str = "stockai"
    postgres_host: str = "postgres"
    postgres_port: int = 5432
    postgres_db: str = "stockai"

    @property
    def database_url(self) -> str:
        """Async SQLAlchemy URL — used from Phase 1."""
        return (
            f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    # ---- Redis ----
    redis_host: str = "redis"
    redis_port: int = 6379

    @property
    def redis_url(self) -> str:
        return f"redis://{self.redis_host}:{self.redis_port}/0"

    # ---- ChromaDB ----
    chroma_host: str = "chroma"
    chroma_port: int = 8000

    # ---- LLM provider ----
    llm_provider: Literal["ollama", "openai", "gemini"] = "ollama"
    ollama_base_url: str = "http://host.docker.internal:11434"
    ollama_model: str = "llama3"
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-1.5-flash"

    # ---- Embeddings ----
    embedding_model: str = "BAAI/bge-small-en-v1.5"

    # ---- Auth (Phase 1+) ----
    jwt_secret: str = "change-me-please-this-must-be-at-least-32-chars-long"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 30
    refresh_token_days: int = 7

    # ---- External data APIs (Phase 2+) ----
    finnhub_api_key: str = ""
    newsapi_key: str = ""
    reddit_client_id: str = ""
    reddit_client_secret: str = ""

    # ---- SMTP (Phase 11) ----
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    smtp_use_tls: bool = True

    # ---- Ops (Phase 12) ----
    run_migrations_on_start: bool = False


@lru_cache
def get_settings() -> Settings:
    """Cached factory so .env is parsed once per process."""
    return Settings()


settings = get_settings()
