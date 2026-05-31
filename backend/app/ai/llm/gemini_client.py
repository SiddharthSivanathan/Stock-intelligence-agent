"""Gemini adapter — talks to generativelanguage.googleapis.com over httpx.

Gemini's contract is different from OpenAI's:
  - Role names: 'user' and 'model' (NOT 'assistant').
  - System messages go in a top-level `systemInstruction` field, not the contents list.
  - Streaming endpoint uses ?alt=sse for SSE; payload differs from OpenAI's.

We hide all that here so callers only see ChatMessage in / str out.
"""
from __future__ import annotations

import json
from typing import AsyncIterator

import httpx

from app.ai.llm.base import ChatMessage, LLMClient
from app.config import settings
from app.core.exceptions import UpstreamError


class GeminiClient(LLMClient):
    provider_name = "gemini"
    BASE_URL = "https://generativelanguage.googleapis.com/v1beta"

    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
    ) -> None:
        key = api_key or settings.gemini_api_key
        if not key:
            raise ValueError("GEMINI_API_KEY is required for GeminiClient")
        self.api_key = key
        self.model_name = model or settings.gemini_model

    @staticmethod
    def _translate(
        messages: list[ChatMessage],
    ) -> tuple[dict | None, list[dict]]:
        system: dict | None = None
        contents: list[dict] = []
        for m in messages:
            if m.role == "system":
                # Last system message wins (Gemini accepts a single one).
                system = {"parts": [{"text": m.content}]}
                continue
            role = "user" if m.role == "user" else "model"
            contents.append({"role": role, "parts": [{"text": m.content}]})
        return system, contents

    def _body(
        self,
        messages: list[ChatMessage],
        temperature: float,
        max_tokens: int | None,
    ) -> dict:
        system, contents = self._translate(messages)
        body: dict = {
            "contents": contents,
            "generationConfig": {"temperature": temperature},
        }
        if max_tokens is not None:
            body["generationConfig"]["maxOutputTokens"] = max_tokens
        if system is not None:
            body["systemInstruction"] = system
        return body

    async def chat(
        self,
        messages: list[ChatMessage],
        *,
        temperature: float = 0.2,
        max_tokens: int | None = None,
    ) -> str:
        url = f"{self.BASE_URL}/models/{self.model_name}:generateContent"
        async with httpx.AsyncClient(timeout=120.0) as client:
            try:
                r = await client.post(
                    url,
                    params={"key": self.api_key},
                    json=self._body(messages, temperature, max_tokens),
                )
                r.raise_for_status()
            except httpx.HTTPError as e:
                raise UpstreamError(f"Gemini chat failed: {e}") from e
            data = r.json()
        try:
            return data["candidates"][0]["content"]["parts"][0].get("text", "")
        except (KeyError, IndexError):
            return ""

    async def stream(
        self,
        messages: list[ChatMessage],
        *,
        temperature: float = 0.2,
        max_tokens: int | None = None,
    ) -> AsyncIterator[str]:
        url = f"{self.BASE_URL}/models/{self.model_name}:streamGenerateContent"
        async with httpx.AsyncClient(timeout=120.0) as client:
            try:
                async with client.stream(
                    "POST",
                    url,
                    params={"key": self.api_key, "alt": "sse"},
                    json=self._body(messages, temperature, max_tokens),
                ) as r:
                    r.raise_for_status()
                    async for line in r.aiter_lines():
                        if not line or not line.startswith("data: "):
                            continue
                        try:
                            chunk = json.loads(line[6:])
                        except json.JSONDecodeError:
                            continue
                        try:
                            text = chunk["candidates"][0]["content"]["parts"][0].get("text", "")
                        except (KeyError, IndexError):
                            text = ""
                        if text:
                            yield text
            except httpx.HTTPError as e:
                raise UpstreamError(f"Gemini stream failed: {e}") from e
