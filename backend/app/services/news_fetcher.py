"""News fetcher abstraction.

Default provider: Yahoo Finance RSS (no API key, stable for years).
Override: NewsAPI when NEWSAPI_KEY is set.

Both return a list of NewsArticle — the News Agent doesn't care which source.
"""
from __future__ import annotations

import asyncio
import time
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from functools import lru_cache

import feedparser
import httpx
from pydantic import BaseModel

from app.config import settings
from app.core.exceptions import UpstreamError


class NewsArticle(BaseModel):
    title: str
    url: str
    source: str
    published_at: datetime | None = None
    summary: str | None = None


class NewsFetcher(ABC):
    name: str

    @abstractmethod
    async def fetch(
        self,
        symbol: str,
        *,
        company_name: str | None = None,
        limit: int = 10,
    ) -> list[NewsArticle]: ...


# ---------- Yahoo RSS (default) ----------


class YahooRSSFetcher(NewsFetcher):
    name = "yahoo_rss"
    BASE_URL = "https://feeds.finance.yahoo.com/rss/2.0/headline"

    async def fetch(
        self,
        symbol: str,
        *,
        company_name: str | None = None,
        limit: int = 10,
    ) -> list[NewsArticle]:
        params = {"s": symbol.upper(), "region": "US", "lang": "en-US"}
        async with httpx.AsyncClient(timeout=15.0) as client:
            try:
                r = await client.get(self.BASE_URL, params=params)
                r.raise_for_status()
            except httpx.HTTPError as e:
                raise UpstreamError(f"Yahoo RSS fetch failed: {e}") from e
            text = r.text

        # feedparser is sync but pure-python and fast — park on threadpool.
        feed = await asyncio.to_thread(feedparser.parse, text)

        articles: list[NewsArticle] = []
        for entry in feed.entries[:limit]:
            articles.append(
                NewsArticle(
                    title=entry.get("title", "").strip(),
                    url=entry.get("link", ""),
                    source="Yahoo Finance",
                    published_at=_entry_to_dt(entry),
                    summary=(entry.get("summary") or "").strip() or None,
                )
            )
        return [a for a in articles if a.title and a.url]


def _entry_to_dt(entry) -> datetime | None:
    parsed = getattr(entry, "published_parsed", None) or getattr(
        entry, "updated_parsed", None
    )
    if not parsed:
        return None
    try:
        return datetime.fromtimestamp(time.mktime(parsed), tz=timezone.utc)
    except (TypeError, ValueError, OverflowError):
        return None


# ---------- NewsAPI (when configured) ----------


class NewsAPIFetcher(NewsFetcher):
    name = "newsapi"
    BASE_URL = "https://newsapi.org/v2/everything"

    def __init__(self, api_key: str | None = None) -> None:
        self.api_key = api_key or settings.newsapi_key
        if not self.api_key:
            raise ValueError("NEWSAPI_KEY required for NewsAPIFetcher")

    async def fetch(
        self,
        symbol: str,
        *,
        company_name: str | None = None,
        limit: int = 10,
    ) -> list[NewsArticle]:
        query = company_name or symbol
        async with httpx.AsyncClient(timeout=15.0) as client:
            try:
                r = await client.get(
                    self.BASE_URL,
                    params={
                        "q": query,
                        "language": "en",
                        "sortBy": "publishedAt",
                        "pageSize": limit,
                        "apiKey": self.api_key,
                    },
                )
                r.raise_for_status()
            except httpx.HTTPError as e:
                raise UpstreamError(f"NewsAPI fetch failed: {e}") from e
            data = r.json()

        articles: list[NewsArticle] = []
        for art in data.get("articles", [])[:limit]:
            published_at: datetime | None = None
            if art.get("publishedAt"):
                try:
                    published_at = datetime.fromisoformat(
                        art["publishedAt"].replace("Z", "+00:00")
                    )
                except ValueError:
                    pass
            articles.append(
                NewsArticle(
                    title=(art.get("title") or "").strip(),
                    url=art.get("url") or "",
                    source=(art.get("source") or {}).get("name") or "NewsAPI",
                    published_at=published_at,
                    summary=(art.get("description") or "").strip() or None,
                )
            )
        return [a for a in articles if a.title and a.url]


# ---------- Factory ----------


@lru_cache(maxsize=1)
def get_news_fetcher() -> NewsFetcher:
    if settings.newsapi_key:
        return NewsAPIFetcher()
    return YahooRSSFetcher()
