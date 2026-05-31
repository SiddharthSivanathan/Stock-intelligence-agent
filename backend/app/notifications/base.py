"""Notifier abstraction — same pattern as LLM / vector store / stream bus.

Phase 11 ships ConsoleNotifier (default) and EmailNotifier (SMTP). A future
WhatsApp / Slack / push notifier just implements this interface and the
factory adds a branch.
"""
from __future__ import annotations

from abc import ABC, abstractmethod


class Notifier(ABC):
    name: str

    @abstractmethod
    async def send(self, *, to: str, subject: str, body: str) -> None: ...
