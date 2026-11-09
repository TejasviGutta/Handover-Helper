
from uuid import uuid4

from app.documents.processing import prepare_document
from app.ai.vector import (
    add_prepared_documents,
    collection
)

print("\nTEST: Store document with metadata")

content = b"""
Project: Handover Helper
Database: PostgreSQL
Pending Task: Complete RAG integration.
"""

chunks = prepare_document(content, "handover.txt")
document_id = str(uuid4())

ids = add_prepared_documents(chunks, document_id)

try:
    result = collection.get(
        ids=ids,
        include=["documents", "metadatas"]
    )

    assert len(result["ids"]) == 1
    assert "PostgreSQL" in result["documents"][0]

    metadata = result["metadatas"][0]

    assert metadata["document_id"] == document_id
    assert metadata["filename"] == "handover.txt"
    assert metadata["location"] == "Document"

    print("Stored text:", result["documents"][0])
    print("Stored metadata:", metadata)
    print("TEST PASSED!")

finally:
    if ids:
        collection.delete(ids=ids)
