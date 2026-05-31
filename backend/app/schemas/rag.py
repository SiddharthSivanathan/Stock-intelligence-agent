from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator


# ---------- Document DTOs ----------


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    filename: str | None
    source_type: str
    source_url: str | None
    symbol: str | None
    chunk_count: int
    status: str
    error: str | None
    created_at: datetime
    updated_at: datetime


# ---------- Ingestion requests ----------


class IngestTextRequest(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    text: str = Field(min_length=10, max_length=2_000_000)
    symbol: str | None = Field(default=None, max_length=20)

    @field_validator("symbol")
    @classmethod
    def upper_symbol(cls, v: str | None) -> str | None:
        return v.strip().upper() if v else None


class IngestUrlRequest(BaseModel):
    url: HttpUrl
    title: str | None = Field(default=None, max_length=500)
    symbol: str | None = Field(default=None, max_length=20)

    @field_validator("symbol")
    @classmethod
    def upper_symbol(cls, v: str | None) -> str | None:
        return v.strip().upper() if v else None


# ---------- Query / answer ----------


class RAGQueryRequest(BaseModel):
    question: str = Field(min_length=3, max_length=2000)
    k: int = Field(default=5, ge=1, le=20)
    symbol: str | None = Field(default=None, max_length=20)

    @field_validator("symbol")
    @classmethod
    def upper_symbol(cls, v: str | None) -> str | None:
        return v.strip().upper() if v else None


class Citation(BaseModel):
    chunk_id: str
    document_id: int
    document_title: str
    page: int | None = None
    score: float
    snippet: str


class RAGAnswer(BaseModel):
    question: str
    answer: str
    citations: list[Citation]
    provider: str
    model: str
