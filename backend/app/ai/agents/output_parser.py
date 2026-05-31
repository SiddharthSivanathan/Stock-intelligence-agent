"""LLM-output -> Pydantic, with one repair attempt on validation failure.

LLMs sometimes wrap JSON in prose ("Sure! Here is..."), fences (```json),
or trail with explanation. We extract the most-likely JSON region first,
then validate. If validation still fails, we send one repair turn quoting
the error and asking for "JSON only, start with '{'".
"""
from __future__ import annotations

import json
import logging
import re
from typing import TypeVar

from pydantic import BaseModel, ValidationError

from app.ai.llm.base import ChatMessage, LLMClient

log = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

_FENCE_RE = re.compile(r"```(?:json|JSON)?\s*([\s\S]*?)\s*```")


def extract_json_text(raw: str) -> str:
    """Best-effort: pull a JSON object/array out of arbitrary LLM text."""
    raw = (raw or "").strip()
    if not raw:
        return raw

    # 1. ```json ... ``` fenced
    m = _FENCE_RE.search(raw)
    if m:
        return m.group(1).strip()

    # 2. Already starts with { or [
    if raw[0] in ("{", "["):
        return raw

    # 3. Find the outermost {...} or [...]
    for open_c, close_c in (("{", "}"), ("[", "]")):
        start = raw.find(open_c)
        end = raw.rfind(close_c)
        if start != -1 and end > start:
            return raw[start : end + 1]

    return raw  # let json.loads complain


async def parse_or_repair(
    llm: LLMClient,
    original_messages: list[ChatMessage],
    schema: type[T],
    raw_response: str,
) -> T:
    """Validate; on failure, re-prompt once with the error attached."""
    try:
        text = extract_json_text(raw_response)
        data = json.loads(text)
        return schema.model_validate(data)
    except (json.JSONDecodeError, ValidationError) as first_error:
        log.warning(
            "First-pass parse failed for %s: %s. Sending repair turn.",
            schema.__name__,
            first_error,
        )
        repair_messages = original_messages + [
            ChatMessage(role="assistant", content=raw_response),
            ChatMessage(
                role="user",
                content=(
                    "Your last response failed validation:\n\n"
                    f"{first_error}\n\n"
                    "Return ONLY a valid JSON object matching the required "
                    "schema. No prose, no markdown, no code fences. "
                    "Begin your response with '{'."
                ),
            ),
        ]
        repaired = await llm.chat(
            repair_messages, temperature=0.0, max_tokens=2048
        )
        text = extract_json_text(repaired)
        data = json.loads(text)
        return schema.model_validate(data)
