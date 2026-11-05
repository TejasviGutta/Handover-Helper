from sentence_transformers import SentenceTransformer

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"

model = SentenceTransformer(MODEL_NAME)


def embed_prompt(prompt: str) -> list[float]:
    if not prompt.strip():
        raise ValueError("Text cannot be empty")

    embedding = model.encode(prompt)

    return embedding.tolist()


def embed_chunks(chunks: list[str]) -> list[list[float]]:
    if not chunks:
        return []

    if any(not chunk.strip() for chunk in chunks):
        raise ValueError("Chunks cannot be empty")

    embeddings = model.encode(chunks)

    return embeddings.tolist()
