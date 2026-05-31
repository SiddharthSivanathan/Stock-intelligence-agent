"""Declarative base for all SQLAlchemy models.

All model modules should import `Base` from here and inherit from it. Importing
models elsewhere (e.g. in alembic/env.py) populates `Base.metadata.tables`,
which is how Alembic discovers schema changes for autogeneration.
"""
from __future__ import annotations

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass
