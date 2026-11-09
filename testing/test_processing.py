
from app.documents.processing import prepare_document


# TEST 1: Short document
print("\nTEST 1: Short document")

content = b"""
Project: Handover Helper
Project Manager: John
Database: PostgreSQL
Pending Task: Complete RAG integration.
"""

chunks = prepare_document(content, "handover.txt")

for chunk in chunks:
    print(chunk)

assert len(chunks) == 1
assert chunks[0]["filename"] == "handover.txt"
assert chunks[0]["location"] == "Document"
assert "PostgreSQL" in chunks[0]["text"]

print("TEST 1 PASSED!")


# TEST 2: Long document
print("\nTEST 2: Long document")

long_text = (
    "Handover Helper stores project information. "
    "The team is responsible for documentation. "
) * 20

chunks = prepare_document(
    long_text.encode("utf-8"),
    "long_handover.txt"
)

print("Number of chunks:", len(chunks))

for index, chunk in enumerate(chunks, start=1):
    print(f"Chunk {index}:")
    print("  Length:", len(chunk["text"]))
    print("  Filename:", chunk["filename"])
    print("  Location:", chunk["location"])

assert len(chunks) > 1

for chunk in chunks:
    assert chunk["filename"] == "long_handover.txt"
    assert chunk["location"] == "Document"
    assert len(chunk["text"]) <= 500

print("TEST 2 PASSED!")
