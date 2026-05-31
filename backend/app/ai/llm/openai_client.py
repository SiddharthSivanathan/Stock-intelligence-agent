"""OpenAI adapter — talks to api.openai.com/v1/chat/completions over httpx.

Streaming uses Server-Sent Events: lines prefixed with `data: ` and a final
`data: [DONE]` sentinel. We parse incremental token deltas from each chunk.
"""
from __future__ import annotations

import json
from typing import AsyncIterator

import httpx

from app.ai.llm.base import ChatMessage, LLMClient
from app.config import settings
from app.core.exceptions import UpstreamError


class OpenAIClient(LLMClient):
    provider_name = "openai"
    BASE_URL = "https://api.openai.com/v1"

    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
    ) -> None:
        key = api_key or settings.openai_api_key
        if not key:
            raise ValueError("OPENAI_API_KEY is required for OpenAIClient")
        self.api_key = key
        self.model_name = model or settings.openai_model

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    def _payload(
        self,
        messages: list[ChatMessage],
        temperature: float,
        max_tokens: int | None,
        *,
        stream: bool,
    ) -> dict:
        body: dict = {
            "model": self.model_name,
            "messages": [m.model_dump() for m in messages],
            "temperature": temperature,
            "stream": stream,
        }
        if max_tokens is not None:
            body["max_tokens"] = max_tokens
        return body

    async def chat(
        self,
        messages: list[ChatMessage],
        *,
        temperature: float = 0.2,
        max_tokens: int | None = None,
    ) -> str:
        async with httpx.AsyncClient(timeout=120.0) as client:
            try:
                r = await client.post(
                    f"{self.BASE_URL}/chat/completions",
                    headers=self._headers(),
                    json=self._payload(messages, temperature, max_tokens, stream=False),
                )
                r.raise_for_status()
            except httpx.HTTPError as e:
                raise UpstreamError(f"OpenAI chat failed: {e}") from e
            data = r.json()
        try:
            return data["choices"][0]["message"]["content"] or ""
        except (KeyError, IndexError):
            return ""

    async def stream(
        self,
        messages: list[ChatMessage],
        *,
        temperature: float = 0.2,
        max_tokens: int | None = None,
    ) -> AsyncIterator[str]:
        async with httpx.AsyncClient(timeout=120.0) as client:
            try:
                async with client.stream(
                    "POST",
                    f"{self.BASE_URL}/chat/completions",
                    headers=self._headers(),
                    json=self._payload(messages, temperature, max_tokens, stream=True),
                ) as r:
                    r.raise_for_status()
                    async for line in r.aiter_lines():
                        if not line or not line.startswith("data: "):
                            continue
                        data_str = line[6:].strip()
                        if data_str == "[DONE]":
                            break
                        try:
                            chunk = json.loads(data_str)
                        except json.JSONDecodeError:
                            continue
                        try:
                            delta = chunk["choices"][0]["delta"].get("content")
                        except (KeyError, IndexError):
                            delta = None
                        if delta:
                            yield delta
            except httpx.HTTPError as e:
                raise UpstreamError(f"OpenAI stream failed: {e}") from e
