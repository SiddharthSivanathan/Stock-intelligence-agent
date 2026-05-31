from __future__ import annotations

import logging
from functools import lru_cache

from app.config import settings
from app.notifications.base import Notifier
from app.notifications.console_notifier import ConsoleNotifier
from app.notifications.email_notifier import EmailNotifier

log = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def get_notifier() -> Notifier:
    """Returns SMTP notifier when SMTP_HOST is set; else console."""
    if settings.smtp_host:
        try:
            return EmailNotifier()
        except Exception as e:
            log.warning(
                "EmailNotifier init failed (%s); falling back to console.", e
            )
    return ConsoleNotifier()
