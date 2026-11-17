"""Tiny in-memory stand-in for the Supabase client used in tests."""

import uuid
from datetime import datetime, timezone
from types import SimpleNamespace


class FakeQuery:
  def __init__(self, rows):
    self.rows = list(rows)

  def select(self, *_):
    return self

  def eq(self, column, value):
    self.rows = [r for r in self.rows if str(r.get(column)) == str(value)]
    return self

  def in_(self, column, values):
    values = {str(v) for v in values}
    self.rows = [r for r in self.rows if str(r.get(column)) in values]
    return self

  def order(self, column, desc=False):
    self.rows = sorted(self.rows, key=lambda r: r[column], reverse=desc)
    return self

  def limit(self, n):
    self.rows = self.rows[:n]
    return self

  def execute(self):
    return SimpleNamespace(data=[dict(r) for r in self.rows])


class FakeRpc:
  def __init__(self, data):
    self.data = data

  def execute(self):
    return SimpleNamespace(data=self.data)


class FakeDB:
  def __init__(self, **tables):
    self.tables = {name: list(rows) for name, rows in tables.items()}
    for name in ("quizzes", "quiz_questions", "quiz_documents"):
      self.tables.setdefault(name, [])
    self.fail_rpc = False

  def table(self, name):
    return FakeQuery(self.tables.get(name, []))

  def rpc(self, name, params):
    assert name == "save_quiz"
    if self.fail_rpc:
      raise RuntimeError("simulated database error")
    return FakeRpc(self._save_quiz(**params))

  def _save_quiz(self, p_quiz_id, p_handover_id, p_owner_id, p_title, p_status,
                 p_difficulty, p_document_ids, p_questions):
    """Mirrors migrations/002_create_save_quiz_function.sql."""
    now = datetime.now(timezone.utc).isoformat()
    quizzes = self.tables["quizzes"]
    if p_quiz_id is None:
      quiz = {"id": str(uuid.uuid4()), "handover_id": p_handover_id, "owner_id": p_owner_id,
              "created_at": now}
      quizzes.append(quiz)
    else:
      matches = [q for q in quizzes if q["id"] == p_quiz_id and q["handover_id"] == p_handover_id]
      if not matches:
        raise RuntimeError("quiz not found")
      quiz = matches[0]
    quiz.update(title=p_title, status=p_status, difficulty=p_difficulty,
                question_count=len(p_questions), updated_at=now)
    qid = quiz["id"]
    self.tables["quiz_questions"] = [r for r in self.tables["quiz_questions"] if r["quiz_id"] != qid]
    self.tables["quiz_documents"] = [r for r in self.tables["quiz_documents"] if r["quiz_id"] != qid]
    for doc_id in dict.fromkeys(p_document_ids):
      self.tables["quiz_documents"].append({"quiz_id": qid, "document_id": doc_id})
    for position, q in enumerate(p_questions):
      self.tables["quiz_questions"].append({
        "id": str(uuid.uuid4()), "quiz_id": qid, "position": position,
        "prompt": q["prompt"], "options": q["options"], "correct_index": q["correct"],
        "explanation": q.get("explanation"), "source_chunk_ids": q.get("source_chunk_ids", []),
        "is_ai_generated": q.get("is_ai_generated", True),
      })
    return qid