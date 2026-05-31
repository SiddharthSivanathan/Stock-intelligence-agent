"""Document text extraction.

Three sources of text we can ingest in Phase 4:
  - PDF bytes   -> list[(page_num, text)]
  - HTML string -> single page of cleaned text
  - URL         -> fetch and dispatch based on Content-Type

OCR for scanned PDFs is out of scope. Sec.gov EDGAR requires a User-Agent
with contact info per their policy — set SEC_USER_AGENT in .env to override.
"""
from __future__ import annotations

from io import BytesIO

import httpx
from bs4 import BeautifulSoup
from pypdf import PdfReader

DEFAULT_USER_AGENT = "stock-intelligence-system/0.5 (research)"


def extract_pdf_pages(content: bytes) -> list[tuple[int, str]]:
    """Returns [(1-indexed page number, text), ...]."""
    reader = PdfReader(BytesIO(content))
    pages: list[tuple[int, str]] = []
    for i, page in enumerate(reader.pages, start=1):
        try:
            text = page.extract_text() or ""
        except Exception:
            text = ""
        pages.append((i, text))
    return pages


def html_to_text(html: str) -> str:
    """Strip tags + boilerplate, collapse blank lines."""
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript", "nav", "header", "footer"]):
        tag.decompose()
    text = soup.get_text(separator="\n")
    lines = [ln.strip() for ln in text.splitlines()]
    return "\n".join(ln for ln in lines if ln)


async def fetch_url(
    url: str,
    *,
    timeout: float = 30.0,
    user_agent: str = DEFAULT_USER_AGENT,
) -> tuple[bytes, str]:
    """Returns (content_bytes, content_type)."""
    async with httpx.AsyncClient(
        timeout=timeout,
        follow_redirects=True,
        headers={"User-Agent": user_agent},
    ) as client:
        r = await client.get(url)
        r.raise_for_status()
        return r.content, r.headers.get("content-type", "")
