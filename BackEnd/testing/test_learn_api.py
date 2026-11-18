"""FastAPI route integration tests without contacting Supabase/Ollama/Chroma."""

from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

from fastapi.testclient import TestClient

from app.auth import get_current_user
from app.main import app

USER = SimpleNamespace(id=str(uuid4()), email="owner@example.test", role="employee")
DOCUMENT_ID = str(uuid4())
DOCUMENT = {
    "id": DOCUMENT_ID,
    "uploaded_by": USER.id,
    "original_name": "private-notes.txt",
    "status": "redacted",
    "handover_id": None,
}


def client():
    app.dependency_overrides[get_current_user] = lambda: USER
    return TestClient(app)


def teardown_function(_):
    app.dependency_overrides.clear()


def test_ask_authorized_returns_only_answer_and_sources():
    with (
        client() as c,
        patch("app.routers.learn.get_document", return_value=DOCUMENT),
        patch("app.routers.learn.access_reason", return_value="uploader"),
        patch("app.routers.learn.search_redacted_document", return_value=[{
            "text": "Owner is [PERSON_1]", "location": "Chunk 1", "filename": "Document",
        }]) as search,
        patch("app.routers.learn.answer_with_context", return_value="[PERSON_1] owns this." ) as llm,
    ):
        response = c.post("/learn/ask", json={"document_id": DOCUMENT_ID, "question": "Who owns it?"})
    assert response.status_code == 200
    assert response.json()["answer"] == "[PERSON_1] owns this."
    assert "text" not in str(response.json())
    assert response.json()["sources"] == [{"filename": "Document", "location": "Chunk 1"}]
    assert search.call_args.args[1] == DOCUMENT_ID
    assert llm.call_args.args[1][0]["text"] == "Owner is [PERSON_1]"


def test_ask_unauthorized_never_retrieves_chunks():
    with (
        client() as c,
        patch("app.routers.learn.get_document", return_value=DOCUMENT),
        patch("app.routers.learn.access_reason", return_value=None),
        patch("app.routers.learn.search_redacted_document") as search,
    ):
        response = c.post("/learn/ask", json={"document_id": DOCUMENT_ID, "question": "Secret?"})
    assert response.status_code == 404
    search.assert_not_called()


def test_ask_unredacted_document_is_rejected():
    with (
        client() as c,
        patch("app.routers.learn.get_document", return_value={**DOCUMENT, "status": "uploaded"}),
        patch("app.routers.learn.access_reason", return_value="uploader"),
        patch("app.routers.learn.search_redacted_document") as search,
    ):
        response = c.post("/learn/ask", json={"document_id": DOCUMENT_ID, "question": "Secret?"})
    assert response.status_code == 409
    search.assert_not_called()


def test_ask_without_index_does_not_call_llm():
    with (
        client() as c,
        patch("app.routers.learn.get_document", return_value=DOCUMENT),
        patch("app.routers.learn.access_reason", return_value="uploader"),
        patch("app.routers.learn.search_redacted_document", return_value=[]),
        patch("app.routers.learn.answer_with_context") as llm,
    ):
        response = c.post("/learn/ask", json={"document_id": DOCUMENT_ID, "question": "Secret?"})
    assert response.status_code == 409
    llm.assert_not_called()


def test_document_list_filters_unauthorized_metadata():
    from unittest.mock import MagicMock

    other_id = str(uuid4())
    db = MagicMock()
    db.table.return_value.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
        {**DOCUMENT, "file_type": ".txt"},
        {**DOCUMENT, "id": other_id, "original_name": "someone-else.txt"},
    ]

    with (
        client() as c,
        patch("app.routers.learn.get_client", return_value=db),
        patch("app.routers.learn.access_reason", side_effect=lambda user, record: (
            "uploader" if record["id"] == DOCUMENT_ID else None
        )),
        patch("app.routers.learn.is_document_indexed", return_value=True),
    ):
        response = c.get("/learn/documents")

    assert response.status_code == 200
    documents = response.json()["documents"]
    assert len(documents) == 1
    assert documents[0]["id"] == DOCUMENT_ID
    assert documents[0]["indexing_status"] == "indexed"
    assert "someone-else.txt" not in str(response.json())
    assert "redacted_text" not in str(response.json())


def test_retry_index_enforces_access_rules():
    with (
        client() as c,
        patch("app.documents.indexing.get_document", return_value=DOCUMENT),
        patch("app.documents.indexing.access_reason", return_value=None),
        patch("app.documents.indexing.index_redacted_document") as index,
    ):
        response = c.post(f"/learn/documents/{DOCUMENT_ID}/index")
    assert response.status_code == 404
    index.assert_not_called()


def test_missing_authorization_returns_401():
    with TestClient(app) as c:
        response = c.get("/learn/documents")
    assert response.status_code == 401
