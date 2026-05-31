"""Demo endpoints proving the AI subsystem works end-to-end.

  POST /llm/chat   : one-shot completion
  POST /llm/stream : SSE stream of token deltas
  POST /llm/embed  : embedding vectors for a list of texts

These are open (no auth) for Phase 3 ease. Real agent endpoints in later
phases will require auth.
"""
from __future__ import annotations

import json
from typing import AsyncIterator

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.ai.embeddings.factory import get_embedder
from app.ai.llm.base import ChatMessage
from app.ai.llm.factory import get_llm
from app.schemas.llm import (
    ChatRequest,
    ChatResponse,
    EmbedRequest,
    EmbedResponse,
)

router = APIRouter()


@router.post("/chat", response_model=ChatResponse, summary="One-shot LLM completion")
async def chat(req: ChatRequest) -> ChatResponse:
    llm = get_llm()
    messages = [ChatMessage(role=m.role, content=m.content) for m in req.messages]
    reply = await llm.chat(
        messages,
        temperature=req.temperature,
        max_tokens=req.max_tokens,
    )
    return ChatResponse(
        provider=llm.provider_name,
        model=llm.model_name,
        content=reply,
    )


@router.post("/stream", summary="SSE-streamed LLM completion (text/event-stream)")
async def chat_stream(req: ChatRequest) -> StreamingResponse:
    llm = get_llm()
    messages = [ChatMessage(role=m.role, content=m.content) for m in req.messages]

    async def _sse() -> AsyncIterator[bytes]:
        async for delta in llm.stream(
            messages, temperature=req.temperature, max_tokens=req.max_tokens
        ):
            payload = json.dumps({"delta": delta}, ensure_ascii=False)
            yield f"data: {payload}\n\n".encode("utf-8")
        yield b"data: [DONE]\n\n"

    return StreamingResponse(_sse(), media_type="text/event-stream")


@router.post("/embed", response_model=EmbedResponse, summary="Embed texts to vectors")
async def embed(req: EmbedRequest) -> EmbedResponse:
    embedder = get_embedder()
    vectors = await embedder.embed_documents(req.texts)
    return EmbedResponse(
        model=embedder.model_name,
        dimension=embedder.dimension,
        embeddings=vectors,
    )
