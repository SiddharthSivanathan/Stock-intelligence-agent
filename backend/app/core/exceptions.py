"""Application-level exception types.

Mapped to HTTP responses by an exception handler registered in main.py
from Phase 1 onward. Defined here so service code can `raise` them without
importing FastAPI's HTTPException everywhere.
"""
from __future__ import annotations


class AppError(Exception):
    """Base class for application errors."""

    status_code: int = 500
    code: str = "internal_error"

    def __init__(self, message: str = "An unexpected error occurred") -> None:
        super().__init__(message)
        self.message = message


class NotFoundError(AppError):
    status_code = 404
    code = "not_found"


class UnauthorizedError(AppError):
    status_code = 401
    code = "unauthorized"


class ForbiddenError(AppError):
    status_code = 403
    code = "forbidden"


class ValidationError(AppError):
    status_code = 422
    code = "validation_error"


class UpstreamError(AppError):
    """An external API (LLM, market data, news) failed."""

    status_code = 502
    code = "upstream_error"
