
from app.documents.extraction import extract_document
from app.ai.chunker import chunk_text


def prepare_document(content: bytes, filename: str) -> list[dict]:
    sections = extract_document(content, filename)

    chunks = []

    for section in sections:

        text_chunks = chunk_text(section["text"])

        for text_chunk in text_chunks:
            if text_chunk.strip():
                chunks.append({
                    "text": text_chunk,
                    "filename": filename,
                    "location": section["location"]
                })

    return chunks
