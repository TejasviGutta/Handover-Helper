
from uuid import uuid4

from app.documents.processing import prepare_document
from app.ai.vector import (
    add_prepared_documents,
    search_prepared_documents,
    collection
)

print("\nTEST: Document-specific retrieval")

document_a_id = str(uuid4())
document_b_id = str(uuid4())

all_ids = []

try:
    # First document
    chunks_a = prepare_document(
        b"Project Alpha uses PostgreSQL as its database.",
        "alpha.txt"
    )

    ids_a = add_prepared_documents(
        chunks_a, document_a_id
    )
    all_ids.extend(ids_a)

    # Second document
    chunks_b = prepare_document(
        b"Project Beta uses MongoDB as its database.",
        "beta.txt"
    )

    ids_b = add_prepared_documents(
        chunks_b, document_b_id
    )
    all_ids.extend(ids_b)

    # Search only Project Alpha
    results = search_prepared_documents(
        "What database does this project use?",
        document_a_id
    )

    for result in results:
        print(result)

    assert len(results) == 1
    assert results[0]["document_id"] == document_a_id
    assert results[0]["filename"] == "alpha.txt"
    assert "PostgreSQL" in results[0]["text"]
    assert "MongoDB" not in results[0]["text"]

    print("TEST PASSED!")

finally:
    # Clean up test documents
    if all_ids:
        collection.delete(ids=all_ids)
