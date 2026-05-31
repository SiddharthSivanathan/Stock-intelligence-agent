"""LLM abstraction.

Every agent in this project talks to an LLMClient — never to a vendor SDK
directly. Adding a new provider is implementing this interface and
registering it in factory.py. No agent code changes.

Two operations:
  chat()   : one-shot, returns the full completion string
  stream() : async generator yielding incremental text deltas

Tool calling will be added in a later phase when LangGraph agents need it.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import AsyncIterator, Literal

from pydantic import BaseModel

Role = Literal["system", "user", "assistant"]


class ChatMessage(BaseModel):
    role: Role
    content: str


class LLMClient(ABC):
    provider_name: str
    model_name: str

    @abstractmethod
    async def chat(
        self,
        messages: list[ChatMessage],
        *,
        temperature: float = 0.2,
        max_tokens: int | None = None,
    ) -> str: ...

    @abstractmethod
    def stream(
        self,
        messages: list[ChatMessage],
        *,
        temperature: float = 0.2,
        max_tokens: int | None = None,
    ) -> AsyncIterator[str]:
        """Implementations are async generators yielding token deltas."""
        ...
