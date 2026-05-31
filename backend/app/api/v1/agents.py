"""Agent run endpoints + agent_log read endpoint.

Each signal agent has its own POST /agents/{name}/run for ad-hoc use.
POST /agents/analyze runs the full LangGraph workflow (all 5 agents in
parallel + Recommendation Agent + reflection).

  POST /agents/news/run
  POST /agents/technical/run
  POST /agents/fundamentals/run
  POST /agents/sentiment/run
  POST /agents/risk/run
  POST /agents/analyze       <- LangGraph multi-agent workflow
  GET  /agents/logs
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query, status

from app.ai.agents.fundamentals_agent import (
    FundamentalsAgent,
    FundamentalsAgentInput,
)
from app.ai.agents.news_agent import NewsAgent, NewsAgentInput
from app.ai.agents.risk_agent import RiskAgent, RiskAgentInput
from app.ai.agents.sentiment_agent import SentimentAgent, SentimentAgentInput
from app.ai.agents.technical_agent import (
    TechnicalAgent,
    TechnicalAgentInput,
)
from app.api.deps import CurrentUser, DbDep
from app.schemas.agent import (
    AgentLogOut,
    FundamentalsAgentRunRequest,
    FundamentalsInsight,
    NewsAgentRunRequest,
    NewsInsight,
    RiskAgentRunRequest,
    RiskInsight,
    SentimentAgentRunRequest,
    SentimentInsight,
    TechnicalAgentRunRequest,
    TechnicalInsight,
)
from app.schemas.recommendation import AnalysisResult, AnalyzeRequest
from app.services import agent_log_service
from app.services.analysis_service import run_and_persist_analysis

log = logging.getLogger(__name__)
router = APIRouter()


# ---------- Single-agent runs ----------


@router.post(
    "/news/run",
    response_model=NewsInsight,
    summary="News Agent — fetches headlines, scores them",
)
async def run_news_agent(
    req: NewsAgentRunRequest, current_user: CurrentUser, db: DbDep
) -> NewsInsight:
    agent = NewsAgent()
    return await agent.run(
        NewsAgentInput(symbol=req.symbol, limit=req.limit),
        db=db,
        user_id=current_user.id,
    )


@router.post(
    "/technical/run",
    response_model=TechnicalInsight,
    summary="Technical Agent — pandas computes indicators, LLM interprets",
)
async def run_technical_agent(
    req: TechnicalAgentRunRequest, current_user: CurrentUser, db: DbDep
) -> TechnicalInsight:
    agent = TechnicalAgent()
    return await agent.run(
        TechnicalAgentInput(
            symbol=req.symbol,
            range_=req.range_,
            interval=req.interval,
        ),
        db=db,
        user_id=current_user.id,
    )


@router.post(
    "/fundamentals/run",
    response_model=FundamentalsInsight,
    summary="Fundamentals Agent — ratios + RAG over filings",
)
async def run_fundamentals_agent(
    req: FundamentalsAgentRunRequest, current_user: CurrentUser, db: DbDep
) -> FundamentalsInsight:
    agent = FundamentalsAgent()
    return await agent.run(
        FundamentalsAgentInput(symbol=req.symbol, use_rag=req.use_rag),
        db=db,
        user_id=current_user.id,
    )


@router.post(
    "/sentiment/run",
    response_model=SentimentInsight,
    summary="Sentiment Agent — Reddit crowd-mood",
)
async def run_sentiment_agent(
    req: SentimentAgentRunRequest, current_user: CurrentUser, db: DbDep
) -> SentimentInsight:
    agent = SentimentAgent()
    return await agent.run(
        SentimentAgentInput(symbol=req.symbol, limit=req.limit),
        db=db,
        user_id=current_user.id,
    )


@router.post(
    "/risk/run",
    response_model=RiskInsight,
    summary="Risk Agent — volatility, drawdown, leverage",
)
async def run_risk_agent(
    req: RiskAgentRunRequest, current_user: CurrentUser, db: DbDep
) -> RiskInsight:
    agent = RiskAgent()
    return await agent.run(
        RiskAgentInput(symbol=req.symbol, range_=req.range_),
        db=db,
        user_id=current_user.id,
    )


# ---------- Multi-agent orchestration ----------


@router.post(
    "/analyze",
    response_model=AnalysisResult,
    summary=(
        "Run the full LangGraph workflow: 5 signal agents in parallel + "
        "Recommendation synthesis + reflection loop."
    ),
)
async def analyze_symbol(
    req: AnalyzeRequest, current_user: CurrentUser, db: DbDep
) -> AnalysisResult:
    try:
        rec = await run_and_persist_analysis(
            user_id=current_user.id, symbol=req.symbol, db=db
        )
    except RuntimeError as e:
        # All agents failed or Recommendation node failed.
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"message": "Workflow produced no recommendation", "error": str(e)},
        )
    except Exception as e:
        log.exception("Workflow failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Workflow failed: {e}",
        )
    return AnalysisResult.from_recommendation(rec)


# ---------- Logs ----------


@router.get(
    "/logs",
    response_model=list[AgentLogOut],
    summary="Recent agent runs (success + failure) for the current user",
)
async def list_logs(
    current_user: CurrentUser,
    db: DbDep,
    agent: str | None = Query(default=None, description="Filter by agent name"),
    symbol: str | None = Query(default=None, description="Filter by symbol"),
    limit: int = Query(default=50, ge=1, le=200),
) -> list[AgentLogOut]:
    rows = await agent_log_service.list_for_user(
        db, current_user, agent=agent, symbol=symbol, limit=limit
    )
    return [AgentLogOut.model_validate(r) for r in rows]
