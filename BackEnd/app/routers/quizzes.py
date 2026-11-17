"""HTTP endpoints for quizzes.

Register in main.py:
  from app.routers import quizzes
  app.include_router(quizzes.router)

Endpoints:
  POST /quizzes/generate   generate questions (not saved)
  POST /quizzes            save a new quiz
  GET  /quizzes            list the user's quizzes for a handover
  GET  /quizzes/{quiz_id}  load a quiz for editing
  PUT  /quizzes/{quiz_id}  replace a quiz (title, settings, questions)
"""

import logging
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import CurrentUser, get_current_user
from app.quiz.context import (
  DocumentAccessError,
  SupabaseContextSource,
  user_can_access_handover,
)
from app.quiz.generator import NoContextError, QuizGenerationError, QuizGenerator
from app.quiz.repository import QuizRepository
from app.quiz.schemas import (
  GenerateQuizRequest,
  GenerateQuizResponse,
  QuizCreate,
  QuizOut,
  QuizSave,
  QuizSummary,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/quizzes", tags=["quizzes"])


def get_db() -> Any:
  # Imported lazily so tests can override this without real credentials.
  from app.supabase_client import supabase_admin

  return supabase_admin


def get_quiz_generator(db: Any = Depends(get_db)) -> QuizGenerator:
  from app.quiz.llm_client import OllamaQuizLLM

  # Quiz-specific LLM client (model, context size and JSON output are tuned
  # for quizzes); the shared app.ai.llm module is left unchanged.
  # TODO: pass the team's PII redaction function as `redact=` once available,
  # so generated questions are checked again before being returned.
  return QuizGenerator(context_source=SupabaseContextSource(db), llm=OllamaQuizLLM())


def get_quiz_repository(db: Any = Depends(get_db)) -> QuizRepository:
  return QuizRepository(db)


@router.post("/generate", response_model=GenerateQuizResponse)
def generate_quiz(
  request: GenerateQuizRequest,
  user: CurrentUser = Depends(get_current_user),
  db: Any = Depends(get_db),
  generator: QuizGenerator = Depends(get_quiz_generator),
) -> GenerateQuizResponse:
  # The service role client bypasses RLS, so check access here.
  if not user_can_access_handover(db, request.handover_id, user.id):
    # 404 instead of 403 so callers can't probe which handovers exist.
    raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Handover not found.")

  try:
    return generator.generate(request)
  except DocumentAccessError:
    raise HTTPException(
      422,
      detail="Some selected documents are unavailable or not redacted yet.",
    )
  except NoContextError:
    raise HTTPException(
      422,
      detail="The selected documents have no text to build questions from.",
    )
  except QuizGenerationError:
    raise HTTPException(
      status.HTTP_502_BAD_GATEWAY,
      detail="Could not generate questions. Please try again.",
    )
  except Exception as exc:
    # Log the type only; exception messages may contain document text.
    logger.error("quiz generation failed unexpectedly: %s", type(exc).__name__)
    raise HTTPException(
      status.HTTP_500_INTERNAL_SERVER_ERROR,
      detail="Something went wrong while generating the quiz.",
    )


# ---------- Saving and loading quizzes ----------

def _quiz_not_found() -> HTTPException:
  return HTTPException(status.HTTP_404_NOT_FOUND, detail="Quiz not found.")


def _bad_documents() -> HTTPException:
  return HTTPException(422, detail="Some selected documents do not belong to this handover.")


def _load_accessible_quiz(repo: QuizRepository, db: Any, quiz_id: UUID, user_id: str) -> dict:
  """Return {id, handover_id, owner_id} if the user may access the quiz, else 404.

  TEMPORARY: owner or handover creator only. Replace with the team's shared
  access-control helper once it exists.
  """
  info = repo.get_access_info(quiz_id)
  if info is None:
    raise _quiz_not_found()
  if str(info["owner_id"]) == str(user_id):
    return info
  if user_can_access_handover(db, info["handover_id"], user_id):
    return info
  raise _quiz_not_found()


def _save_or_500(repo: QuizRepository, **kwargs) -> UUID:
  try:
    return repo.save(**kwargs)
  except Exception as exc:
    # Log the type only; messages may contain quiz content.
    logger.error("quiz save failed: %s", type(exc).__name__)
    raise HTTPException(
      status.HTTP_500_INTERNAL_SERVER_ERROR,
      detail="The quiz could not be saved. Please try again.",
    )


@router.post("", response_model=QuizOut, status_code=status.HTTP_201_CREATED)
def create_quiz(
  body: QuizCreate,
  user: CurrentUser = Depends(get_current_user),
  db: Any = Depends(get_db),
  repo: QuizRepository = Depends(get_quiz_repository),
) -> QuizOut:
  if not user_can_access_handover(db, body.handover_id, user.id):
    raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Handover not found.")
  if not repo.documents_belong_to_handover(body.handover_id, body.document_ids):
    raise _bad_documents()

  quiz_id = _save_or_500(
    repo, quiz_id=None, handover_id=body.handover_id, owner_id=user.id, data=body
  )
  logger.info("quiz created: questions=%d", len(body.questions))
  return repo.get(quiz_id)


@router.get("", response_model=list[QuizSummary])
def list_quizzes(
  handover_id: UUID,
  user: CurrentUser = Depends(get_current_user),
  db: Any = Depends(get_db),
  repo: QuizRepository = Depends(get_quiz_repository),
) -> list[QuizSummary]:
  if not user_can_access_handover(db, handover_id, user.id):
    raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Handover not found.")
  quizzes = repo.list_for_owner(handover_id, user.id)
  logger.info("quizzes listed: count=%d", len(quizzes))
  return quizzes


@router.get("/{quiz_id}", response_model=QuizOut)
def get_quiz(
  quiz_id: UUID,
  user: CurrentUser = Depends(get_current_user),
  db: Any = Depends(get_db),
  repo: QuizRepository = Depends(get_quiz_repository),
) -> QuizOut:
  _load_accessible_quiz(repo, db, quiz_id, user.id)
  quiz = repo.get(quiz_id)
  if quiz is None:
    raise _quiz_not_found()
  return quiz


@router.put("/{quiz_id}", response_model=QuizOut)
def update_quiz(
  quiz_id: UUID,
  body: QuizSave,
  user: CurrentUser = Depends(get_current_user),
  db: Any = Depends(get_db),
  repo: QuizRepository = Depends(get_quiz_repository),
) -> QuizOut:
  info = _load_accessible_quiz(repo, db, quiz_id, user.id)
  handover_id = info["handover_id"]
  if not repo.documents_belong_to_handover(handover_id, body.document_ids):
    raise _bad_documents()

  _save_or_500(
    repo, quiz_id=quiz_id, handover_id=handover_id, owner_id=info["owner_id"], data=body
  )
  logger.info("quiz updated: questions=%d", len(body.questions))
  return repo.get(quiz_id)