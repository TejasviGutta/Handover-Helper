
from app.documents.extraction import extract_document
from app.ai.chunker import chunk_text


def prepare_document(content: bytes, filename: str) -> list[dict]:
    """
    Legacy document processing function.

    Extracts text directly from original file bytes.
    Retained for compatibility with existing tests.

    IMPORTANT:
    Do not use this function for indexing uploaded documents,
    because the extracted text has not been PII-redacted.
    """
    sections = extract_document(content, filename)

    chunks = []

    for section in sections:
        text_chunks = chunk_text(section["text"])

        for text_chunk in text_chunks:
            if text_chunk.strip():
                chunks.append({
                    "text": text_chunk,
                    "filename": filename,
                    "location": section["location"],
                })

    return chunks


def prepare_redacted_text(
    redacted_text: str,
    filename: str,
) -> list[dict]:
    """
    Prepare already-redacted document text for embedding.

    Input must come from the authorized document record's
    redacted_text column after successful PII redaction.

    Never pass original or unredacted file content here.
    """

    if not isinstance(redacted_text, str):
        raise ValueError("Redacted text must be a string")

    if not isinstance(filename, str) or not filename.strip():
        raise ValueError("Filename cannot be empty")

    if not redacted_text.strip():
        return []

    chunks = []

    for index, text_chunk in enumerate(chunk_text(redacted_text), start=1):
        if not text_chunk.strip():
            continue

        chunks.append({
            "text": text_chunk,
            "filename": filename,
            "location": f"Chunk {index}",
        })

    return chunks
