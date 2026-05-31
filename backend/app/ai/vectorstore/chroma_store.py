"""ChromaDB implementation of VectorStore.

Uses chromadb-client (HTTP client only — server runs in the compose stack).
The client is sync, so each call is wrapped in asyncio.to_thread to keep the
event loop responsive.
"""
from __future__ import annotations

import asyncio
from functools import lru_cache
from typing import Any

import chromadb

from app.ai.vectorstore.base import RetrievedDoc, VectorStore
from app.config import settings


@lru_cache(maxsize=1)
def _client() -> chromadb.HttpClient:
    return chromadb.HttpClient(
        host=settings.chroma_host,
        port=settings.chroma_port,
    )


def _distance_to_score(distance: float) -> float:
    """Chroma returns cosine distance (0 = identical). Flip to similarity."""
    return 1.0 - distance


class ChromaStore(VectorStore):
    async def ensure_collection(self, name: str) -> None:
        await asyncio.to_thread(_client().get_or_create_collection, name=name)

    async def add_documents(
        self,
        collection: str,
        *,
        ids: list[str],
        texts: list[str],
        embeddings: list[list[float]],
        metadatas: list[dict[str, Any]] | None = None,
    ) -> None:
        if not ids:
            return
        coll = await asyncio.to_thread(
            _client().get_or_create_collection, name=collection
        )
        await asyncio.to_thread(
            coll.upsert,
            ids=ids,
            documents=texts,
            embeddings=embeddings,
            metadatas=metadatas,
        )

    async def similarity_search(
        self,
        collection: str,
        *,
        query_embedding: list[float],
        k: int = 5,
        where: dict[str, Any] | None = None,
    ) -> list[RetrievedDoc]:
        coll = await asyncio.to_thread(
            _client().get_or_create_collection, name=collection
        )
        res = await asyncio.to_thread(
            coll.query,
            query_embeddings=[query_embedding],
            n_results=k,
            where=where,
        )

        # Chroma returns list-of-lists (one per query); we always pass one query.
        ids = (res.get("ids") or [[]])[0]
        docs = (res.get("documents") or [[]])[0]
        metas = (res.get("metadatas") or [[None] * len(ids)])[0]
        dists = (res.get("distances") or [[0.0] * len(ids)])[0]

        return [
            RetrievedDoc(
                id=ids[i],
                text=docs[i],
                metadata=metas[i] or {},
                score=_distance_to_score(dists[i]),
            )
            for i in range(len(ids))
        ]

    async def delete_where(
        self, collection: str, *, where: dict[str, Any]
    ) -> None:
        coll = await asyncio.to_thread(
            _client().get_or_create_collection, name=collection
        )
        await asyncio.to_thread(coll.delete, where=where)

    async def delete_collection(self, name: str) -> None:
        await asyncio.to_thread(_client().delete_collection, name=name)

    async def list_collections(self) -> list[str]:
        colls = await asyncio.to_thread(_client().list_collections)
        return [c.name for c in colls]
