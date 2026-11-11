
from fastapi import HTTPException


def check_document_access(
    document_id: str,
    user_id: str,
    db
) -> dict:

    if not document_id.strip() or not user_id.strip():
        raise HTTPException(
            status_code=400,
            detail="Invalid document or user ID."
        )

    try:
        response = (
            db.table("documents")
            .select("id, uploaded_by, handover_id, status")
            .eq("id", document_id)
            .limit(1)
            .execute()
        )
    except Exception as error:
        raise HTTPException(
            status_code=503,
            detail="Unable to verify document access."
        ) from error

    if not response.data:
        raise HTTPException(
            status_code=404,
            detail="Document not found."
        )

    document = response.data[0]

    # Prototype: only the document uploader has access
    if str(document["uploaded_by"]) != str(user_id):
        raise HTTPException(
            status_code=404,
            detail="Document not found."
        )

    return document
