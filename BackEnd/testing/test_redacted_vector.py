
from uuid import uuid4
from unittest.mock import patch

import chromadb
import pytest

from app.ai import redacted_vector


@pytest.fixture
def test_collection(monkeypatch):
    # Use an in-memory ChromaDB collection.
    # Nothing is written to the project's real database.
    client = chromadb.EphemeralClient()
    collection = client.get_or_create_collection(
        name=f"test_{uuid4().hex}",
        configuration={"hnsw": {"space": "cosine"}},
    )

    monkeypatch.setattr(redacted_vector, "collection", collection)

    # Deterministic embeddings for testing.
    def fake_embed_chunks(texts):
        return [
            [1.0, 0.0, 0.0]
            if "manager" in text.lower()
            else [0.0, 1.0, 0.0]
            for text in texts
        ]

    def fake_embed_prompt(question):
        return [1.0, 0.0, 0.0]

    monkeypatch.setattr(
        redacted_vector,
        "embed_chunks",
        fake_embed_chunks,
    )

    monkeypatch.setattr(
        redacted_vector,
        "embed_prompt",
        fake_embed_prompt,
    )

    yield collection

    client.delete_collection(collection.name)


def test_redacted_document_is_indexed(test_collection):
    document_id = str(uuid4())

    count = redacted_vector.index_redacted_document(
        document_id=document_id,
        filename="handover.txt",
        redacted_text="The project manager is [PERSON_1].",
    )

    assert count == 1
    assert test_collection.count() == 1


def test_reindexing_does_not_create_duplicates(test_collection):
    document_id = str(uuid4())

    for _ in range(2):
        redacted_vector.index_redacted_document(
            document_id=document_id,
            filename="handover.txt",
            redacted_text="The project manager is [PERSON_1].",
        )

    assert test_collection.count() == 1


def test_search_returns_correct_document(test_collection):
    document_a = str(uuid4())
    document_b = str(uuid4())

    redacted_vector.index_redacted_document(
        document_id=document_a,
        filename="first.txt",
        redacted_text="The project manager is [PERSON_1].",
    )

    redacted_vector.index_redacted_document(
        document_id=document_b,
        filename="second.txt",
        redacted_text="The manager is [PERSON_2].",
    )

    results = redacted_vector.search_redacted_document(
        question="Who is the project manager?",
        document_id=document_a,
    )

    assert len(results) == 1
    assert results[0]["document_id"] == document_a
    assert results[0]["filename"] == "first.txt"
    assert "[PERSON_1]" in results[0]["text"]
    assert "[PERSON_2]" not in results[0]["text"]


def test_empty_document_rejected(test_collection):
    with pytest.raises(ValueError):
        redacted_vector.index_redacted_document(
            document_id=str(uuid4()),
            filename="empty.txt",
            redacted_text="",
        )

