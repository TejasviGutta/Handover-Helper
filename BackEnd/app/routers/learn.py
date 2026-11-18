"""Authenticated Learn API. Never return redacted_text or raw file bytes."""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from app.ai.learn_answer import answer_with_context
from app.ai.redacted_vector import is_document_indexed, search_redacted_document
from app.auth import get_current_user
from app.documents.indexing import index_document_from_supabase
from app.files.downloads import access_reason, get_document
from app.files.storage import get_client

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/learn", tags=["Learn"])


class AskRequest(BaseModel):
    document_id: UUID
    question: str = Field(min_length=1, max_length=2000)
    top_k: int = Field(default=3, ge=1, le=5)


def _authorized_document(document_id: UUID, user) -> dict:
    """Use the existing team access policy; hide unauthorized document IDs."""
    try:
        document = get_document(str(document_id))
        allowed = access_reason(user, document) if document else None
    except Exception as error:
        logger.warning("Learn document authorization lookup failed")
        raise HTTPException(503, "Unable to verify document access.") from error
    if allowed is None:
        raise HTTPException(404, "Document not found.")
    if document.get("status") != "redacted":
        raise HTTPException(409, "Document is not ready for Learn.")
    return document


@router.get("/documents")
def list_learn_documents(user=Depends(get_current_user)):
    """List only this user's redacted uploads (max 200)."""
    try:
        result = (
            get_client()
            .table("documents")
            .select("id, original_name, file_type, uploaded_by, handover_id, status")
            .eq("uploaded_by", str(user.id))
            .eq("status", "redacted")
            .limit(200)
            .execute()
        )
        items = []
        for record in result.data or []:
            if str(record.get("uploaded_by")) != str(user.id):
                continue
            if access_reason(user, record) is None:
                continue
            indexed = is_document_indexed(str(record["id"]))
            items.append({
                "id": str(record["id"]),
                "filename": record["original_name"],
                "type": str(record.get("file_type") or "").lstrip(".").upper() or "DOC",
                "indexing_status": "indexed" if indexed else "not_indexed",
            })
        return {"documents": items}
    except Exception as error:
        logger.warning("Unable to list Learn documents")
        raise HTTPException(503, "Unable to load documents.") from error


@router.post("/documents/{document_id}/index")
async def retry_index(document_id: UUID, user=Depends(get_current_user)):
    """Authorization is rechecked by the shared secure Supabase indexing bridge."""
    return await run_in_threadpool(index_document_from_supabase, str(document_id), user)


@router.post("/ask")
async def ask_document(request: AskRequest, user=Depends(get_current_user)):
    """Authorize first, then retrieve ONLY this document's redacted chunks."""
    document = await run_in_threadpool(_authorized_document, request.document_id, user)
    del document  # Never pass original metadata or file bytes into the LLM.
    try:
        chunks = await run_in_threadpool(
            search_redacted_document,
            request.question,
            str(request.document_id),
            request.top_k,
        )
    except Exception as error:
        logger.warning("Learn retrieval failed")
        raise HTTPException(503, "Document search is temporarily unavailable.") from error
    if not chunks:
        raise HTTPException(409, "Document has not been indexed. Retry indexing first.")

    try:
        answer = await run_in_threadpool(answer_with_context, request.question, chunks)
    except Exception as error:
        logger.warning("Learn model request failed")
        raise HTTPException(503, "AI model unavailable. Check that Ollama is running.") from error

    return {
        "answer": answer,
        "sources": [
            {"filename": "Document", "location": chunk["location"]}
            for chunk in chunks
        ],
    }
