from uuid import UUID

import pytest

from app.quiz.context import (
  DocumentAccessError,
  SupabaseContextSource,
  simple_chunk,
  user_can_access_handover,
)
from tests.fake_db import FakeDB

HANDOVER = UUID("00000000-0000-0000-0000-0000000000aa")
OTHER_HANDOVER = UUID("00000000-0000-0000-0000-0000000000bb")
DOC_A = UUID("00000000-0000-0000-0000-00000000000a")
DOC_B = UUID("00000000-0000-0000-0000-00000000000b")
DOC_RAW = UUID("00000000-0000-0000-0000-00000000000c")
DOC_OTHER = UUID("00000000-0000-0000-0000-00000000000d")
USER = "user_123"


def make_db():
  return FakeDB(
    documents=[
      {"id": str(DOC_A), "handover_id": str(HANDOVER), "status": "approved",
       "redacted_text": "Para one.\n\nPara two.\n\nPara three."},
      {"id": str(DOC_B), "handover_id": str(HANDOVER), "status": "redacted",
       "redacted_text": "Only one paragraph."},
      {"id": str(DOC_RAW), "handover_id": str(HANDOVER), "status": "uploaded",
       "redacted_text": None},
      {"id": str(DOC_OTHER), "handover_id": str(OTHER_HANDOVER), "status": "approved",
       "redacted_text": "Belongs elsewhere."},
    ],
    handovers=[{"id": str(HANDOVER), "created_by": USER}],
  )


def test_returns_chunks_from_both_documents_evenly():
  source = SupabaseContextSource(make_db(), chunk_fn=lambda t: t.split("\n\n"))
  chunks = source.get_chunks(HANDOVER, [DOC_A, DOC_B], limit=3)
  assert [c.document_id for c in chunks] == [str(DOC_A), str(DOC_B), str(DOC_A)]
  assert chunks[0].chunk_id == f"{DOC_A}:0"


def test_respects_limit():
  source = SupabaseContextSource(make_db(), chunk_fn=lambda t: t.split("\n\n"))
  assert len(source.get_chunks(HANDOVER, [DOC_A, DOC_B], limit=2)) == 2


@pytest.mark.parametrize("doc", [DOC_RAW, DOC_OTHER, UUID(int=999)])
def test_rejects_unredacted_foreign_or_missing_documents(doc):
  source = SupabaseContextSource(make_db())
  with pytest.raises(DocumentAccessError):
    source.get_chunks(HANDOVER, [DOC_A, doc], limit=10)


def test_handover_access():
  db = make_db()
  assert user_can_access_handover(db, HANDOVER, USER)
  assert not user_can_access_handover(db, HANDOVER, "someone_else")
  assert not user_can_access_handover(db, OTHER_HANDOVER, USER)


def test_simple_chunk_packs_and_splits():
  text = "a" * 50 + "\n\n" + "b" * 50 + "\n\n" + "c" * 250
  chunks = simple_chunk(text, max_chars=120)
  assert all(len(c) <= 120 for c in chunks)
  assert "".join(c.replace("\n", "") for c in chunks) == "a" * 50 + "b" * 50 + "c" * 250