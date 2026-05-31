"""Logs notifications to stdout. Default in dev — no SMTP setup required."""
from __future__ import annotations

import logging

from app.notifications.base import Notifier

log = logging.getLogger(__name__)


class ConsoleNotifier(Notifier):
    name = "console"

    async def send(self, *, to: str, subject: str, body: str) -> None:
        log.info(
            "[console-notifier] to=%s subject=%r\n%s",
            to,
            subject,
            body,
        )
