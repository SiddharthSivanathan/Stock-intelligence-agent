"""Sentiment Agent — crowd mood from social posts (Reddit).

Distinct from the News Agent: news measures price-moving events; sentiment
measures how retail investors are FEELING. Both signals feed Phase 7's
Recommendation Agent.

If Reddit returns nothing (rate-limited, no matches), the agent still runs
and produces a neutral/low-confidence output rather than failing.
"""
from __future__ import annotations

import asyncio
import logging

from pydantic import BaseModel, Field, field_validator

from app.ai.agents.base_agent import BaseAgent, load_prompt
from app.ai.llm.base import ChatMessage
from app.schemas.agent import SentimentInsight
from app.services import market_data
from app.services.social_fetcher import SocialPost, get_social_fetcher

log = logging.getLogger(__name__)


class SentimentAgentInput(BaseModel):
    symbol: str = Field(min_length=1, max_length=20)
    limit: int = Field(default=25, ge=5, le=50)

    @field_validator("symbol")
    @classmethod
    def upper(cls, v: str) -> str:
        return v.strip().upper()


class SentimentAgent(BaseAgent[SentimentAgentInput, SentimentInsight]):
    name = "sentiment"
    output_schema = SentimentInsight
    prompt_filename = "sentiment.md"
    temperature = 0.25
    max_tokens = 1500
    passthrough_evidence_keys = ("sample_posts", "discussion_count")

    def __init__(self, llm=None, fetcher=None) -> None:
        super().__init__(llm)
        self.fetcher = fetcher or get_social_fetcher()

    async def gather_evidence(
        self, input_data: SentimentAgentInput, *, user_id: int | None = None
    ) -> dict:
        # Profile lookup gives us company name for better Reddit search.
        company_name: str | None = None
        try:
            profile = await market_data.get_profile(input_data.symbol)
            company_name = profile.name
        except Exception as e:
            log.debug("No profile for %s: %s", input_data.symbol, e)

        try:
            posts = await self.fetcher.fetch_mentions(
                input_data.symbol,
                company_name=company_name,
                limit=input_data.limit,
            )
        except Exception as e:
            log.warning("Social fetch failed for %s: %s", input_data.symbol, e)
            posts = []

        return {
            "symbol": input_data.symbol,
            "company_name": company_name,
            "sample_posts": posts,
            "discussion_count": len(posts),
        }

    def build_messages(
        self, input_data: SentimentAgentInput, evidence: dict
    ) -> list[ChatMessage]:
        system_prompt = load_prompt(self.prompt_filename)
        posts: list[SocialPost] = evidence.get("sample_posts", []) or []
        company = evidence.get("company_name") or "Unknown"

        if not posts:
            posts_block = "(no social posts available — Reddit may be rate-limited or no recent matches)"
        else:
            lines: list[str] = []
            for i, p in enumerate(posts, start=1):
                date_str = (
                    p.created_at.strftime("%Y-%m-%d")
                    if p.created_at
                    else "unknown"
                )
                lines.append(
                    f"{i}. [r/{p.subreddit}, {date_str}, score={p.score}, "
                    f"comments={p.num_comments}]"
                )
                lines.append(f"   {p.title}")
                if p.body:
                    snippet = p.body[:240].replace("\n", " ")
                    lines.append(f"   Body: {snippet}")
            posts_block = "\n".join(lines)

        user_msg = (
            f"Symbol: {input_data.symbol}\n"
            f"Company: {company}\n"
            f"Posts retrieved: {len(posts)}\n\n"
            f"Recent social posts:\n{posts_block}\n\n"
            "Produce the JSON crowd-mood assessment now."
        )

        return [
            ChatMessage(role="system", content=system_prompt),
            ChatMessage(role="user", content=user_msg),
        ]
