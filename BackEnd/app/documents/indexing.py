
"""
Secure bridge between Supabase and ChromaDB.

Only documents with status="redacted" can be indexed.
The document must also be accessible to the authenticated user.

NEVER extract original file bytes here.
Never send raw document text to the embedding model.
"""
from uuid import UUID
from fastapi import HTTPException
from app.files.storage import get_client
from app.files.downloads import get_document, access_reason
from app.ai.redacted_vector import index_redacted_document


def validate_document_id(document_id: str) -> str:
    """Validate and normalize the document's UUID."""

    try:
        return str(UUID(str(document_id)))
    except (ValueError, TypeError, AttributeError):
        raise HTTPException(
            status_code=400,
            detail="Invalid document ID.",
        ) from None


def index_document_from_supabase(
    document_id: str,
    user,
) -> dict:
    """
    Index an authorized document from Supabase.

    1. Validate the document ID.
    2. Load the document's metadata.
    3. Verify that the user has access.
    4. Require status='redacted'.
    5. Read only the stored redacted text.
    6. Send that text to ChromaDB.
    """

    document_id = validate_document_id(document_id)

    # Step 1: Load document metadata.
    try:
        document = get_document(document_id)
    except Exception as error:
        raise HTTPException(
            status_code=503,
            detail="Unable to load document.",
        ) from error

    if not document:
        raise HTTPException(
            status_code=404,
            detail="Document not found.",
        )

    # Step 2: Apply the team's existing authorization rules.
    try:
        allowed = access_reason(user, document)
    except Exception as error:
        raise HTTPException(
            status_code=503,
            detail="Unable to verify document access.",
        ) from error

    # Deliberately return the same error as a missing document.
    if allowed is None:
        raise HTTPException(
            status_code=404,
            detail="Document not found.",
        )

    # Step 3: Never index documents that have not passed redaction.
    if document.get("status") != "redacted":
        raise HTTPException(
            status_code=409,
            detail="Document is not ready for indexing.",
        )

    # Step 4: Retrieve only the approved redacted text.
    try:
        result = (
            get_client()
            .table("documents")
            .select("id, original_name, status, redacted_text")
            .eq("id", document_id)
            .limit(1)
            .execute()
        )
    except Exception as error:
        raise HTTPException(
            status_code=503,
            detail="Unable to retrieve redacted document.",
        ) from error

    if not result.data:
        raise HTTPException(
            status_code=404,
            detail="Document not found.",
        )

    record = result.data[0]

    # Recheck the authoritative status returned with the text.
    if record.get("status") != "redacted":
        raise HTTPException(
            status_code=409,
            detail="Document is not ready for indexing.",
        )

    redacted_text = record.get("redacted_text")

    if not isinstance(redacted_text, str) or not redacted_text.strip():
        raise HTTPException(
            status_code=422,
            detail="Document has no redacted text to index.",
        )

    # Step 5: Index only the redacted text.
    # This function writes to the separate redacted ChromaDB collection.
    try:
        chunk_count = index_redacted_document(
            document_id=document_id,
            filename="Document",
            redacted_text=redacted_text,
        )
    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail="Document indexing failed.",
        ) from error

    # Do not return document text or embeddings to the browser.
    return {
        "document_id": document_id,
        "status": "indexed",
        "chunks_indexed": chunk_count,
    }
