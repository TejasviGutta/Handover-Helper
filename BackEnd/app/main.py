
"""
Handover Helper - Main FastAPI application.

Features:
- Authentication
- User and handover routes
- File validation and upload
- PII redaction
- Supabase document storage
- Secure ChromaDB indexing
- Audit logging
- Authorized file downloads
"""

import logging
import uuid

from fastapi import (
    Depends,
    FastAPI,
    File,
    HTTPException,
    Request,
    UploadFile,
)

from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .routers import handover_workflow, users

from app.files.security import (
    MAX_FILE_SIZE,
    FileRejected,
    clean_label,
    validate_file,
)

from app.files.extract import (
    ExtractionFailed,
    extract_text,
)

from app.files.redact import redact_text

from app.files.storage import save_file

from app.files.downloads import (
    LINK_LIFETIME_SECONDS,
    access_reason,
    create_download_link,
    get_document,
)

from app.audit import log_event
from app.auth import get_current_user

# Our new PII-redacted ChromaDB indexing implementation.
from app.ai.redacted_vector import index_redacted_document


logger = logging.getLogger(__name__)

app = FastAPI(title="Handover Helper API")


# ---------------------------------------------------------
# CORS
# ---------------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------
# TEAM ROUTES
# ---------------------------------------------------------

app.include_router(users.router)
app.include_router(handover_workflow.router)
app.include_router(handover_workflow.directory_router)


# ---------------------------------------------------------
# HELPERS
# ---------------------------------------------------------

def client_ip(request: Request):
    """Return the client's IP address for audit logging."""

    return request.client.host if request.client else None


# ---------------------------------------------------------
# HEALTH CHECK
# ---------------------------------------------------------

@app.get("/health")
def health():
    return {"status": "ok"}


# ---------------------------------------------------------
# FILE VALIDATION
# ---------------------------------------------------------

# Development-only endpoint.
# Remove or protect before production deployment.
@app.post("/files/check")
async def check_file(file: UploadFile = File(...)):

    content = await file.read(MAX_FILE_SIZE + 1)

    try:
        details = validate_file(file.filename, content)

    except FileRejected as error:
        raise HTTPException(
            status_code=400,
            detail=str(error),
        ) from error

    return {
        "status": "accepted",
        **details,
    }


# ---------------------------------------------------------
# REDACTED DOCUMENT PREVIEW
# ---------------------------------------------------------

# Development-only endpoint.
# Remove or protect before production deployment.
@app.post("/files/preview")
async def preview_file(file: UploadFile = File(...)):

    content = await file.read(MAX_FILE_SIZE + 1)

    try:
        details = validate_file(file.filename, content)

        text = extract_text(
            content,
            details["extension"],
        )

    except (FileRejected, ExtractionFailed) as error:
        raise HTTPException(
            status_code=400,
            detail=str(error),
        ) from error

    try:
        redacted, summary = redact_text(text)

    except Exception as error:
        logger.exception("Document preview redaction failed")

        raise HTTPException(
            status_code=500,
            detail="Document preview failed.",
        ) from error

    return {
        "characters": len(redacted),
        "hidden": summary,
        "preview": redacted[:3000],
    }


# ---------------------------------------------------------
# FILE UPLOAD + PII REDACTION + CHROMADB INDEXING
# ---------------------------------------------------------

