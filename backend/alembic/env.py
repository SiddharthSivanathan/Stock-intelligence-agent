"""Alembic environment — async-aware.

This file does three things:
1. Loads the SQLAlchemy URL from our pydantic Settings (not alembic.ini),
   so a single .env drives both runtime and migrations.
2. Imports every model so Base.metadata is populated when --autogenerate runs.
3. Wraps the migration runner in asyncio because our engine is async.
"""
from __future__ import annotations

import asyncio
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

# --- App imports ---
from app.config import settings
from app.db.base import Base

# Import all model modules so their tables register on Base.metadata.
# Add new models to this import list as the schema grows.
from app.db.models import (  # noqa: F401
    agent_log,
    alert,
    document,
    insight,
    portfolio,
    recommendation,
    user,
    watchlist,
)

# --- Alembic config object ---
config = context.config

# Inject the runtime DB URL.
config.set_main_option("sqlalchemy.url", settings.database_url)

# Configure Python logging per alembic.ini.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Generate SQL scripts without a live DB connection."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        compare_server_default=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    """Run migrations against a live async DB."""
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
