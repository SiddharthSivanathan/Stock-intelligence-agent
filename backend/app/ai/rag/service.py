"""RAGService — the orchestrator.

Wires together: embedder + vector store + LLM + chunker.

ingest_pages(): chunk -> embed -> upsert to Chroma, with rich metadata so we
can filter by user, document, or symbol later.

query(): embed question -> Chroma search (with user/symbol filter) ->
build prompt -> LLM -> RAGAnswer with citations pointing back at the chunks.
"""
from __future__ import annotations

import logging
from functools import lru_cache

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.embeddings.base import Embedder
from app.ai.embeddings.factory import get_embedder
from app.ai.llm.base import ChatMessage, LLMClient
from app.ai.llm.factory import get_llm
from app.ai.rag.chunker import TextChunker
from app.ai.rag.prompts import (
    RAG_SYSTEM_PROMPT,
    RAG_USER_PROMPT_TEMPLATE,
    build_context,
)
from app.ai.vectorstore.base import VectorStore
from app.ai.vectorstore.factory import get_vector_store
from app.db.models.document import Document
from app.schemas.rag import Citation, RAGAnswer

log = logging.getLogger(__name__)


class RAGService:
    def __init__(
        self,
        embedder: Embedder,
        vector_store: VectorStore,
        llm: LLMClient,
        chunker: TextChunker,
        collection_name: str = "documents",
    ) -> None:
        self.embedder = embedder
        self.vector_store = vector_store
        self.llm = llm
        self.chunker = chunker
        self.collection_name = collection_name

    # ---------- Ingestion ----------

    async def ingest_pages(
        self,
        db: AsyncSession,
        document: Document,
        pages: list[tuple[int | None, str]],
    ) -> Document:
        """Chunk + embed + upsert. Updates document.status / chunk_count / error.
        Always commits — caller doesn't need to."""
        document.status = "processing"
        await db.commit()

        try:
            chunks = self.chunker.chunk_pages(pages)
            if not chunks:
                raise ValueError("No extractable text to ingest")

            texts = [c.text for c in chunks]
            log.info(
                "Embedding %d chunks for document %s (%s)",
                len(chunks), document.id, document.title,
            )
            vectors = await self.embedder.embed_documents(texts)

            ids = [f"doc{document.id}_chunk{i}" for i in range(len(chunks))]
            metadatas: list[dict] = []
            for i, c in enumerate(chunks):
                meta: dict = {
                    "document_id": document.id,
                    "user_id": document.user_id,
                    "title": document.title,
                    "chunk_index": i,
                }
                if c.page is not None:
                    meta["page"] = c.page
                if document.symbol:
                    meta["symbol"] = document.symbol.upper()
                metadatas.append(meta)

            await self.vector_store.ensure_collection(self.collection_name)
            await self.vector_store.add_documents(
                self.collection_name,
                ids=ids,
                texts=texts,
                embeddings=vectors,
                metadatas=metadatas,
            )

            document.status = "ready"
            document.chunk_count = len(chunks)
            document.error = None
            log.info(
                "Ingested document %s with %d chunks", document.id, len(chunks)
            )
        except Exception as e:
            document.status = "failed"
            document.error = str(e)[:1000]
            log.exception("Ingestion failed for document %s", document.id)

        await db.commit()
        await db.refresh(document)
        return document

    # ---------- Retrieval + generation ----------

    async def query(
        self,
        user_id: int,
        question: str,
        *,
        k: int = 5,
        symbol: str | None = None,
    ) -> RAGAnswer:
        # Build Chroma where-filter. Chroma 0.5 needs $and for multi-field filters.
        clauses: list[dict] = [{"user_id": user_id}]
        if symbol:
            clauses.append({"symbol": symbol.upper()})
        where = clauses[0] if len(clauses) == 1 else {"$and": clauses}

        query_vec = await self.embedder.embed_query(question)
        retrieved = await self.vector_store.similarity_search(
            self.collection_name,
            query_embedding=query_vec,
            k=k,
            where=where,
        )

        if not retrieved:
            return RAGAnswer(
                question=question,
                answer=(
                    "I don't have any indexed documents matching that filter. "
                    "Upload a document first via POST /api/v1/rag/ingest/*."
                ),
                citations=[],
                provider=self.llm.provider_name,
                model=self.llm.model_name,
            )

        context = build_context(retrieved)
        messages = [
            ChatMessage(role="system", content=RAG_SYSTEM_PROMPT),
            ChatMessage(
                role="user",
                content=RAG_USER_PROMPT_TEMPLATE.format(
                    context=context, question=question
                ),
            ),
        ]
        answer_text = await self.llm.chat(
            messages, temperature=0.1, max_tokens=1024
        )

        citations: list[Citation] = []
        for d in retrieved:
            meta = d.metadata or {}
            citations.append(
                Citation(
                    chunk_id=d.id,
                    document_id=int(meta.get("document_id", 0)),
                    document_title=str(meta.get("title", "Untitled")),
                    page=int(meta["page"]) if meta.get("page") else None,
                    score=round(d.score, 4),
                    snippet=d.text[:240] + ("..." if len(d.text) > 240 else ""),
                )
            )

        return RAGAnswer(
            question=question,
            answer=answer_text,
            citations=citations,
            provider=self.llm.provider_name,
            model=self.llm.model_name,
        )

    # ---------- Cleanup ----------

    async def delete_document_chunks(self, document_id: int) -> None:
        await self.vector_store.delete_where(
            self.collection_name, where={"document_id": document_id}
        )


@lru_cache(maxsize=1)
def get_rag_service() -> RAGService:
    return RAGService(
        embedder=get_embedder(),
        vector_store=get_vector_store(),
        llm=get_llm(),
        chunker=TextChunker(),
    )
