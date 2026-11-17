"""Quiz generation: context -> prompt -> LLM -> validated questions.

Dependencies are injected so this module can be tested without a database,
a vector store, or a real LLM.
"""

import json
import logging
import re
from typing import Callable, Protocol
from uuid import UUID

from pydantic import ValidationError

from app.quiz.prompts import build_quiz_prompt
from app.quiz.schemas import (
  ContextChunk,
  GenerateQuizRequest,
  GenerateQuizResponse,
  QuizQuestion,
)

logger = logging.getLogger(__name__)

LLMFn = Callable[[str], str]
RedactFn = Callable[[str], str]


class ContextSource(Protocol):
  def get_chunks(
    self, handover_id: UUID, document_ids: list[UUID], limit: int
  ) -> list[ContextChunk]:
    """Return redacted text chunks for the given documents.

        Implementations must only return documents that belong to handover_id
        and are already redacted/approved. Never return raw (unredacted) text.
        """
    ...


class QuizGenerationError(Exception):
  """Raised when no usable questions could be generated."""


class NoContextError(QuizGenerationError):
  """Raised when the selected documents have no usable text."""


_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE)
# Reasoning models (e.g. Qwen3) may prepend <think>...</think> blocks.
_THINK_BLOCK_RE = re.compile(r"<think\b[^>]*>.*?</think\s*>", re.IGNORECASE | re.DOTALL)
# An opening tag with no closing tag means the reply was cut off mid-thought.
_UNCLOSED_THINK_RE = re.compile(r"<think\b[^>]*>.*\Z", re.IGNORECASE | re.DOTALL)


# A closing tag with no opening tag: some thinking-only models omit "<think>".
_CLOSE_THINK_RE = re.compile(r"</think\s*>", re.IGNORECASE)


def strip_think_blocks(raw: str) -> str:
  """Remove reasoning blocks so only the final answer is parsed."""
  text = _THINK_BLOCK_RE.sub("", raw)
  # Everything before a leftover closing tag is reasoning.
  closings = list(_CLOSE_THINK_RE.finditer(text))
  if closings:
    text = text[closings[-1].end():]
  text = _UNCLOSED_THINK_RE.sub("", text)
  return text.strip()


def extract_json(raw: str) -> dict:
  """Parse the LLM reply, tolerating think blocks, code fences or extra text."""
  text = _FENCE_RE.sub("", strip_think_blocks(raw))
  try:
    data = json.loads(text)
  except json.JSONDecodeError:
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
      raise ValueError("no JSON object found in LLM output")
    data = json.loads(text[start : end + 1])

  if isinstance(data, list):
    data = {"questions": data}
  if not isinstance(data, dict) or not isinstance(data.get("questions"), list):
    raise ValueError("LLM output has no 'questions' list")
  return data


def parse_questions(raw: str, valid_chunk_ids: set[str]) -> list[QuizQuestion]:
  """Validate each question separately so one bad item doesn't drop the rest."""
  data = extract_json(raw)
  questions: list[QuizQuestion] = []
  for item in data["questions"]:
    try:
      question = QuizQuestion.model_validate(item)
    except ValidationError:
      continue
    # Keep only chunk ids that actually came from the provided context.
    question.source_chunk_ids = [
      cid for cid in question.source_chunk_ids if cid in valid_chunk_ids
    ]
    questions.append(question)
  return questions


class QuizGenerator:
  def __init__(
    self,
    context_source: ContextSource,
    llm: LLMFn,
    redact: RedactFn | None = None,
    max_attempts: int = 2,
    max_chunks: int = 30,
  ) -> None:
    self.context_source = context_source
    self.llm = llm
    self.redact = redact
    self.max_attempts = max_attempts
    self.max_chunks = max_chunks

  def _redact_question(self, question: QuizQuestion) -> QuizQuestion:
    if self.redact is None:
      return question
    return question.model_copy(
      update={
        "prompt": self.redact(question.prompt),
        "options": [self.redact(option) for option in question.options],
        "explanation": self.redact(question.explanation)
        if question.explanation
        else None,
      }
    )

  def generate(self, request: GenerateQuizRequest) -> GenerateQuizResponse:
    chunks = self.context_source.get_chunks(
      request.handover_id, request.document_ids, self.max_chunks
    )
    chunks = [chunk for chunk in chunks if chunk.text.strip()]
    if not chunks:
      raise NoContextError("selected documents have no usable text")

    valid_ids = {chunk.chunk_id for chunk in chunks}
    prompt = build_quiz_prompt(chunks, request.num_questions, request.difficulty)

    collected: list[QuizQuestion] = []
    seen_prompts: set[str] = set()

    for attempt in range(1, self.max_attempts + 1):
      try:
        raw = self.llm(prompt)
        batch = parse_questions(raw, valid_ids)
      except (ValueError, json.JSONDecodeError):
        # Log the failure type only, never the content.
        logger.warning("quiz generation: unparseable LLM output (attempt %d)", attempt)
        continue

      for question in batch:
        key = question.prompt.lower()
        if key not in seen_prompts:
          seen_prompts.add(key)
          collected.append(self._redact_question(question))

      if len(collected) >= request.num_questions:
        break

    if not collected:
      raise QuizGenerationError("could not generate valid questions")

    questions = collected[: request.num_questions]
    logger.info(
      "quiz generation: requested=%d generated=%d",
      request.num_questions,
      len(questions),
    )
    return GenerateQuizResponse(
      questions=questions,
      requested=request.num_questions,
      generated=len(questions),
    )