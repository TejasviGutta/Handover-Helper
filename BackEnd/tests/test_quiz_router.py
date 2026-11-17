import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.auth import get_current_user
from app.quiz.context import SupabaseContextSource
from app.quiz.generator import QuizGenerator
from app.routers.quizzes import get_db, get_quiz_generator, router
from tests.fake_db import FakeDB

HANDOVER = "00000000-0000-0000-0000-0000000000aa"
DOC_A = "00000000-0000-0000-0000-00000000000a"
DOC_RAW = "00000000-0000-0000-0000-00000000000c"
OWNER = "user_123"

BODY = {"handover_id": HANDOVER, "document_ids": [DOC_A], "num_questions": 3}


class User:
  def __init__(self, id):
    self.id = id


def fake_llm(prompt):
  return json.dumps({
    "questions": [
      {"prompt": f"Sample question {i}?", "options": ["A", "B", "C", "D"], "correct": 1}
      for i in range(3)
    ]
  })


@pytest.fixture
def db():
  return FakeDB(
    documents=[
      {"id": DOC_A, "handover_id": HANDOVER, "status": "approved",
       "redacted_text": "Milestones live in the project timeline."},
      {"id": DOC_RAW, "handover_id": HANDOVER, "status": "uploaded", "redacted_text": None},
    ],
    handovers=[{"id": HANDOVER, "created_by": OWNER}],
  )


def make_client(db, user_id=OWNER, llm=fake_llm):
  app = FastAPI()
  app.include_router(router)
  app.dependency_overrides[get_current_user] = lambda: User(user_id)
  app.dependency_overrides[get_db] = lambda: db
  app.dependency_overrides[get_quiz_generator] = lambda: QuizGenerator(
    SupabaseContextSource(db), llm
  )
  return TestClient(app)


def test_generate_returns_frontend_shape(db):
  res = make_client(db).post("/quizzes/generate", json=BODY)
  assert res.status_code == 200
  body = res.json()
  assert body["generated"] == 3
  assert set(body["questions"][0]) >= {"prompt", "options", "correct"}


def test_other_user_gets_404(db):
  res = make_client(db, user_id="someone_else").post("/quizzes/generate", json=BODY)
  assert res.status_code == 404


def test_unredacted_document_is_rejected(db):
  res = make_client(db).post("/quizzes/generate", json={**BODY, "document_ids": [DOC_RAW]})
  assert res.status_code == 422


def test_bad_count_is_rejected(db):
  res = make_client(db).post("/quizzes/generate", json={**BODY, "num_questions": 7})
  assert res.status_code == 422


def test_llm_failure_returns_502(db):
  res = make_client(db, llm=lambda p: "oops").post("/quizzes/generate", json=BODY)
  assert res.status_code == 502


def test_requires_login(db):
  app = FastAPI()
  app.include_router(router)
  app.dependency_overrides[get_db] = lambda: db
  res = TestClient(app).post("/quizzes/generate", json=BODY)
  assert res.status_code in (401, 403)