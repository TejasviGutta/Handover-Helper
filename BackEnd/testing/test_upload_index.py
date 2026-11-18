"""Ensure the upload-to-index path never embeds the original extracted text."""

from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

from fastapi.testclient import TestClient

from app.auth import get_current_user
from app.main import app

USER = SimpleNamespace(id=str(uuid4()), email="owner@example.test", role="employee")
DOC_ID = str(uuid4())
ORIGINAL = "Contact Jane Smith at jane@company.example about the handover."
REDACTED = "Contact [PERSON_1] at [EMAIL_ADDRESS_1] about the handover."


def _save_record():
    return {
        "id": DOC_ID,
        "original_name": "sample.txt",
        "status": "redacted",
        "redacted_text": REDACTED,
    }


def test_upload_indexes_only_redacted_text():
    app.dependency_overrides[get_current_user] = lambda: USER
    try:
        with (
            patch("app.main.validate_file", return_value={
                "original_name": "sample.txt", "storage_name": "safe.txt",
                "size": len(ORIGINAL), "extension": ".txt",
            }),
            patch("app.main.extract_text", return_value=ORIGINAL),
            patch("app.main.redact_text", return_value=(REDACTED, {"PERSON": 1, "EMAIL_ADDRESS": 1})),
            patch("app.main.save_file", side_effect=lambda *a, **k: _save_record()) as save,
            patch("app.main.index_redacted_document", return_value=1) as index,
            patch("app.main.log_event"),
            TestClient(app) as client,
        ):
            result = client.post("/files/upload", files={"file": ("sample.txt", ORIGINAL.encode(), "text/plain")})
        assert result.status_code == 201
        assert result.json()["indexing_status"] == "indexed"
        assert result.json()["chunks_indexed"] == 1
        assert REDACTED not in str(result.json())
        assert ORIGINAL not in str(result.json())
        assert save.call_args.kwargs["redacted_text"] == REDACTED
        assert index.call_args.kwargs == {
            "document_id": DOC_ID, "filename": "Document", "redacted_text": REDACTED
        }
    finally:
        app.dependency_overrides.clear()


def test_upload_survives_index_failure_without_claiming_ready():
    app.dependency_overrides[get_current_user] = lambda: USER
    try:
        with (
            patch("app.main.validate_file", return_value={
                "original_name": "sample.txt", "storage_name": "safe.txt",
                "size": len(ORIGINAL), "extension": ".txt",
            }),
            patch("app.main.extract_text", return_value=ORIGINAL),
            patch("app.main.redact_text", return_value=(REDACTED, {})),
            patch("app.main.save_file", side_effect=lambda *a, **k: _save_record()),
            patch("app.main.index_redacted_document", side_effect=RuntimeError("embedding failed")),
            patch("app.main.log_event"),
            TestClient(app) as client,
        ):
            result = client.post("/files/upload", files={"file": ("sample.txt", ORIGINAL.encode(), "text/plain")})
        assert result.status_code == 201
        assert result.json()["indexing_status"] == "failed"
        assert result.json()["chunks_indexed"] == 0
        assert REDACTED not in str(result.json())
        assert ORIGINAL not in str(result.json())
    finally:
        app.dependency_overrides.clear()
