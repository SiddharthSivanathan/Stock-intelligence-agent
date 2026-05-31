"""LLM client factory.

Reads LLM_PROVIDER from settings. Cached so we only construct the chosen
client once per process.
"""
from __future__ import annotations

from functools import lru_cache

from app.ai.llm.base import LLMClient
from app.ai.llm.gemini_client import GeminiClient
from app.ai.llm.ollama_client import OllamaClient
from app.ai.llm.openai_client import OpenAIClient
from app.config import settings


def _build(provider: str) -> LLMClient:
    if provider == "ollama":
        return OllamaClient()
    if provider == "openai":
        return OpenAIClient()
    if provider == "gemini":
        return GeminiClient()
    raise ValueError(f"Unknown LLM provider: {provider}")


@lru_cache(maxsize=1)
def get_llm() -> LLMClient:
    """Return the configured default LLM client."""
    return _build(settings.llm_provider)


def get_llm_for(provider: str) -> LLMClient:
    """Force-instantiate a specific provider — useful for multi-provider agents."""
    return _build(provider)
