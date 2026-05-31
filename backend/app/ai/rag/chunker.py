"""Text chunker.

Why these defaults?
  chunk_size=1000 chars (~250 tokens for English) — small enough to fit many
  chunks in an LLM context window, big enough to carry one or two paragraphs
  of meaning. chunk_overlap=200 prevents losing facts that straddle a boundary.

We chunk PER PAGE so each chunk inherits a real page number. That's what makes
the citations clickable in the UI later.
"""
from __future__ import annotations

from dataclasses import dataclass

from langchain_text_splitters import RecursiveCharacterTextSplitter


@dataclass
class Chunk:
    text: str
    page: int | None = None


class TextChunker:
    def __init__(self, chunk_size: int = 1000, chunk_overlap: int = 200) -> None:
        self._splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            # Order matters: prefer paragraph boundaries, then lines, then
            # sentence-like, then words, then chars as a last resort.
            separators=["\n\n", "\n", ". ", " ", ""],
            length_function=len,
        )

    def chunk_pages(
        self, pages: list[tuple[int | None, str]]
    ) -> list[Chunk]:
        out: list[Chunk] = []
        for page_num, text in pages:
            text = (text or "").strip()
            if not text:
                continue
            for piece in self._splitter.split_text(text):
                piece = piece.strip()
                if piece:
                    out.append(Chunk(text=piece, page=page_num))
        return out
