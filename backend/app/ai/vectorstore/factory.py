from __future__ import annotations

from functools import lru_cache

from app.ai.vectorstore.base import VectorStore
from app.ai.vectorstore.chroma_store import ChromaStore


@lru_cache(maxsize=1)
def get_vector_store() -> VectorStore:
    return ChromaStore()
