from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.auth import get_current_user
from app.routers.quizzes import get_db, router
from tests.fake_db import FakeDB

HANDOVER = "00000000-0000-0000-0000-0000000000aa"
OTHER_HANDOVER = "00000000-0000-0000-0000-0000000000bb"
OWNER = "user_123"
OTHER_USER = "user_456"


class User:
  def __init__(self, id):
    self.id = id


def quiz(id_suffix, handover_id=HANDOVER, owner_id=OWNER, updated_at="2026-01-01T00:00:00+00:00",
         status="draft", title="Sample quiz", question_count=2):
  return {
    "id": f"00000000-0000-0000-0000-0000000001{id_suffix}",
    "handover_id": handover_id,
    "owner_id": owner_id,
    "title": title,
    "status": status,
    "difficulty": "balanced",
    "question_count": question_count,
    "created_at": "2026-01-01T00:00:00+00:00",
    "updated_at": updated_at,
  }


def make_db(quizzes):
  return FakeDB(
    handovers=[
      {"id": HANDOVER, "created_by": OWNER},
      {"id": OTHER_HANDOVER, "created_by": OTHER_USER},
    ],
    quizzes=quizzes,
  )


def client_for(db, user_id=OWNER):
  app = FastAPI()
  app.include_router(router)
  app.dependency_overrides[get_current_user] = lambda: User(user_id)
  app.dependency_overrides[get_db] = lambda: db
  return TestClient(app)


def test_lists_own_quizzes_newest_first():
  db = make_db([
    quiz("01", updated_at="2026-01-01T00:00:00+00:00", title="Older"),
    quiz("02", updated_at="2026-03-01T00:00:00+00:00", title="Newest", status="published"),
    quiz("03", updated_at="2026-02-01T00:00:00+00:00", title="Middle"),
  ])
  response = client_for(db).get("/quizzes", params={"handover_id": HANDOVER})

  assert response.status_code == 200
  data = response.json()
  assert [row["title"] for row in data] == ["Newest", "Middle", "Older"]
  assert set(data[0]) == {"id", "title", "status", "question_count", "updated_at"}
  assert data[0]["status"] == "published"
  assert data[0]["question_count"] == 2


def test_excludes_other_owners_and_other_handovers():
  db = make_db([
    quiz("01", title="Mine"),
    quiz("02", owner_id=OTHER_USER, title="Someone else's"),
    quiz("03", handover_id=OTHER_HANDOVER, title="Other handover"),
  ])
  response = client_for(db).get("/quizzes", params={"handover_id": HANDOVER})

  assert response.status_code == 200
  assert [row["title"] for row in response.json()] == ["Mine"]


def test_empty_list_when_no_quizzes():
  response = client_for(make_db([])).get("/quizzes", params={"handover_id": HANDOVER})

  assert response.status_code == 200
  assert response.json() == []


def test_handover_without_access_returns_404():
  db = make_db([quiz("01", handover_id=OTHER_HANDOVER)])
  response = client_for(db).get("/quizzes", params={"handover_id": OTHER_HANDOVER})

  assert response.status_code == 404


def test_unknown_handover_returns_404():
  response = client_for(make_db([])).get(
    "/quizzes", params={"handover_id": "00000000-0000-0000-0000-0000000000ff"}
  )

  assert response.status_code == 404


def test_missing_or_invalid_handover_id_returns_422():
  client = client_for(make_db([]))

  assert client.get("/quizzes").status_code == 422
  assert client.get("/quizzes", params={"handover_id": "not-a-uuid"}).status_code == 422