@app.post("/files/upload", status_code=201)
async def upload_file(
    request: Request,
    file: UploadFile = File(...),
    user=Depends(get_current_user),
):
    """
    Secure upload workflow:

    1. Authenticate user.
    2. Validate uploaded file.
    3. Extract text.
    4. Redact detected personal information.
    5. Store original file privately in Supabase.
    6. Store redacted text in documents.redacted_text.
    7. Index ONLY redacted text in ChromaDB.
    8. Return indexing status without document contents.
    """

    ip = client_ip(request)
    label = clean_label(file.filename)

    # -----------------------------------------------------
    # 1. READ FILE WITH SIZE LIMIT
    # -----------------------------------------------------

    content = await file.read(MAX_FILE_SIZE + 1)

    # -----------------------------------------------------
    # 2. VALIDATE FILE
    # -----------------------------------------------------

    try:
        details = validate_file(
            file.filename,
            content,
        )

    except FileRejected as error:

        log_event(
            "file.upload_rejected",
            user=user,
            target_type="file",
            target_label=label,
            details={
                "reason": str(error),
                "size": len(content),
            },
            ip=ip,
        )

        raise HTTPException(
            status_code=400,
            detail=str(error),
        ) from error

    # -----------------------------------------------------
    # 3. EXTRACT TEXT
    # -----------------------------------------------------

    try:
        text = extract_text(
            content,
            details["extension"],
        )

    except ExtractionFailed as error:

        log_event(
            "file.upload_rejected",
            user=user,
            target_type="file",
            target_label=label,
            details={
                "reason": str(error),
                "size": len(content),
            },
            ip=ip,
        )

        raise HTTPException(
            status_code=400,
            detail=str(error),
        ) from error

    # -----------------------------------------------------
    # 4. REDACT PERSONAL INFORMATION
    # -----------------------------------------------------

    try:
        redacted, summary = redact_text(text)

    except Exception as error:

        logger.exception("PII redaction failed")

        log_event(
            "file.upload_failed",
            user=user,
            target_type="file",
            target_label=label,
            details={
                "stage": "redaction",
            },
            ip=ip,
        )

        raise HTTPException(
            status_code=500,
            detail="This file couldn't be processed. Please try again.",
        ) from error

    # Original extracted text must never enter ChromaDB.
    del text

    # -----------------------------------------------------
    # 5. SAVE DOCUMENT TO SUPABASE
    # -----------------------------------------------------

    try:
        record = save_file(
            content,
            details,
            uploaded_by=user.id,
            status="redacted",
            redacted_text=redacted,
            redaction_summary=summary,
        )

    except Exception as error:

        logger.exception("Saving document failed")

        log_event(
            "file.upload_failed",
            user=user,
            target_type="file",
            target_label=label,
            details={
                "stage": "save",
            },
            ip=ip,
        )

        raise HTTPException(
            status_code=500,
            detail="Upload failed. Please try again.",
        ) from error

    # -----------------------------------------------------
    # 6. AUDIT SUCCESSFUL UPLOAD
    # -----------------------------------------------------

    log_event(
        "file.upload",
        user=user,
        target_type="document",
        target_id=record["id"],
        target_label=record["original_name"],
        details={
            "file_type": details["extension"],
            "size": details["size"],
            "pii_hidden": summary,
        },
        ip=ip,
    )

    # -----------------------------------------------------
    # 7. INDEX ONLY REDACTED TEXT IN CHROMADB
    # -----------------------------------------------------

    indexing_status = "failed"
    chunks_indexed = 0

    try:
        # The text passed here has already been through
        # the Presidio redaction step.
        #
        # DO NOT replace this with original extracted text.
        chunks_indexed = index_redacted_document(
            document_id=str(record["id"]),
            filename="Document",
            redacted_text=redacted,
        )

        indexing_status = "indexed"

        log_event(
            "file.indexed",
            user=user,
            target_type="document",
            target_id=record["id"],
            target_label=record["original_name"],
            details={
                "chunks_indexed": chunks_indexed,
                "content_type": "redacted",
            },
            ip=ip,
        )

    except Exception:

        logger.exception(
            "ChromaDB indexing failed for document %s",
            record["id"],
        )

        log_event(
            "file.index_failed",
            user=user,
            target_type="document",
            target_id=record["id"],
            target_label=record["original_name"],
            details={
                "stage": "indexing",
            },
            ip=ip,
        )

    # -----------------------------------------------------
    # 8. RETURN SAFE RESPONSE
    # -----------------------------------------------------

    # No original or redacted text should be returned.
    record.pop("redacted_text", None)

    return {
        "status": "uploaded",
        "indexing_status": indexing_status,
        "chunks_indexed": chunks_indexed,
        "hidden": summary,
        "document": record,
    }


# ---------------------------------------------------------
# SECURE FILE DOWNLOADS
# ---------------------------------------------------------

@app.get("/files/{document_id}/download-link")
def download_link(
    document_id: uuid.UUID,
    request: Request,
    user=Depends(get_current_user),
):
    """
    Generate a temporary link for an authorized user.

    Unlike the AI pipeline, this endpoint allows authorized
    users to download the original stored file.
    """

    ip = client_ip(request)

    # -----------------------------------------------------
    # 1. LOOK UP DOCUMENT
    # -----------------------------------------------------

    try:
        document = get_document(document_id)

        reason = (
            access_reason(user, document)
            if document
            else None
        )

    except Exception as error:

        logger.exception("Document lookup failed")

        raise HTTPException(
            status_code=500,
            detail="Something went wrong. Please try again.",
        ) from error

    # -----------------------------------------------------
    # 2. CHECK AUTHORIZATION
    # -----------------------------------------------------

    if reason is None:

        log_event(
            "file.download_denied",
            user=user,
            target_type="document",
            target_id=document_id,
            target_label=(
                document["original_name"]
                if document
                else None
            ),
            details={
                "reason": (
                    "not_allowed"
                    if document
                    else "not_found"
                ),
            },
            ip=ip,
        )

        raise HTTPException(
            status_code=404,
            detail="File not found",
        )

    # -----------------------------------------------------
    # 3. GENERATE SHORT-LIVED LINK
    # -----------------------------------------------------

    try:
        url = create_download_link(document)

    except Exception as error:

        logger.exception("Download link creation failed")

        raise HTTPException(
            status_code=500,
            detail="Something went wrong. Please try again.",
        ) from error

    # -----------------------------------------------------
    # 4. AUDIT LINK CREATION
    # -----------------------------------------------------

    log_event(
        "file.download_link_created",
        user=user,
        target_type="document",
        target_id=document["id"],
        target_label=document["original_name"],
        details={
            "access": reason,
            "expires_in_seconds": LINK_LIFETIME_SECONDS,
        },
        ip=ip,
    )

    return {
        "url": url,
        "file_name": document["original_name"],
        "expires_in_seconds": LINK_LIFETIME_SECONDS,
    }
