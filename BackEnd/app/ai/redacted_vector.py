
"""
ChromaDB storage for PII-redacted documents only.

Only call index_redacted_document with text retrieved from
an authorized Supabase document that has passed redaction.

This collection is separate from the legacy vector index.
"""

from pathlib import Path
from uuid import UUID, NAMESPACE_URL, uuid5

import chromadb

from app.ai.embeddings import embed_chunks, embed_prompt
from app.documents.processing import prepare_redacted_text


ROOT_DIR = Path(__file__).resolve().parents[3]
DB_PATH = ROOT_DIR / "chroma_data"

client = chromadb.PersistentClient(path=str(DB_PATH))

collection = client.get_or_create_collection(
    name="handover_redacted_documents_v1",
    configuration={"hnsw": {"space": "cosine"}},
)


def _validate_document_id(document_id: str) -> str:
    """Require a valid document UUID."""
    try:
        return str(UUID(str(document_id)))
    except (ValueError, TypeError, AttributeError):
        raise ValueError("Invalid document ID") from None


def index_redacted_document(
    document_id: str,
    filename: str,
    redacted_text: str,
) -> int:
    """
    Index text that has already passed PII redaction.

    The caller must verify the document's database status
    and authorization before calling this function.

    Reindexing the same document replaces its previous
    chunks instead of accumulating duplicates.
    """
    document_id = _validate_document_id(document_id)

    chunks = prepare_redacted_text(redacted_text, filename)

    if not chunks:
        raise ValueError("No redacted text available for indexing")

    texts = [chunk["text"] for chunk in chunks]

    # Complete embedding generation before changing ChromaDB.
    embeddings = embed_chunks(texts)

    ids = [
        str(uuid5(NAMESPACE_URL, f"redacted:{document_id}:{index}"))
        for index in range(len(chunks))
    ]

    metadatas = [
        {
            "document_id": document_id,
            "filename": chunk["filename"],
            "location": chunk["location"],
            "content_type": "redacted",
        }
        for chunk in chunks
    ]

    # Record the old chunk IDs so outdated chunks can be removed.
    existing = collection.get(
        where={"document_id": document_id},
        include=[],
    )
    previous_ids = set(existing["ids"])

    # Stable IDs make repeated indexing idempotent.
    collection.upsert(
        ids=ids,
        documents=texts,
        embeddings=embeddings,
        metadatas=metadatas,
    )

    # Remove outdated chunks only after the new index was saved.
    stale_ids = list(previous_ids - set(ids))

    if stale_ids:
        collection.delete(ids=stale_ids)

    return len(ids)


def search_redacted_document(
    question: str,
    document_id: str,
    top_k: int = 3,
) -> list[dict]:
    """
    Retrieve chunks belonging only to the requested document.

    Authorization must be enforced by the API before this
    function is called.
    """
    document_id = _validate_document_id(document_id)

    if not isinstance(question, str) or not question.strip():
        raise ValueError("Question cannot be empty")

    if top_k <= 0:
        top_k = 3

    existing = collection.get(
        where={"document_id": document_id},
        include=[],
    )

    count = len(existing["ids"])

    if count == 0:
        return []

    query_embedding = embed_prompt(question)

    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=min(top_k, count),
        where={"document_id": document_id},
        include=["documents", "metadatas"],
    )

    matches = []

    for text, metadata in zip(
        results["documents"][0],
        results["metadatas"][0],
    ):
        matches.append(
            {
                "text": text,
                "document_id": metadata["document_id"],
                "filename": metadata["filename"],
                "location": metadata["location"],
            }
        )

    return matches
