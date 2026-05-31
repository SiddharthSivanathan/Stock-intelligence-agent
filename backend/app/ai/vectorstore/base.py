"""Vector store abstraction.

A collection is a namespace of (id, text, vector, metadata) rows. Operations:
  - ensure_collection : create if missing
  - add_documents     : upsert (idempotent on id)
  - similarity_search : k-NN with optional metadata filter
  - delete_collection : drop everything
  - list_collections  : introspection
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any


@dataclass
class RetrievedDoc:
    id: str
    text: str
    metadata: dict[str, Any]
    score: float  # similarity, higher = more similar (1.0 = identical)


class VectorStore(ABC):
    @abstractmethod
    async def ensure_collection(self, name: str) -> None: ...

    @abstractmethod
    async def add_documents(
        self,
        collection: str,
        *,
        ids: list[str],
        texts: list[str],
        embeddings: list[list[float]],
        metadatas: list[dict[str, Any]] | None = None,
    ) -> None: ...

    @abstractmethod
    async def similarity_search(
        self,
        collection: str,
        *,
        query_embedding: list[float],
        k: int = 5,
        where: dict[str, Any] | None = None,
    ) -> list[RetrievedDoc]: ...

    @abstractmethod
    async def delete_where(
        self, collection: str, *, where: dict[str, Any]
    ) -> None: ...

    @abstractmethod
    async def delete_collection(self, name: str) -> None: ...

    @abstractmethod
    async def list_collections(self) -> list[str]: ...
