
from uuid import uuid4

from app.documents.processing import prepare_document
from app.ai.vector import add_prepared_documents, collection
from app.ai.rag import ask_document_question


print("\nTEST: Complete Document RAG Pipeline")

# Step 1: Create a sample document
content = b"""
Project: Handover Helper

The project uses PostgreSQL as its database.

John is the project manager.

The team is currently working on RAG integration.
"""

document_id = str(uuid4())
ids = []

try:
    # Step 2: Extract and chunk the document
    chunks = prepare_document(content, "project.txt")

    print("Chunks prepared:", len(chunks))

    # Step 3: Store chunks and embeddings in ChromaDB
    ids = add_prepared_documents(chunks, document_id)

    print("Chunks stored:", len(ids))

    # Step 4: Ask Qwen3 a question about the document
    question = "What database does this project use?"

    result = ask_document_question(
        question,
        document_id
    )

    # Step 5: Display the answer
    print("\nQuestion:", question)
    print("AI Answer:", result["answer"])
    print("Sources:", result["sources"])

    # Step 6: Verify the result
    assert "PostgreSQL" in result["answer"]
    assert len(result["sources"]) > 0
    assert result["sources"][0]["filename"] == "project.txt"

    print("\nTEST PASSED!")

finally:
    # Remove test data
    if ids:
        collection.delete(ids=ids)
