"""Structured stdout logging — Docker captures stdout, so no file handlers needed."""
from __future__ import annotations

import logging
import sys


def setup_logging(level: str = "INFO") -> None:
    fmt = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter(fmt))

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level)

    # Tame noisy third-party loggers.
    for noisy in ("httpx", "httpcore", "asyncio", "watchfiles"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
