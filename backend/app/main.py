"""FastAPI entrypoint.

Lifespan boots:
  - Production startup checks (env=prod only)
  - (Optional) Alembic upgrade head
  - Redis pool (fail-fast ping)
  - Price producer (XADDs quotes for all watched symbols every 15s)
  - Price consumer (broadcasts ticks to subscribed WebSockets)
  - Alert evaluator (fires AlertRules when thresholds are crossed)
"""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.router import api_router
from app.config import settings
from app.core.exceptions import AppError
from app.core.redis import close_redis, get_redis_client
from app.logging_setup import setup_logging
from app.streaming.consumers import (
    alert_evaluator_loop,
    price_consumer_loop,
)
from app.streaming.producers import price_producer_loop

setup_logging("DEBUG" if settings.app_env == "dev" else "INFO")
log = logging.getLogger(__name__)


def _validate_prod_settings() -> None:
    """Fail-fast checks that only run when APP_ENV=prod."""
    if settings.app_env != "prod":
        return

    fatal: list[str] = []
    if len(settings.jwt_secret) < 32:
        fatal.append("JWT_SECRET must be at least 32 characters in prod.")
    if "change-me" in settings.jwt_secret.lower():
        fatal.append("JWT_SECRET still contains the default placeholder.")
    if any(o == "*" for o in settings.cors_origins):
        fatal.append("CORS_ORIGINS contains '*' — restrict to known origins.")

    if (
        settings.llm_provider == "ollama"
        and "host.docker.internal" in settings.ollama_base_url
    ):
        log.warning(
            "LLM_PROVIDER=ollama with host.docker.internal may not resolve "
            "in production. Consider switching to openai/gemini or running "
            "Ollama inside the compose network."
        )

    if fatal:
        for msg in fatal:
            log.critical("PROD STARTUP CHECK FAILED: %s", msg)
        raise RuntimeError("Production startup checks failed: " + "; ".join(fatal))


async def _run_migrations() -> None:
    """Run `alembic upgrade head` as a subprocess.

    Single-replica only — race conditions otherwise. For multi-replica deploys
    run migrations manually before rolling the new image.
    """
    log.info("Running alembic upgrade head...")
    proc = await asyncio.create_subprocess_exec(
        "alembic", "upgrade", "head",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )
    stdout, _ = await proc.communicate()
    output = (stdout or b"").decode(errors="replace")
    if proc.returncode != 0:
        log.error("Alembic migration failed (exit %s):\n%s", proc.returncode, output)
        raise RuntimeError("Alembic migration failed at startup")
    log.info("Alembic migration complete.\n%s", output.strip())


async def _cancel(*tasks: asyncio.Task) -> None:
    for t in tasks:
        if t and not t.done():
            t.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("Starting %s (env=%s)", settings.app_name, settings.app_env)
    log.info("LLM provider: %s", settings.llm_provider)

    _validate_prod_settings()

    if settings.run_migrations_on_start:
        await _run_migrations()

    try:
        await get_redis_client().ping()
        log.info("Redis ready at %s", settings.redis_url)
    except Exception as e:
        log.warning("Redis ping failed at startup (continuing): %s", e)

    # Start background streaming workers.
    producer_task = asyncio.create_task(
        price_producer_loop(), name="price_producer"
    )
    consumer_task = asyncio.create_task(
        price_consumer_loop(), name="ws_broadcaster"
    )
    evaluator_task = asyncio.create_task(
        alert_evaluator_loop(), name="alert_evaluator"
    )
    app.state.streaming_tasks = (
        producer_task,
        consumer_task,
        evaluator_task,
    )
    log.info("Streaming workers started")

    yield

    log.info("Stopping streaming workers...")
    await _cancel(*app.state.streaming_tasks)
    await close_redis()
    log.info("Shutting down %s", settings.app_name)


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.app_env != "prod" else None,
    redoc_url="/redoc" if settings.app_env != "prod" else None,
    openapi_url="/openapi.json" if settings.app_env != "prod" else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(AppError)
async def app_error_handler(_: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"code": exc.code, "message": exc.message},
    )


app.include_router(api_router, prefix=settings.api_prefix)


@app.get("/", tags=["root"])
async def root() -> dict[str, str | None]:
    return {
        "name": settings.app_name,
        "env": settings.app_env,
        "docs": "/docs" if settings.app_env != "prod" else None,
        "health": f"{settings.api_prefix}/health",
        "ready": f"{settings.api_prefix}/ready",
        "ws": f"{settings.api_prefix}/ws?token=<jwt>",
    }
