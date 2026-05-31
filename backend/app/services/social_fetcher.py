"""Reddit fetcher — public JSON endpoint, no OAuth.

Best-effort. Reddit may rate-limit or return 403 unauthenticated; we degrade
gracefully (empty list) so the Sentiment Agent still runs and produces a
low-confidence neutral output.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from functools import lru_cache

import httpx
from pydantic import BaseModel

log = logging.getLogger(__name__)

USER_AGENT = "stock-intelligence-system/0.7 (research; no commercial use)"
US_SUBREDDITS = ("stocks", "investing", "wallstreetbets", "StockMarket")
INDIAN_SUBREDDITS = (
    "IndianStreetBets",
    "IndiaInvestments",
    "StockMarketIndia",
    "DalalStreetTalks",
)


def _subreddits_for(symbol: str) -> tuple[str, ...]:
    """Indian stocks on yfinance carry .NS (NSE) or .BO (BSE) suffix."""
    sym = (symbol or "").upper()
    if sym.endswith(".NS") or sym.endswith(".BO"):
        return INDIAN_SUBREDDITS
    return US_SUBREDDITS


class SocialPost(BaseModel):
    title: str
    body: str | None = None
    url: str
    score: int = 0
    num_comments: int = 0
    subreddit: str
    created_at: datetime | None = None


class RedditFetcher:
    name = "reddit_public_json"
    BASE_URL = "https://www.reddit.com"

    async def fetch_mentions(
        self,
        symbol: str,
        *,
        company_name: str | None = None,
        limit: int = 25,
    ) -> list[SocialPost]:
        # Reddit's search supports basic quoting. We OR symbol + name to catch both.
        if company_name:
            query = f'{symbol} OR "{company_name}"'
        else:
            query = symbol

        # Use Indian subs for .NS/.BO tickers, US subs otherwise. For an
        # Indian symbol like "RELIANCE.NS" the bare ticker "RELIANCE" matches
        # better on Indian subs — strip the suffix from the query.
        subs = _subreddits_for(symbol)
        if symbol.upper().endswith((".NS", ".BO")):
            bare = symbol.split(".")[0]
            query = f'{bare} OR "{company_name}"' if company_name else bare

        per_sub = max(1, limit // len(subs) + 1)
        results: list[SocialPost] = []

        async with httpx.AsyncClient(
            timeout=12.0,
            headers={"User-Agent": USER_AGENT},
            follow_redirects=True,
        ) as client:
            # Fan out across subreddits in parallel — Reddit rate-limits
            # per-endpoint, not per-user for unauthenticated JSON.
            tasks = [
                self._fetch_subreddit(client, sub, query, per_sub)
                for sub in subs
            ]
            sub_results = await asyncio.gather(*tasks, return_exceptions=True)

        for r in sub_results:
            if isinstance(r, list):
                results.extend(r)
            else:
                log.debug("Reddit subreddit fetch failed: %s", r)

        # Dedupe by URL, sort by score
        seen: set[str] = set()
        deduped: list[SocialPost] = []
        for p in sorted(results, key=lambda x: x.score, reverse=True):
            if p.url in seen:
                continue
            seen.add(p.url)
            deduped.append(p)
        return deduped[:limit]

    async def _fetch_subreddit(
        self,
        client: httpx.AsyncClient,
        sub: str,
        query: str,
        limit: int,
    ) -> list[SocialPost]:
        try:
            r = await client.get(
                f"{self.BASE_URL}/r/{sub}/search.json",
                params={
                    "q": query,
                    "restrict_sr": "on",
                    "limit": limit,
                    "sort": "new",
                    "t": "month",
                },
            )
            r.raise_for_status()
            data = r.json()
        except (httpx.HTTPError, ValueError) as e:
            log.debug("Reddit /r/%s search failed: %s", sub, e)
            return []

        out: list[SocialPost] = []
        for child in data.get("data", {}).get("children", []):
            p = child.get("data", {}) or {}
            title = (p.get("title") or "").strip()
            permalink = p.get("permalink") or ""
            if not title or not permalink:
                continue
            created = p.get("created_utc")
            created_at: datetime | None = None
            if created:
                try:
                    created_at = datetime.fromtimestamp(
                        float(created), tz=timezone.utc
                    )
                except (TypeError, ValueError, OverflowError):
                    created_at = None
            out.append(
                SocialPost(
                    title=title[:300],
                    body=((p.get("selftext") or "")[:500]) or None,
                    url=f"{self.BASE_URL}{permalink}",
                    score=int(p.get("score") or 0),
                    num_comments=int(p.get("num_comments") or 0),
                    subreddit=sub,
                    created_at=created_at,
                )
            )
        return out


@lru_cache(maxsize=1)
def get_social_fetcher() -> RedditFetcher:
    return RedditFetcher()
