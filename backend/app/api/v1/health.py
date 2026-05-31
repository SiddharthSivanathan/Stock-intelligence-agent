"""Liveness + readiness endpoints.

  /health : process is up (cheap, used by Docker healthcheck)
  /ready  : downstream services reachable (Postgres + Redis + Chroma, and
            Ollama if it's the configured LLM provider)
"""
from __future__ import annotations

import httpx
from fastapi import APIRouter
from sqlalchemy import text

from app.ai.vectorstore.factory import get_vector_store
from app.api.deps import DbDep
from app.config import settings
from app.core.redis import get_redis_client

router = APIRouter()


@router.get("/health")
async def health() -> dict[str, str]:
    return {
        "status": "ok",
        "app": settings.app_name,
        "env": settings.app_env,
        "llm_provider": settings.llm_provider,
    }


@router.get("/ready")
async def ready(db: DbDep) -> dict:
    components: dict[str, str] = {}

    try:
        await db.execute(text("SELECT 1"))
        components["postgres"] = "ok"
    except Exception as e:
        components["postgres"] = f"error: {e!s}"

    try:
        await get_redis_client().ping()
        components["redis"] = "ok"
    except Exception as e:
        components["redis"] = f"error: {e!s}"

    try:
        await get_vector_store().list_collections()
        components["chroma"] = "ok"
    except Exception as e:
        components["chroma"] = f"error: {e!s}"

    if settings.llm_provider == "ollama":
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                r = await client.get(f"{settings.ollama_base_url}/api/tags")
                r.raise_for_status()
            components["ollama"] = "ok"
        except Exception as e:
            components["ollama"] = f"error: {e!s}"

    all_ok = all(v == "ok" for v in components.values())
    return {
        "status": "ready" if all_ok else "degraded",
        "components": components,
    }
