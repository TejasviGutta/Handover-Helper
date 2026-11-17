import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.auth import get_current_user
from app.quiz.schemas import QuizSave
from app.routers.quizzes import get_db, router
from tests.fake_db import FakeDB

HANDOVER = "00000000-0000-0000-0000-0000000000aa"
OTHER_HANDOVER = "00000000-0000-0000-0000-0000000000bb"
DOC_A = "00000000-0000-0000-0000-00000000000a"
DOC_OTHER = "00000000-0000-0000-0000-00000000000d"
OWNER = "user_123"


class User:
  def __init__(self, id):
    self.id = id


def question(n, correct=0):
  return {"prompt": f"Sample question {n}?", "options": [f"A{n}", f"B{n}", f"C{n}", f"D{n}"],
          "correct": correct}


def body(**overrides):
  data = {
    "handover_id": HANDOVER,
    "title": "Sample quiz",
    "status": "draft",
    "difficulty": "balanced",
    "document_ids": [DOC_A],
    "questions": [question(1), question(2, correct=3)],
  }
  data.update(overrides)
  return data


@pytest.fixture
def db():
  return FakeDB(
    documents=[
      {"id": DOC_A, "handover_id": HANDOVER},
      {"id": DOC_OTHER, "handover_id": OTHER_HANDOVER},
    ],
    handovers=[
      {"id": HANDOVER, "created_by": OWNER},
      {"id": OTHER_HANDOVER, "created_by": "someone_else"},
    ],
  )


def client_for(db, user_id=OWNER):
  app = FastAPI()
  app.include_router(router)
  app.dependency_overrides[get_current_user] = lambda: User(user_id)
  app.dependency_overrides[get_db] = lambda: db
  return TestClient(app)


def create(db, **overrides):
  return client_for(db).post("/quizzes", json=body(**overrides))


# ---------- create ----------

def test_create_returns_saved_quiz(db):
  res = create(db)
  assert res.status_code == 201
  quiz = res.json()
  assert quiz["title"] == "Sample quiz"
  assert quiz["question_count"] == 2
  assert quiz["document_ids"] == [DOC_A]
  assert [q["correct"] for q in quiz["questions"]] == [0, 3]
  assert [q["position"] for q in quiz["questions"]] == [0, 1]


def test_owner_comes_from_login_not_request(db):
  create(db)
  assert db.tables["quizzes"][0]["owner_id"] == OWNER


def test_create_in_someone_elses_handover_is_404(db):
  assert create(db, handover_id=OTHER_HANDOVER).status_code == 404
  assert db.tables["quizzes"] == []


def test_document_from_other_handover_is_rejected(db):
  assert create(db, document_ids=[DOC_OTHER]).status_code == 422
  assert db.tables["quizzes"] == []


def test_empty_draft_can_be_saved(db):
  res = create(db, questions=[], document_ids=[])
  assert res.status_code == 201
  assert res.json()["question_count"] == 0


def test_incomplete_draft_question_can_be_saved(db):
  res = create(db, questions=[{"prompt": "", "options": ["", "", "", ""], "correct": 0}])
  assert res.status_code == 201


def test_published_quiz_must_be_complete(db):
  incomplete = {"prompt": "", "options": ["", "", "", ""], "correct": 0}
  assert create(db, status="published", questions=[incomplete]).status_code == 422
  assert create(db, status="published", questions=[]).status_code == 422
  assert create(db, status="published").status_code == 201


def test_database_error_returns_500_without_details(db):
  db.fail_rpc = True
  res = create(db)
  assert res.status_code == 500
  assert "simulated" not in res.text


# ---------- get ----------

def test_owner_can_load_quiz(db):
  quiz_id = create(db).json()["id"]
  res = client_for(db).get(f"/quizzes/{quiz_id}")
  assert res.status_code == 200
  assert res.json()["questions"][1]["prompt"] == "Sample question 2?"


def test_other_user_cannot_load_quiz(db):
  quiz_id = create(db).json()["id"]
  assert client_for(db, "someone_else").get(f"/quizzes/{quiz_id}").status_code == 404


def test_missing_quiz_is_404(db):
  res = client_for(db).get("/quizzes/00000000-0000-0000-0000-000000000999")
  assert res.status_code == 404


# ---------- update ----------

def update_body(**overrides):
  data = body(**overrides)
  data.pop("handover_id")
  return data


def test_update_replaces_questions_and_settings(db):
  quiz_id = create(db).json()["id"]
  res = client_for(db).put(
    f"/quizzes/{quiz_id}",
    json=update_body(title="Renamed", difficulty="in_depth", document_ids=[],
                     questions=[question(9, correct=2)]),
  )
  assert res.status_code == 200
  quiz = res.json()
  assert quiz["title"] == "Renamed"
  assert quiz["difficulty"] == "in_depth"
  assert quiz["document_ids"] == []
  assert [q["prompt"] for q in quiz["questions"]] == ["Sample question 9?"]
  assert len(db.tables["quiz_questions"]) == 1


def test_update_cannot_move_quiz_to_another_handover(db):
  quiz_id = create(db).json()["id"]
  data = update_body()
  data["handover_id"] = OTHER_HANDOVER
  assert client_for(db).put(f"/quizzes/{quiz_id}", json=data).status_code == 422


def test_other_user_cannot_update(db):
  quiz_id = create(db).json()["id"]
  res = client_for(db, "someone_else").put(f"/quizzes/{quiz_id}", json=update_body(title="Hacked"))
  assert res.status_code == 404
  assert db.tables["quizzes"][0]["title"] == "Sample quiz"


def test_update_rejects_document_from_other_handover(db):
  quiz_id = create(db).json()["id"]
  res = client_for(db).put(f"/quizzes/{quiz_id}", json=update_body(document_ids=[DOC_OTHER]))
  assert res.status_code == 422


# ---------- schema ----------

@pytest.mark.parametrize("bad", [
  {"title": "   "},
  {"status": "archived"},
  {"questions": [{"prompt": "x", "options": ["a", "b"], "correct": 0}]},
  {"questions": [{"prompt": "x", "options": ["a", "b", "c", "d"], "correct": 4}]},
])
def test_invalid_bodies_are_rejected(bad):
  data = update_body(**bad)
  with pytest.raises(ValidationError):
    QuizSave(**data)