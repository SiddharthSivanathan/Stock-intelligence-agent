"""Base agent — the contract every agent in this project follows.

Lifecycle:
  1. gather_evidence(input, user_id) -> dict of raw signals
  2. build_messages(input, evidence) -> list[ChatMessage]
  3. LLM call (temperature=0.2 by default)
  4. parse_or_repair against the agent's output_schema
  5. build_insight_row(output, user_id, evidence) -> Insight (with passthrough fields)
  6. persist Insight row + AgentLog row (always)
  7. return the validated output

Subclasses implement 1 and 2, declare `name`, `output_schema`, prompt filename,
and optionally `passthrough_evidence_keys` (evidence keys to merge into the
persisted JSONB without round-tripping through the LLM).
"""
from __future__ import annotations

import logging
import time
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, Generic, TypeVar

from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.agents.output_parser import parse_or_repair
from app.ai.llm.base import ChatMessage, LLMClient
from app.ai.llm.factory import get_llm
from app.db.models.agent_log import AgentLog
from app.db.models.insight import Insight

log = logging.getLogger(__name__)

PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"


def load_prompt(filename: str) -> str:
    path = PROMPTS_DIR / filename
    if not path.exists():
        raise FileNotFoundError(f"Prompt file not found: {path}")
    return path.read_text(encoding="utf-8")


def _to_jsonable(v: Any) -> Any:
    """Recursively coerce Pydantic models / lists / dicts to JSON-safe values."""
    if isinstance(v, BaseModel):
        return v.model_dump(mode="json")
    if isinstance(v, list):
        return [_to_jsonable(x) for x in v]
    if isinstance(v, dict):
        return {k: _to_jsonable(val) for k, val in v.items()}
    return v


InputT = TypeVar("InputT", bound=BaseModel)
OutputT = TypeVar("OutputT", bound=BaseModel)


class BaseAgent(ABC, Generic[InputT, OutputT]):
    # Subclass contract
    name: str
    output_schema: type[OutputT]
    prompt_filename: str

    # LLM call defaults — subclasses may override
    temperature: float = 0.2
    max_tokens: int = 2048

    # Evidence keys to merge into the persisted `data` JSONB without asking
    # the LLM to echo them. Use this for raw numbers (indicators, metrics)
    # that the LLM has already seen in the prompt.
    passthrough_evidence_keys: tuple[str, ...] = ()

    def __init__(self, llm: LLMClient | None = None) -> None:
        self.llm = llm or get_llm()

    # ---- Abstract hooks ----

    @abstractmethod
    async def gather_evidence(
        self, input_data: InputT, *, user_id: int | None = None
    ) -> dict:
        """Pull whatever signals the agent reasons over."""

    @abstractmethod
    def build_messages(
        self, input_data: InputT, evidence: dict
    ) -> list[ChatMessage]:
        """Compose the prompt from template + evidence."""

    # ---- Persistence hook (overridable) ----

    def build_insight_row(
        self,
        output: OutputT,
        *,
        user_id: int | None,
        evidence: dict | None = None,
    ) -> Insight:
        """Default: copy denormalized fields + merge passthrough evidence keys."""
        data = output.model_dump(mode="json")
        if evidence:
            for key in self.passthrough_evidence_keys:
                if key in evidence:
                    data[key] = _to_jsonable(evidence[key])
        return Insight(
            user_id=user_id,
            agent_name=self.name,
            symbol=str(data.get("symbol", "")).upper(),
            sentiment=data.get("sentiment"),
            confidence=data.get("confidence"),
            score=data.get("score"),
            summary=data.get("summary"),
            data=data,
        )

    # ---- The driver ----

    async def run(
        self,
        input_data: InputT,
        *,
        db: AsyncSession,
        user_id: int | None = None,
    ) -> OutputT:
        started = time.perf_counter()
        symbol_attr = getattr(input_data, "symbol", None)

        log_row = AgentLog(
            agent_name=self.name,
            user_id=user_id,
            symbol=str(symbol_attr).upper() if symbol_attr else None,
            status="failed",
            duration_ms=0,
            input_data=input_data.model_dump(mode="json"),
            provider=self.llm.provider_name,
            model=self.llm.model_name,
        )

        try:
            evidence = await self.gather_evidence(input_data, user_id=user_id)
            messages = self.build_messages(input_data, evidence)
            raw = await self.llm.chat(
                messages,
                temperature=self.temperature,
                max_tokens=self.max_tokens,
            )

            validated = await parse_or_repair(
                self.llm, messages, self.output_schema, raw
            )

            insight = self.build_insight_row(
                validated, user_id=user_id, evidence=evidence
            )
            db.add(insight)

            log_row.status = "success"
            log_row.output_data = validated.model_dump(mode="json")
            log_row.duration_ms = int((time.perf_counter() - started) * 1000)
            db.add(log_row)

            await db.commit()
            return validated
        except Exception as e:
            log_row.error = str(e)[:1500]
            log_row.duration_ms = int((time.perf_counter() - started) * 1000)
            try:
                db.add(log_row)
                await db.commit()
            except Exception:
                await db.rollback()
                log.exception("Failed to persist agent_log on error")
            log.exception("Agent %s failed", self.name)
            raise
