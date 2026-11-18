
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from app.documents.indexing import index_document_from_supabase


DOCUMENT_ID = "123e4567-e89b-12d3-a456-426614174000"

USER = SimpleNamespace(
    id="456e4567-e89b-12d3-a456-426614174000",
    email="employee@example.com",
)

DOCUMENT = {
    "id": DOCUMENT_ID,
    "original_name": "handover.txt",
    "uploaded_by": USER.id,
    "handover_id": None,
    "status": "redacted",
}

REDACTED_RECORD = {
    "id": DOCUMENT_ID,
    "original_name": "handover.txt",
    "status": "redacted",
    "redacted_text": (
        "Project manager: [PERSON_1]. "
        "Email: [EMAIL_ADDRESS_1]."
    ),
}


def test_unauthorized_document_is_rejected():
    with (
        patch("app.documents.indexing.get_document",
              return_value=DOCUMENT),
        patch("app.documents.indexing.access_reason",
              return_value=None),
        patch("app.documents.indexing.index_redacted_document") as index,
    ):
        with pytest.raises(HTTPException) as error:
            index_document_from_supabase(DOCUMENT_ID, USER)

        assert error.value.status_code == 404
        index.assert_not_called()


def test_unredacted_document_is_rejected():
    document = {
        **DOCUMENT,
        "status": "uploaded",
    }

    with (
        patch("app.documents.indexing.get_document",
              return_value=document),
        patch("app.documents.indexing.access_reason",
              return_value="uploader"),
        patch("app.documents.indexing.index_redacted_document") as index,
    ):
        with pytest.raises(HTTPException) as error:
            index_document_from_supabase(DOCUMENT_ID, USER)

        assert error.value.status_code == 409
        index.assert_not_called()


def test_authorized_redacted_document_is_indexed():
    database = MagicMock()
    database.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
        REDACTED_RECORD
    ]

    with (
        patch("app.documents.indexing.get_document",
              return_value=DOCUMENT),
        patch("app.documents.indexing.access_reason",
              return_value="uploader"),
        patch("app.documents.indexing.get_client",
              return_value=database),
        patch("app.documents.indexing.index_redacted_document",
              return_value=2) as index,
    ):
        result = index_document_from_supabase(DOCUMENT_ID, USER)

        assert result["status"] == "indexed"
        assert result["chunks_indexed"] == 2

        index.assert_called_once_with(
            document_id=DOCUMENT_ID,
            filename="Document",
            redacted_text=REDACTED_RECORD["redacted_text"],
        )


def test_missing_redacted_text_is_rejected():
    database = MagicMock()
    record = {
        **REDACTED_RECORD,
        "redacted_text": "",
    }

    database.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
        record
    ]

    with (
        patch("app.documents.indexing.get_document",
              return_value=DOCUMENT),
        patch("app.documents.indexing.access_reason",
              return_value="uploader"),
        patch("app.documents.indexing.get_client",
              return_value=database),
        patch("app.documents.indexing.index_redacted_document") as index,
    ):
        with pytest.raises(HTTPException) as error:
            index_document_from_supabase(DOCUMENT_ID, USER)

        assert error.value.status_code == 422
        index.assert_not_called()
