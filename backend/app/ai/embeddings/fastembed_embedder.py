"""fastembed-based embedder.

Why fastembed instead of sentence-transformers?
  - ONNX runtime: ~5x smaller container (no torch).
  - Faster CPU inference for the same BAAI/bge-small-en-v1.5 weights.
  - Same accuracy — fastembed ships official ONNX exports of the HF models.

First call downloads the model (~130 MB for bge-small) into FASTEMBED_CACHE_PATH.
That path is mounted as a Docker volume so rebuilds don't redownload.
"""
from __future__ import annotations

import asyncio
from functools import lru_cache

from fastembed import TextEmbedding

from app.ai.embeddings.base import Embedder
from app.config import settings

# Hardcoded dimensions for the models we care about. Saves a model load just
# to read .dim. Add to this map as you support more.
_DIMENSIONS: dict[str, int] = {
    "BAAI/bge-small-en-v1.5": 384,
    "BAAI/bge-base-en-v1.5": 768,
    "sentence-transformers/all-MiniLM-L6-v2": 384,
}


@lru_cache(maxsize=4)
def _load_model(model_name: str) -> TextEmbedding:
    """fastembed handles its own download + caching."""
    return TextEmbedding(model_name=model_name)


class FastEmbedEmbedder(Embedder):
    def __init__(self, model_name: str | None = None) -> None:
        self.model_name = model_name or settings.embedding_model
        self.dimension = _DIMENSIONS.get(self.model_name, 384)

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        model = _load_model(self.model_name)
        # fastembed is sync — park it on the threadpool so we don't block the loop.
        embeds = await asyncio.to_thread(lambda: list(model.embed(texts)))
        return [e.tolist() for e in embeds]

    async def embed_query(self, text: str) -> list[float]:
        out = await self.embed_documents([text])
        return out[0]
