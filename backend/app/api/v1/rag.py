"""RAG endpoints (all require auth).

  POST   /rag/ingest/text     ingest a plain-text doc synchronously kicked off
  POST   /rag/ingest/file     upload PDF/HTML/text
  POST   /rag/ingest/url      fetch a URL (SEC filings, news pages, etc.)
  POST   /rag/query           ask a question, get an answer with citations
  GET    /rag/documents       list this user's docs
  DELETE /rag/documents/{id}  remove doc + its chunks from Chroma

Ingestion happens in a BackgroundTask so the user gets an immediate response
with status='processing'. They poll GET /rag/documents to see when ready.
"""
from __future__ import annotations

import logging

from fastapi import (
    APIRouter,
    BackgroundTasks,
    File,
    Form,
    HTTPException,
    Response,
    UploadFile,
    status,
)


from app.ai.rag.extractors import extract_pdf_pages, fetch_url, html_to_text
from app.ai.rag.service import get_rag_service
from app.api.deps import CurrentUser, DbDep
from app.core.exceptions import NotFoundError
from app.db.models.document import Document
from app.db.session import AsyncSessionLocal
from app.schemas.rag import (
    DocumentOut,
    IngestTextRequest,
    IngestUrlRequest,
    RAGAnswer,
    RAGQueryRequest,
)
from app.services import document_service

log = logging.getLogger(__name__)
router = APIRouter()

MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB

PageList = list[tuple[int | None, str]]


# ---------- Background processing ----------


async def _process_document_in_background(
    doc_id: int, pages: PageList
) -> None:
    """Runs after the response. Owns its own DB session."""
    rag = get_rag_service()
    async with AsyncSessionLocal() as db:
        doc = await db.get(Document, doc_id)
        if doc is None:
            log.error("Background task: document %s vanished", doc_id)
            return
        await rag.ingest_pages(db, doc, pages)


# ---------- Ingest endpoints ----------


@router.post(
    "/ingest/text",
    response_model=DocumentOut,
    status_code=status.HTTP_201_CREATED,
    summary="Ingest a raw text body",
)
async def ingest_text(
    req: IngestTextRequest,
    background_tasks: BackgroundTasks,
    current_user: CurrentUser,
    db: DbDep,
) -> DocumentOut:
    doc = await document_service.create(
        db, current_user,
        title=req.title,
        source_type="text",
        symbol=req.symbol,
    )
    background_tasks.add_task(
        _process_document_in_background, doc.id, [(None, req.text)]
    )
    return DocumentOut.model_validate(doc)


@router.post(
    "/ingest/file",
    response_model=DocumentOut,
    status_code=status.HTTP_201_CREATED,
    summary="Upload a PDF, HTML, or text file",
)
async def ingest_file(
    background_tasks: BackgroundTasks,
    current_user: CurrentUser,
    db: DbDep,
    file: UploadFile = File(...),
    title: str | None = Form(default=None),
    symbol: str | None = Form(default=None),
) -> DocumentOut:
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large (max {MAX_UPLOAD_BYTES // 1024 // 1024} MB)",
        )

    filename = file.filename or "upload"
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""

    pages: PageList
    if ext == "pdf":
        source_type = "pdf"
        pages = list(extract_pdf_pages(content))
    elif ext in ("html", "htm"):
        source_type = "html"
        pages = [(None, html_to_text(content.decode("utf-8", errors="ignore")))]
    else:
        source_type = "text"
        pages = [(None, content.decode("utf-8", errors="ignore"))]

    doc = await document_service.create(
        db, current_user,
        title=title or filename,
        source_type=source_type,
        filename=filename,
        symbol=symbol,
    )
    background_tasks.add_task(_process_document_in_background, doc.id, pages)
    return DocumentOut.model_validate(doc)


@router.post(
    "/ingest/url",
    response_model=DocumentOut,
    status_code=status.HTTP_201_CREATED,
    summary="Fetch a URL (SEC filings, news pages) and ingest",
)
async def ingest_url(
    req: IngestUrlRequest,
    background_tasks: BackgroundTasks,
    current_user: CurrentUser,
    db: DbDep,
) -> DocumentOut:
    try:
        content, content_type = await fetch_url(str(req.url))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to fetch URL: {e}",
        )

    url_lower = str(req.url).lower()
    is_pdf = "pdf" in content_type or url_lower.endswith(".pdf")
    is_html = (
        "html" in content_type
        or url_lower.endswith((".html", ".htm"))
        or "<html" in content[:512].decode("utf-8", errors="ignore").lower()
    )

    pages: PageList
    if is_pdf:
        source_type = "pdf"
        pages = list(extract_pdf_pages(content))
    elif is_html:
        source_type = "sec" if "sec.gov" in url_lower else "html"
        pages = [(None, html_to_text(content.decode("utf-8", errors="ignore")))]
    else:
        source_type = "text"
        pages = [(None, content.decode("utf-8", errors="ignore"))]

    doc = await document_service.create(
        db, current_user,
        title=req.title or str(req.url),
        source_type=source_type,
        source_url=str(req.url),
        symbol=req.symbol,
    )
    background_tasks.add_task(_process_document_in_background, doc.id, pages)
    return DocumentOut.model_validate(doc)


# ---------- Query ----------


@router.post(
    "/query",
    response_model=RAGAnswer,
    summary="Ask a question over your indexed documents",
)
async def query(
    req: RAGQueryRequest, current_user: CurrentUser
) -> RAGAnswer:
    rag = get_rag_service()
    return await rag.query(
        user_id=current_user.id,
        question=req.question,
        k=req.k,
        symbol=req.symbol,
    )


# ---------- Document CRUD ----------


@router.get("/documents", response_model=list[DocumentOut])
async def list_documents(
    current_user: CurrentUser, db: DbDep
) -> list[DocumentOut]:
    docs = await document_service.list_for_user(db, current_user)
    return [DocumentOut.model_validate(d) for d in docs]


@router.get("/documents/{doc_id}", response_model=DocumentOut)
async def get_document(
    doc_id: int, current_user: CurrentUser, db: DbDep
) -> DocumentOut:
    doc = await document_service.get_for_user(db, current_user, doc_id)
    if doc is None:
        raise NotFoundError(f"Document {doc_id} not found")
    return DocumentOut.model_validate(doc)


@router.delete(
    "/documents/{doc_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,  # suppress FastAPI's body inference for 204
)
async def delete_document(
    doc_id: int, current_user: CurrentUser, db: DbDep
) -> None:
    doc = await document_service.get_for_user(db, current_user, doc_id)
    if doc is None:
        raise NotFoundError(f"Document {doc_id} not found")

    rag = get_rag_service()
    try:
        await rag.delete_document_chunks(doc.id)
    except Exception as e:
        # Vector-store cleanup failure shouldn't block the row delete —
        # log and move on. A periodic janitor can sweep orphan chunks later.
        log.warning("Vector chunk cleanup failed for doc %s: %s", doc.id, e)

    await document_service.delete(db, doc)
