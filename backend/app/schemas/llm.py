from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class ChatMessageIn(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str = Field(min_length=1)


class ChatRequest(BaseModel):
    messages: list[ChatMessageIn] = Field(min_length=1)
    temperature: float = Field(default=0.2, ge=0.0, le=2.0)
    max_tokens: int | None = Field(default=None, ge=1, le=8192)


class ChatResponse(BaseModel):
    provider: str
    model: str
    content: str


class EmbedRequest(BaseModel):
    texts: list[str] = Field(min_length=1, max_length=128)


class EmbedResponse(BaseModel):
    model: str
    dimension: int
    embeddings: list[list[float]]
