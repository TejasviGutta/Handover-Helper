
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
