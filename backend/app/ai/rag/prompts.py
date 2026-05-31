"""RAG prompt templates.

Kept as plain strings (not Jinja) — the simplest format that survives
prompt-engineering iteration. Phase 5+ will move provider-specific prompts
to versioned .md files under app/ai/prompts/.
"""
from __future__ import annotations

from app.ai.vectorstore.base import RetrievedDoc

RAG_SYSTEM_PROMPT = (
    "You are a financial analyst assistant. "
    "Answer the user's question using ONLY the provided context passages.\n\n"
    "If the context does not contain enough information, reply: "
    '"I don\'t have enough information in the provided documents to answer that confidently."\n\n'
    "When citing facts, reference passages by number like [1], [2], etc. "
    "Be concise and precise. Do not invent numbers or quotes."
)

RAG_USER_PROMPT_TEMPLATE = (
    "Context passages:\n\n"
    "{context}\n\n"
    "---\n\n"
    "Question: {question}\n\n"
    "Answer (cite passages with [1], [2], ...):"
)


def build_context(retrieved: list[RetrievedDoc]) -> str:
    lines: list[str] = []
    for i, doc in enumerate(retrieved, start=1):
        meta = doc.metadata or {}
        title = meta.get("title", "Untitled")
        page = meta.get("page")
        page_str = f", Page: {page}" if page else ""
        lines.append(f"[{i}] (Document: {title}{page_str})\n{doc.text}")
    return "\n\n".join(lines)
