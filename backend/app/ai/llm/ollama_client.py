"""Ollama adapter — talks to a native Ollama daemon over HTTP.

Ollama's REST API is small and stable; we call it directly with httpx to
avoid pulling in the `ollama` SDK. Streaming uses NDJSON (line-delimited JSON).
"""
from __future__ import annotations

import json
from typing import AsyncIterator

import httpx

from app.ai.llm.base import ChatMessage, LLMClient
from app.config import settings
from app.core.exceptions import UpstreamError


class OllamaClient(LLMClient):
    provider_name = "ollama"

    def __init__(
        self,
        base_url: str | None = None,
        model: str | None = None,
    ) -> None:
        self.base_url = (base_url or settings.ollama_base_url).rstrip("/")
        self.model_name = model or settings.ollama_model

    def _payload(
        self,
        messages: list[ChatMessage],
        temperature: float,
        max_tokens: int | None,
        *,
        stream: bool,
    ) -> dict:
        options: dict = {"temperature": temperature}
        if max_tokens is not None:
            # Ollama uses `num_predict` for max output tokens.
            options["num_predict"] = max_tokens
        return {
            "model": self.model_name,
            "messages": [m.model_dump() for m in messages],
            "stream": stream,
            "options": options,
        }

    async def chat(
        self,
        messages: list[ChatMessage],
        *,
        temperature: float = 0.2,
        max_tokens: int | None = None,
    ) -> str:
        payload = self._payload(messages, temperature, max_tokens, stream=False)
        async with httpx.AsyncClient(timeout=300.0) as client:
            try:
                r = await client.post(f"{self.base_url}/api/chat", json=payload)
                r.raise_for_status()
            except httpx.HTTPError as e:
                raise UpstreamError(f"Ollama chat failed: {e}") from e
            data = r.json()
        return data.get("message", {}).get("content", "") or ""

    async def stream(
        self,
        messages: list[ChatMessage],
        *,
        temperature: float = 0.2,
        max_tokens: int | None = None,
    ) -> AsyncIterator[str]:
        payload = self._payload(messages, temperature, max_tokens, stream=True)
        async with httpx.AsyncClient(timeout=300.0) as client:
            try:
                async with client.stream(
                    "POST", f"{self.base_url}/api/chat", json=payload
                ) as r:
                    r.raise_for_status()
                    async for line in r.aiter_lines():
                        if not line:
                            continue
                        try:
                            chunk = json.loads(line)
                        except json.JSONDecodeError:
                            continue
                        delta = chunk.get("message", {}).get("content", "")
                        if delta:
                            yield delta
                        if chunk.get("done"):
                            break
            except httpx.HTTPError as e:
                raise UpstreamError(f"Ollama stream failed: {e}") from e
