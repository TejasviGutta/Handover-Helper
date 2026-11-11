
from unittest.mock import patch
from uuid import uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes.learn import router, authorize_document
from types import SimpleNamespace
from unittest.mock import MagicMock

from app.routes.learn import (
    get_authenticated_user,
    get_database_client
)


app = FastAPI()
app.include_router(router)

client = TestClient(app)

payload = {
    "question": "What database does the project use?",
    "document_id": str(uuid4()),
    "top_k": 3
}


# TEST 1: Real access should be blocked
print("\nTEST 1: Authorization protection")

response = client.post("/learn/ask", json=payload)

assert response.status_code == 503
print("TEST 1 PASSED!")


# TEST 2: Simulate authorized access
print("\nTEST 2: Learn API response")

app.dependency_overrides[authorize_document] = lambda: {
    "id": payload["document_id"],
    "uploaded_by": "test-user",
    "status": "parsed"
}

try:
    with patch(
        "app.routes.learn.ask_document_question",
        return_value={
            "answer": "PostgreSQL",
            "sources": [
                {
                    "filename": "project.txt",
                    "location": "Document"
                }
            ]
        }
    ):
        response = client.post("/learn/ask", json=payload)

    assert response.status_code == 200

    result = response.json()

    assert result["answer"] == "PostgreSQL"
    assert result["sources"][0]["filename"] == "project.txt"

    print("AI Answer:", result["answer"])
    print("Sources:", result["sources"])
    print("TEST 2 PASSED!")

finally:
    app.dependency_overrides.clear()



print("\nTEST 3: Unauthorized user cannot reach AI")

# Simulate a document belonging to John
fake_db = MagicMock()

fake_db.table.return_value \
    .select.return_value \
    .eq.return_value \
    .limit.return_value \
    .execute.return_value.data = [
        {
            "id": payload["document_id"],
            "uploaded_by": "user-john",
            "handover_id": None,
            "status": "parsed"
        }
    ]

# Simulate Sarah being logged in
app.dependency_overrides[get_authenticated_user] = (
    lambda: SimpleNamespace(id="user-sarah")
)

app.dependency_overrides[get_database_client] = (
    lambda: fake_db
)

try:
    # Track whether Qwen3 is ever called
    with patch(
        "app.routes.learn.ask_document_question"
    ) as mock_ai:

        response = client.post(
            "/learn/ask",
            json=payload
        )

        # Access must be denied
        assert response.status_code == 404

        # AI must never be called
        mock_ai.assert_not_called()

    print("Access denied:", response.json())
    print("AI was not called.")
    print("TEST 3 PASSED!")

finally:
    app.dependency_overrides.clear()
