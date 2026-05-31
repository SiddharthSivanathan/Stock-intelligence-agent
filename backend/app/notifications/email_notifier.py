"""Async SMTP notifier via aiosmtplib.

Tested against Mailtrap / Mailpit / Postmark / Gmail App Passwords. Set:
  SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD, SMTP_FROM, SMTP_USE_TLS
"""
from __future__ import annotations

import logging
from email.message import EmailMessage

import aiosmtplib

from app.config import settings
from app.notifications.base import Notifier

log = logging.getLogger(__name__)


class EmailNotifier(Notifier):
    name = "smtp"

    def __init__(
        self,
        *,
        host: str | None = None,
        port: int | None = None,
        username: str | None = None,
        password: str | None = None,
        from_addr: str | None = None,
        use_tls: bool | None = None,
    ) -> None:
        self.host = host or settings.smtp_host
        self.port = port if port is not None else settings.smtp_port
        self.username = username or settings.smtp_username
        self.password = password or settings.smtp_password
        self.from_addr = from_addr or settings.smtp_from or self.username
        self.use_tls = use_tls if use_tls is not None else settings.smtp_use_tls

        if not self.host:
            raise ValueError("SMTP_HOST is required for EmailNotifier")
        if not self.from_addr:
            raise ValueError("SMTP_FROM (or SMTP_USERNAME) is required for EmailNotifier")

    async def send(self, *, to: str, subject: str, body: str) -> None:
        message = EmailMessage()
        message["From"] = self.from_addr
        message["To"] = to
        message["Subject"] = subject
        message.set_content(body)

        try:
            # `use_tls=True` is implicit TLS on connect (port 465).
            # For STARTTLS (port 587), pass start_tls=True with use_tls=False.
            start_tls = self.port == 587 and self.use_tls
            await aiosmtplib.send(
                message,
                hostname=self.host,
                port=self.port,
                username=self.username or None,
                password=self.password or None,
                use_tls=self.use_tls and not start_tls,
                start_tls=start_tls,
            )
            log.info("Email sent to %s (subject=%r)", to, subject)
        except Exception:
            log.exception("Failed to send email to %s", to)
            raise
