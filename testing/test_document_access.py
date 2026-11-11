
from unittest.mock import MagicMock
from fastapi import HTTPException

from app.documents.access import check_document_access


def mock_database(documents):
    db = MagicMock()

    db.table.return_value \
        .select.return_value \
        .eq.return_value \
        .limit.return_value \
        .execute.return_value.data = documents

    return db


# TEST 1: User accesses their own document
print("\nTEST 1: Authorized access")

db = mock_database([
    {
        "id": "doc-123",
        "uploaded_by": "user-john",
        "handover_id": None,
        "status": "parsed"
    }
])

result = check_document_access(
    document_id="doc-123",
    user_id="user-john",
    db=db
)

assert result["id"] == "doc-123"
print("TEST 1 PASSED!")


# TEST 2: User tries to access someone else's document
print("\nTEST 2: Unauthorized access")

try:
    check_document_access(
        document_id="doc-123",
        user_id="user-sarah",
        db=db
    )
    raise AssertionError("Access should have been denied")

except HTTPException as error:
    assert error.status_code == 404
    print("TEST 2 PASSED!")


# TEST 3: Document doesn't exist
print("\nTEST 3: Missing document")

empty_db = mock_database([])

try:
    check_document_access(
        document_id="missing-doc",
        user_id="user-john",
        db=empty_db
    )
    raise AssertionError("Document should not exist")

except HTTPException as error:
    assert error.status_code == 404
    print("TEST 3 PASSED!")
