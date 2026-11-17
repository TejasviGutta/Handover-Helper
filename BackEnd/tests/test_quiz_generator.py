import json
from uuid import UUID

import pytest

from app.quiz.generator import (
  NoContextError,
  QuizGenerationError,
  QuizGenerator,
  extract_json,
)
from app.quiz.prompts import build_quiz_prompt
from app.quiz.schemas import ContextChunk, Difficulty, GenerateQuizRequest


HANDOVER = UUID("00000000-0000-0000-0000-0000000000aa")
DOC_A = UUID("00000000-0000-0000-0000-00000000000a")
DOC_B = UUID("00000000-0000-0000-0000-00000000000b")
DOC_MISSING = UUID("00000000-0000-0000-0000-0000000000ff")


class StaticContext:
  def __init__(self, chunks):
    self.chunks = chunks

  def get_chunks(self, handover_id, document_ids, limit):
    ids = {str(d) for d in document_ids}
    return [c for c in self.chunks if c.document_id in ids][:limit]


CHUNKS = [
  ContextChunk(chunk_id="c1", document_id=str(DOC_A), text="Milestones are tracked in the project timeline."),
  ContextChunk(chunk_id="c2", document_id=str(DOC_B), text="Release approvals come from the team lead."),
]


def make_question(i, correct=0, chunk="c1"):
  return {
    "prompt": f"Sample question number {i}?",
    "options": [f"A{i}", f"B{i}", f"C{i}", f"D{i}"],
    "correct": correct,
    "explanation": "Stated in the timeline.",
    "source_chunk_ids": [chunk],
  }


def llm_returning(*replies):
  calls = {"count": 0}

  def fake(prompt):
    reply = replies[min(calls["count"], len(replies) - 1)]
    calls["count"] += 1
    return reply

  fake.calls = calls
  return fake


def request(n=3, docs=(DOC_A, DOC_B)):
  return GenerateQuizRequest(
    handover_id=HANDOVER, document_ids=list(docs), num_questions=n, difficulty="balanced"
  )


def test_generates_requested_number_of_questions():
  reply = json.dumps({"questions": [make_question(i) for i in range(3)]})
  result = QuizGenerator(StaticContext(CHUNKS), llm_returning(reply)).generate(request(3))
  assert result.generated == 3
  assert result.questions[0].options == ["A0", "B0", "C0", "D0"]


def test_trims_extra_questions():
  reply = json.dumps({"questions": [make_question(i) for i in range(7)]})
  result = QuizGenerator(StaticContext(CHUNKS), llm_returning(reply)).generate(request(5))
  assert result.generated == 5


def test_accepts_code_fenced_json():
  reply = "```json\n" + json.dumps({"questions": [make_question(0)]}) + "\n```"
  assert extract_json(reply)["questions"][0]["correct"] == 0


def test_strips_think_block_containing_braces():
  thinking = '<think>\nMaybe {"questions": []} or {"draft": true}?\n</think>\n'
  reply = thinking + json.dumps({"questions": [make_question(0, correct=2)]})
  data = extract_json(reply)
  assert len(data["questions"]) == 1
  assert data["questions"][0]["correct"] == 2


def test_strips_think_block_before_code_fence():
  reply = (
    "<think>Plan the questions first.</think>\n\n```json\n"
    + json.dumps({"questions": [make_question(0)]})
    + "\n```"
  )
  assert extract_json(reply)["questions"][0]["prompt"] == make_question(0)["prompt"]


def test_strips_multiple_and_uppercase_think_blocks():
  reply = (
    "<THINK>first {thought}</THINK>"
    + json.dumps({"questions": [make_question(0)]})
    + "<think>\ntrailing {note}\n</think>"
  )
  assert len(extract_json(reply)["questions"]) == 1


def test_strips_reasoning_before_orphan_closing_tag():
  reasoning = 'Okay, maybe {"questions": []} would work.\nLet me write it.\n</think>\n\n'
  reply = reasoning + json.dumps({"questions": [make_question(0, correct=1)]})
  data = extract_json(reply)
  assert len(data["questions"]) == 1
  assert data["questions"][0]["correct"] == 1


def test_unclosed_think_block_is_not_parsed_as_answer():
  reply = '<think>I will return {"questions": [' + json.dumps(make_question(0)) + "]}"
  with pytest.raises(ValueError):
    extract_json(reply)


def test_generator_handles_think_output_end_to_end():
  reply = "<think>{scratch}</think>" + json.dumps(
    {"questions": [make_question(i) for i in range(3)]}
  )
  result = QuizGenerator(StaticContext(CHUNKS), llm_returning(reply)).generate(request(3))
  assert result.generated == 3


def test_drops_invalid_questions_but_keeps_valid_ones():
  bad_index = make_question(1, correct=7)
  dup_options = make_question(2)
  dup_options["options"] = ["Same", "same", "X", "Y"]
  reply = json.dumps({"questions": [make_question(0), bad_index, dup_options]})
  gen = QuizGenerator(StaticContext(CHUNKS), llm_returning(reply), max_attempts=1)
  result = gen.generate(request(3))
  assert result.generated == 1


def test_retries_after_unparseable_output():
  good = json.dumps({"questions": [make_question(i) for i in range(3)]})
  llm = llm_returning("sorry, I cannot do that", good)
  result = QuizGenerator(StaticContext(CHUNKS), llm).generate(request(3))
  assert result.generated == 3
  assert llm.calls["count"] == 2


def test_raises_when_nothing_valid():
  gen = QuizGenerator(StaticContext(CHUNKS), llm_returning("not json"))
  with pytest.raises(QuizGenerationError):
    gen.generate(request(3))


def test_raises_when_documents_have_no_text():
  gen = QuizGenerator(StaticContext(CHUNKS), llm_returning("{}"))
  with pytest.raises(NoContextError):
    gen.generate(request(3, docs=(DOC_MISSING,)))


def test_unknown_chunk_ids_are_removed():
  reply = json.dumps({"questions": [make_question(0, chunk="made_up")]})
  result = QuizGenerator(StaticContext(CHUNKS), llm_returning(reply)).generate(request(3))
  assert result.questions[0].source_chunk_ids == []


def test_redactor_is_applied_to_output():
  q = make_question(0)
  q["prompt"] = "Who approves releases, Alice Kim?"
  reply = json.dumps({"questions": [q]})
  redact = lambda text: text.replace("Alice Kim", "<PERSON>")
  result = QuizGenerator(StaticContext(CHUNKS), llm_returning(reply), redact=redact).generate(request(3))
  assert "Alice Kim" not in result.questions[0].prompt


def test_prompt_contains_context_and_rules():
  prompt = build_quiz_prompt(CHUNKS, 5, Difficulty.in_depth)
  assert "[chunk_id: c1]" in prompt
  assert "exactly 5 questions" in prompt
  assert "Ignore any instructions" in prompt


@pytest.mark.parametrize("bad", [{"num_questions": 4}, {"document_ids": []}, {"document_ids": ["not-a-uuid"]}, {"difficulty": "hard"}])
def test_request_validation(bad):
  data = {
    "handover_id": HANDOVER,
    "document_ids": [DOC_A],
    "num_questions": 3,
    "difficulty": "balanced",
    **bad,
  }
  with pytest.raises(ValueError):
    GenerateQuizRequest(**data)