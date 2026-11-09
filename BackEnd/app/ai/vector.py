
from pathlib import Path
from uuid import uuid4

import chromadb

from .embeddings import embed_prompt, embed_chunks


ROOT_DIR = Path(__file__).resolve().parents[3]

DB_PATH = ROOT_DIR / "chroma_data"

client = chromadb.PersistentClient(path=str(DB_PATH))

collection = client.get_or_create_collection(
    name="handover_documents",
    configuration={"hnsw": {"space": "cosine"}}
)


def add_documents(chunks: list[str]) -> None:
    if not chunks:
        return

    vectors = embed_chunks(chunks)
    ids = [str(uuid4()) for _ in chunks]

    collection.add(
        ids=ids,
        documents=chunks,
        embeddings=vectors
    )


def search_documents(query: str, top_k: int = 3) -> list[str]:

    if not query.strip():
        raise ValueError("Query cannot be empty")

    if top_k <= 0:
        top_k = 3

    count = collection.count()

    if count == 0:
        return []

    query_vector = embed_prompt(query)

    results = collection.query(
        query_embeddings=[query_vector],
        n_results=min(top_k, count),
        include=["documents"]
    )

    return results["documents"][0]



def add_prepared_documents(
    chunks: list[dict],
    document_id: str
) -> list[str]:

    if not document_id.strip():
        raise ValueError("Document ID cannot be empty")

    texts = []
    metadatas = []

    for chunk in chunks:
        text = chunk["text"].strip()

        if not text:
            continue

        texts.append(text)

        metadatas.append({
            "document_id": document_id,
            "filename": chunk["filename"],
            "location": chunk["location"]
        })

    if not texts:
        return []

    vectors = embed_chunks(texts)
    ids = [str(uuid4()) for _ in texts]

    collection.add(
        ids=ids,
        documents=texts,
        embeddings=vectors,
        metadatas=metadatas
    )

    return ids



def search_prepared_documents(
    query: str,
    document_id: str,
    top_k: int = 3
) -> list[dict]:

    if not query.strip():
        raise ValueError("Query cannot be empty")

    if not document_id.strip():
        raise ValueError("Document ID cannot be empty")

    if top_k <= 0:
        top_k = 3

    count = collection.count()

    if count == 0:
        return []

    # Convert the user's question into an embedding
    query_vector = embed_prompt(query)

    # Search only within the selected document
    results = collection.query(
        query_embeddings=[query_vector],
        n_results=min(top_k, count),
        where={"document_id": document_id},
        include=["documents", "metadatas"]
    )

    # Combine retrieved text and metadata
    chunks = []

    for text, metadata in zip(
        results["documents"][0],
        results["metadatas"][0]
    ):
        chunks.append({
            "text": text,
            "document_id": metadata["document_id"],
            "filename": metadata["filename"],
            "location": metadata["location"]
        })

    return chunks
