"""Fundamentals Agent.

Pipeline:
  1. Fetch company profile + fundamental ratios (yfinance, cached 24h)
  2. Optionally: RAG retrieval over user's uploaded filings for qualitative grounding
  3. LLM reads the metrics + filing passages and produces a valuation/health read
"""
from __future__ import annotations

import asyncio
import logging

from pydantic import BaseModel, Field, field_validator

from app.ai.agents.base_agent import BaseAgent, load_prompt
from app.ai.embeddings.factory import get_embedder
from app.ai.llm.base import ChatMessage
from app.ai.vectorstore.factory import get_vector_store
from app.schemas.agent import FundamentalsInsight
from app.services import market_data

log = logging.getLogger(__name__)

RAG_COLLECTION = "documents"
RAG_K = 4


class FundamentalsAgentInput(BaseModel):
    symbol: str = Field(min_length=1, max_length=20)
    use_rag: bool = True

    @field_validator("symbol")
    @classmethod
    def upper(cls, v: str) -> str:
        return v.strip().upper()


class FundamentalsAgent(BaseAgent[FundamentalsAgentInput, FundamentalsInsight]):
    name = "fundamentals"
    output_schema = FundamentalsInsight
    prompt_filename = "fundamentals.md"
    temperature = 0.15
    max_tokens = 1500
    passthrough_evidence_keys = ("metrics", "profile", "rag_sources")

    async def gather_evidence(
        self,
        input_data: FundamentalsAgentInput,
        *,
        user_id: int | None = None,
    ) -> dict:
        # Fetch profile + metrics + (optional) RAG in parallel.
        profile_task = market_data.get_profile(input_data.symbol)
        metrics_task = market_data.get_fundamentals(input_data.symbol)

        rag_task = None
        if input_data.use_rag and user_id is not None:
            rag_task = self._retrieve_filings(
                input_data.symbol, user_id=user_id
            )

        if rag_task is not None:
            profile, metrics, rag_chunks = await asyncio.gather(
                profile_task,
                metrics_task,
                rag_task,
                return_exceptions=False,
            )
        else:
            profile, metrics = await asyncio.gather(
                profile_task, metrics_task
            )
            rag_chunks = []

        return {
            "symbol": input_data.symbol,
            "profile": {
                "name": profile.name,
                "sector": profile.sector,
                "industry": profile.industry,
                "country": profile.country,
                "currency": profile.currency,
                "market_cap": profile.market_cap,
            },
            "metrics": metrics,
            "rag_sources": rag_chunks,
        }

    async def _retrieve_filings(
        self, symbol: str, *, user_id: int
    ) -> list[dict]:
        try:
            embedder = get_embedder()
            vs = get_vector_store()
            query = (
                f"financial health, profitability, growth, leverage, and "
                f"valuation of {symbol}"
            )
            vec = await embedder.embed_query(query)
            where: dict = {
                "$and": [{"user_id": user_id}, {"symbol": symbol.upper()}]
            }
            docs = await vs.similarity_search(
                RAG_COLLECTION,
                query_embedding=vec,
                k=RAG_K,
                where=where,
            )
            return [
                {
                    "chunk_id": d.id,
                    "document_id": int((d.metadata or {}).get("document_id", 0)),
                    "title": (d.metadata or {}).get("title", "Untitled"),
                    "page": (d.metadata or {}).get("page"),
                    "score": round(d.score, 4),
                    "text": d.text,
                }
                for d in docs
            ]
        except Exception as e:
            log.warning("Fundamentals RAG retrieval failed: %s", e)
            return []

    def build_messages(
        self, input_data: FundamentalsAgentInput, evidence: dict
    ) -> list[ChatMessage]:
        system_prompt = load_prompt(self.prompt_filename)
        prof = evidence["profile"]
        metrics = evidence["metrics"]

        lines: list[str] = []
        lines.append(f"Symbol: {input_data.symbol}")
        lines.append(f"Company: {prof.get('name') or input_data.symbol}")
        lines.append(
            f"Sector / Industry: {prof.get('sector') or 'n/a'} / {prof.get('industry') or 'n/a'}"
        )
        if prof.get("market_cap"):
            lines.append(f"Market cap: ${prof['market_cap']:,}")
        lines.append("")
        lines.append("Fundamental ratios:")
        for k, v in metrics.items():
            if v is None:
                continue
            lines.append(f"  {k}: {v}")

        rag = evidence.get("rag_sources") or []
        if rag:
            lines.append("")
            lines.append("Relevant passages from filings:")
            for i, src in enumerate(rag, start=1):
                page = f", Page {src['page']}" if src.get("page") else ""
                lines.append(
                    f"[{i}] {src['title']}{page} (score {src['score']})"
                )
                snippet = (src["text"] or "")[:600].strip()
                lines.append(f"    {snippet}")

        lines.append("")
        lines.append("Produce the JSON assessment now.")

        return [
            ChatMessage(role="system", content=system_prompt),
            ChatMessage(role="user", content="\n".join(lines)),
        ]
