from BackEnd.app.ai.chunker import chunk_text

text = "ABCDEFGHIJ"

chunks = chunk_text(
    text,
    chunk_size=5,
    overlap=2
)

print(chunks)
