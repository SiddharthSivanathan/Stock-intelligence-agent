"""Pytest config.

Pure-unit tests only in this battery — no DB / Redis / Chroma / network.
We restrict to fast, deterministic tests for the indicator math, security
primitives, output parser, and alert match/cooldown logic. End-to-end tests
that touch the stack live elsewhere (deferred to a future phase).
"""
from __future__ import annotations

import os

# Make sure app.config doesn't blow up reading optional env vars during import.
os.environ.setdefault("JWT_SECRET", "test-secret-for-pure-unit-tests-only")
os.environ.setdefault("POSTGRES_HOST", "localhost")
os.environ.setdefault("REDIS_HOST", "localhost")
os.environ.setdefault("CHROMA_HOST", "localhost")
