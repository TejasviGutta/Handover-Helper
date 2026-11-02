def chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> list[str]:

    if chunk_size <= 0:
        raise ValueError("chunk size must be positive")

    if overlap < 0 or overlap >= chunk_size:
        raise ValueError("Invalid overlap")

    chunks = []
    start = 0

    while start < len(text):
        end = min(start + chunk_size, len(text))

        chunk = text[start:end]
        chunks.append(chunk)

        if end == len(text):
            break

        start = end - overlap

    return chunks
