"""Database access for saved quizzes.

The backend client uses the service role key, so row level security does NOT
apply here. Callers must check access before using these methods.
"""

from typing import Any
from uuid import UUID

from app.quiz.schemas import QuizOut, QuizSave, QuizSummary


class QuizRepository:
  def __init__(self, client: Any) -> None:
    self.client = client

  def documents_belong_to_handover(self, handover_id: UUID, document_ids: list[UUID]) -> bool:
    if not document_ids:
      return True
    wanted = {str(doc_id) for doc_id in document_ids}
    rows = (
      self.client.table("documents")
      .select("id")
      .in_("id", sorted(wanted))
      .eq("handover_id", str(handover_id))
      .execute()
      .data
    ) or []
    return {row["id"] for row in rows} == wanted

  def save(
    self,
    *,
    quiz_id: UUID | None,
    handover_id: UUID,
    owner_id: str,
    data: QuizSave,
  ) -> UUID:
    """Create (quiz_id=None) or fully replace a quiz in one transaction."""
    params = {
      "p_quiz_id": str(quiz_id) if quiz_id else None,
      "p_handover_id": str(handover_id),
      "p_owner_id": str(owner_id),
      "p_title": data.title,
      "p_status": data.status,
      "p_difficulty": data.difficulty.value,
      "p_document_ids": [str(doc_id) for doc_id in data.document_ids],
      "p_questions": [question.model_dump(mode="json") for question in data.questions],
    }
    result = self.client.rpc("save_quiz", params).execute().data
    return UUID(str(result))

  def list_for_owner(self, handover_id: UUID, owner_id: str) -> list[QuizSummary]:
    """Quizzes the user owns in one handover, newest first."""
    rows = (
      self.client.table("quizzes")
      .select("id, title, status, question_count, updated_at")
      .eq("handover_id", str(handover_id))
      .eq("owner_id", str(owner_id))
      .order("updated_at", desc=True)
      .execute()
      .data
    ) or []
    return [QuizSummary(**row) for row in rows]

  def get_access_info(self, quiz_id: UUID) -> dict | None:
    """Return {id, handover_id, owner_id} or None if the quiz doesn't exist."""
    rows = (
      self.client.table("quizzes")
      .select("id, handover_id, owner_id")
      .eq("id", str(quiz_id))
      .limit(1)
      .execute()
      .data
    )
    return rows[0] if rows else None

  def get(self, quiz_id: UUID) -> QuizOut | None:
    rows = (
      self.client.table("quizzes")
      .select("id, handover_id, title, status, difficulty, question_count, created_at, updated_at")
      .eq("id", str(quiz_id))
      .limit(1)
      .execute()
      .data
    )
    if not rows:
      return None

    questions = (
      self.client.table("quiz_questions")
      .select("id, position, prompt, options, correct_index, explanation, source_chunk_ids, is_ai_generated")
      .eq("quiz_id", str(quiz_id))
      .order("position")
      .execute()
      .data
    ) or []

    documents = (
      self.client.table("quiz_documents")
      .select("document_id")
      .eq("quiz_id", str(quiz_id))
      .execute()
      .data
    ) or []

    return QuizOut(
      **rows[0],
      document_ids=[row["document_id"] for row in documents],
      questions=[
        {**question, "correct": question["correct_index"]}
        for question in questions
      ],
    )