from __future__ import annotations

from functools import lru_cache

from app.ai.embeddings.base import Embedder
from app.ai.embeddings.fastembed_embedder import FastEmbedEmbedder


@lru_cache(maxsize=1)
def get_embedder() -> Embedder:
    return FastEmbedEmbedder()
