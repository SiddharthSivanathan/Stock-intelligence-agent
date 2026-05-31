"""Embedder abstraction.

embed_documents : batch text -> list[vector]
embed_query     : single text -> vector

We use the same model for both. (Asymmetric models like bge-large-zh use
different prefixes for queries vs. documents; the current default
BAAI/bge-small-en-v1.5 is symmetric, so no special-casing needed.)
"""
from __future__ import annotations

from abc import ABC, abstractmethod


class Embedder(ABC):
    model_name: str
    dimension: int

    @abstractmethod
    async def embed_documents(self, texts: list[str]) -> list[list[float]]: ...

    @abstractmethod
    async def embed_query(self, text: str) -> list[float]: ...
