"""Load redacted document text from the database and split it into chunks.

The backend client uses the service role key, so row level security does NOT
apply here. Every query must filter by handover_id explicitly.
"""

from typing import Any, Callable
from uuid import UUID

from app.quiz.schemas import ContextChunk

# Only documents that already went through PII redaction may be used.
USABLE_STATUSES = ("redacted", "in_review", "approved")

ChunkFn = Callable[[str], list[str]]


class DocumentAccessError(Exception):
  """A requested document is missing, in another handover, or not redacted yet."""


def simple_chunk(text: str, max_chars: int = 1200) -> list[str]:
  """Split text on blank lines, packing paragraphs up to max_chars."""
  chunks: list[str] = []
  current = ""
  for paragraph in (p.strip() for p in text.split("\n\n")):
    if not paragraph:
      continue
    while len(paragraph) > max_chars:
      if current:
        chunks.append(current)
        current = ""
      chunks.append(paragraph[:max_chars])
      paragraph = paragraph[max_chars:]
    if current and len(current) + len(paragraph) + 2 > max_chars:
      chunks.append(current)
      current = paragraph
    else:
      current = f"{current}\n\n{paragraph}" if current else paragraph
  if current:
    chunks.append(current)
  return chunks


def _round_robin(per_doc: list[list[ContextChunk]], limit: int) -> list[ContextChunk]:
  """Take chunks evenly from each document so one long file doesn't dominate."""
  result: list[ContextChunk] = []
  index = 0
  while len(result) < limit and any(index < len(chunks) for chunks in per_doc):
    for chunks in per_doc:
      if index < len(chunks) and len(result) < limit:
        result.append(chunks[index])
    index += 1
  return result


class SupabaseContextSource:
  def __init__(self, client: Any, chunk_fn: ChunkFn = simple_chunk) -> None:
    self.client = client
    self.chunk_fn = chunk_fn

  def get_chunks(
    self, handover_id: UUID, document_ids: list[UUID], limit: int
  ) -> list[ContextChunk]:
    requested = {str(doc_id) for doc_id in document_ids}
    rows = (
      self.client.table("documents")
      .select("id, handover_id, status, redacted_text")
      .in_("id", sorted(requested))
      .eq("handover_id", str(handover_id))
      .execute()
      .data
    ) or []

    usable = {
      row["id"]: row
      for row in rows
      if row.get("status") in USABLE_STATUSES and row.get("redacted_text")
    }
    if set(usable) != requested:
      # Don't say which document failed or why (avoids leaking what exists).
      raise DocumentAccessError("some documents are unavailable")

    per_doc: list[list[ContextChunk]] = []
    for doc_id in (str(d) for d in document_ids):
      pieces = self.chunk_fn(usable[doc_id]["redacted_text"])
      per_doc.append(
        [
          ContextChunk(chunk_id=f"{doc_id}:{i}", document_id=doc_id, text=piece)
          for i, piece in enumerate(pieces)
        ]
      )
    return _round_robin(per_doc, limit)


def user_can_access_handover(client: Any, handover_id: UUID, user_id: str) -> bool:
  """True if the user created the handover.

    TODO(team): extend when handovers gets a user id for the incoming person,
    or when roles (e.g. managers) should see every handover.
    """
  rows = (
    client.table("handovers")
    .select("id")
    .eq("id", str(handover_id))
    .eq("created_by", str(user_id))
    .limit(1)
    .execute()
    .data
  )
  return bool(rows)