"""News Agent — first concrete agent.

Pipeline:
  1. Fetch headlines (Yahoo RSS default, NewsAPI when configured)
  2. Try to enrich with company profile so the LLM has the human name
  3. Format headlines into a system prompt + user message
  4. LLM returns structured JSON
  5. Validate -> NewsInsight, persist Insight + AgentLog

Output schema (NewsInsight): symbol, sentiment, confidence, score, summary,
key_themes, notable_headlines.
"""
from __future__ import annotations

import logging

from pydantic import BaseModel, Field, field_validator

from app.ai.agents.base_agent import BaseAgent, load_prompt
from app.ai.llm.base import ChatMessage
from app.schemas.agent import NewsInsight
from app.services import market_data
from app.services.news_fetcher import (
    NewsArticle,
    NewsFetcher,
    get_news_fetcher,
)

log = logging.getLogger(__name__)


class NewsAgentInput(BaseModel):
    symbol: str = Field(min_length=1, max_length=20)
    limit: int = Field(default=10, ge=1, le=30)

    @field_validator("symbol")
    @classmethod
    def upper(cls, v: str) -> str:
        return v.strip().upper()


class NewsAgent(BaseAgent[NewsAgentInput, NewsInsight]):
    name = "news"
    output_schema = NewsInsight
    prompt_filename = "news.md"
    temperature = 0.2
    max_tokens = 1500

    def __init__(
        self,
        llm=None,
        fetcher: NewsFetcher | None = None,
    ) -> None:
        super().__init__(llm)
        self.fetcher = fetcher or get_news_fetcher()

    async def gather_evidence(
        self, input_data: NewsAgentInput, *, user_id: int | None = None
    ) -> dict:
        # Best-effort: enrich the news search with the actual company name.
        company_name: str | None = None
        try:
            profile = await market_data.get_profile(input_data.symbol)
            company_name = profile.name
        except Exception as e:
            log.debug(
                "No profile for %s (continuing): %s", input_data.symbol, e
            )

        try:
            articles = await self.fetcher.fetch(
                input_data.symbol,
                company_name=company_name,
                limit=input_data.limit,
            )
        except Exception as e:
            log.warning("News fetch failed for %s: %s", input_data.symbol, e)
            articles = []

        return {
            "company_name": company_name,
            "articles": articles,
            "fetcher": self.fetcher.name,
        }

    def build_messages(
        self, input_data: NewsAgentInput, evidence: dict
    ) -> list[ChatMessage]:
        system_prompt = load_prompt(self.prompt_filename)
        articles: list[NewsArticle] = evidence.get("articles", [])
        company = evidence.get("company_name") or "Unknown"

        if not articles:
            headlines_block = "(no recent headlines available)"
        else:
            lines: list[str] = []
            for i, a in enumerate(articles, start=1):
                date_str = (
                    a.published_at.strftime("%Y-%m-%d")
                    if a.published_at
                    else "unknown date"
                )
                lines.append(
                    f"{i}. [{date_str}] {a.title} (source: {a.source})\n"
                    f"   URL: {a.url}"
                )
                if a.summary:
                    snippet = a.summary[:240].replace("\n", " ")
                    lines.append(f"   Summary: {snippet}")
            headlines_block = "\n".join(lines)

        user_msg = (
            f"Symbol: {input_data.symbol}\n"
            f"Company: {company}\n"
            f"News source: {evidence.get('fetcher', 'unknown')}\n\n"
            f"Recent headlines:\n{headlines_block}\n\n"
            "Produce the JSON assessment now."
        )

        return [
            ChatMessage(role="system", content=system_prompt),
            ChatMessage(role="user", content=user_msg),
        ]
