
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.ai.rag import ask_document_question
from app.documents.access import check_document_access


router = APIRouter(prefix="/learn", tags=["Learn"])


class AskDocumentRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    document_id: str = Field(min_length=1)
    top_k: int = Field(default=3, ge=1, le=10)


# These dependencies will use the existing teammate code
# once the upload API branch is integrated.
def get_authenticated_user():
    raise HTTPException(
        status_code=503,
        detail="Authentication integration is not configured."
    )


def get_database_client():
    raise HTTPException(
        status_code=503,
        detail="Database integration is not configured."
    )


def authorize_document(
    request: AskDocumentRequest,
    user=Depends(get_authenticated_user),
    db=Depends(get_database_client)
):
    return check_document_access(
        document_id=request.document_id,
        user_id=str(user.id),
        db=db
    )


@router.post("/ask")
def ask_document(
    request: AskDocumentRequest,
    document=Depends(authorize_document)
):
    try:
        return ask_document_question(
            question=request.question,
            document_id=str(document["id"]),
            top_k=request.top_k
        )

    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error)
        ) from error

    except Exception as error:
        raise HTTPException(
            status_code=503,
            detail="The AI assistant is currently unavailable."
        ) from error
