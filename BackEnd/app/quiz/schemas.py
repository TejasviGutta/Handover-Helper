"""Request/response models for quiz generation.

Field names match the frontend question shape: {prompt, options, correct}.
"""

from datetime import datetime
from enum import Enum
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

OPTION_COUNT = 4
ALLOWED_QUESTION_COUNTS = (3, 5, 10)


class Difficulty(str, Enum):
  foundational = "foundational"
  balanced = "balanced"
  in_depth = "in_depth"


class GenerateQuizRequest(BaseModel):
  model_config = ConfigDict(extra="forbid")

  handover_id: UUID
  document_ids: list[UUID] = Field(min_length=1, max_length=20)
  num_questions: int = 10
  difficulty: Difficulty = Difficulty.balanced

  @field_validator("num_questions")
  @classmethod
  def check_count(cls, value: int) -> int:
    if value not in ALLOWED_QUESTION_COUNTS:
      raise ValueError(f"num_questions must be one of {ALLOWED_QUESTION_COUNTS}")
    return value

  @field_validator("document_ids")
  @classmethod
  def dedupe_ids(cls, value: list[UUID]) -> list[UUID]:
    # Keep order, drop duplicates.
    return list(dict.fromkeys(value))


class QuizQuestion(BaseModel):
  """One multiple-choice question. Used to validate LLM output."""

  model_config = ConfigDict(extra="ignore")

  prompt: str = Field(min_length=5, max_length=500)
  options: list[str] = Field(min_length=OPTION_COUNT, max_length=OPTION_COUNT)
  correct: int = Field(ge=0, lt=OPTION_COUNT)
  explanation: str | None = Field(default=None, max_length=1000)
  source_chunk_ids: list[str] = Field(default_factory=list, max_length=10)

  @field_validator("prompt", "explanation")
  @classmethod
  def strip_text(cls, value: str | None) -> str | None:
    return value.strip() if isinstance(value, str) else value

  @field_validator("options")
  @classmethod
  def check_options(cls, value: list[str]) -> list[str]:
    cleaned = [option.strip() for option in value]
    if any(not option or len(option) > 200 for option in cleaned):
      raise ValueError("each option must be 1-200 characters")
    if len({option.lower() for option in cleaned}) != len(cleaned):
      raise ValueError("options must be distinct")
    return cleaned

  @model_validator(mode="after")
  def check_prompt_not_empty(self):
    if len(self.prompt) < 5:
      raise ValueError("prompt is too short")
    return self


class ContextChunk(BaseModel):
  """A piece of (already PII-redacted) document text used as quiz context."""

  chunk_id: str
  document_id: str
  text: str


class GenerateQuizResponse(BaseModel):
  questions: list[QuizQuestion]
  requested: int
  generated: int


# ---------- Saving quizzes ----------

QuizStatus = Literal["draft", "published"]
MAX_SAVED_QUESTIONS = 50


class QuestionDraft(BaseModel):
  """A question as edited by the user. Drafts may be incomplete."""

  model_config = ConfigDict(extra="ignore")

  prompt: str = Field(default="", max_length=500)
  options: list[str] = Field(
    default_factory=lambda: [""] * OPTION_COUNT,
    min_length=OPTION_COUNT,
    max_length=OPTION_COUNT,
  )
  correct: int = Field(default=0, ge=0, lt=OPTION_COUNT)
  explanation: str | None = Field(default=None, max_length=1000)
  source_chunk_ids: list[str] = Field(default_factory=list, max_length=10)
  is_ai_generated: bool = True

  @field_validator("prompt")
  @classmethod
  def strip_prompt(cls, value: str) -> str:
    return value.strip()

  @field_validator("options")
  @classmethod
  def strip_options(cls, value: list[str]) -> list[str]:
    cleaned = [option.strip() for option in value]
    if any(len(option) > 200 for option in cleaned):
      raise ValueError("each option must be at most 200 characters")
    return cleaned


class QuizSave(BaseModel):
  """Body for updating a quiz (PUT replaces the whole quiz)."""

  model_config = ConfigDict(extra="forbid")

  title: str = Field(min_length=1, max_length=200)
  status: QuizStatus = "draft"
  difficulty: Difficulty = Difficulty.balanced
  document_ids: list[UUID] = Field(default_factory=list, max_length=20)
  questions: list[QuestionDraft] = Field(default_factory=list, max_length=MAX_SAVED_QUESTIONS)

  @field_validator("title")
  @classmethod
  def strip_title(cls, value: str) -> str:
    value = value.strip()
    if not value:
      raise ValueError("title is required")
    return value

  @field_validator("document_ids")
  @classmethod
  def dedupe_documents(cls, value: list[UUID]) -> list[UUID]:
    return list(dict.fromkeys(value))

  @model_validator(mode="after")
  def check_published_is_complete(self):
    """Drafts can be saved half-finished; published quizzes must be complete."""
    if self.status != "published":
      return self
    if not self.questions:
      raise ValueError("a published quiz needs at least one question")
    for index, question in enumerate(self.questions, start=1):
      try:
        QuizQuestion.model_validate(question.model_dump())
      except ValueError:
        raise ValueError(f"question {index} is incomplete or invalid")
    return self


class QuizCreate(QuizSave):
  """Body for creating a quiz."""

  handover_id: UUID


class SavedQuestion(QuestionDraft):
  id: UUID
  position: int


class QuizSummary(BaseModel):
  """One row in a quiz list (no questions)."""

  id: UUID
  title: str
  status: QuizStatus
  question_count: int
  updated_at: datetime


class QuizOut(BaseModel):
  id: UUID
  handover_id: UUID
  title: str
  status: QuizStatus
  difficulty: Difficulty
  question_count: int
  document_ids: list[UUID]
  questions: list[SavedQuestion]
  created_at: datetime
  updated_at: datetime