from datetime import date, datetime, timezone
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from postgrest.exceptions import APIError
from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from ..auth import get_current_user
from ..schemas import CurrentUser, Role
from ..supabase_client import supabase_admin

router = APIRouter(prefix="/handovers/{handover_id}", tags=["handover workflow"])
directory_router = APIRouter(tags=["handover workflow"])
PARTICIPANT_COLUMNS = "id,departing_employee,incoming_employee"

User = Annotated[CurrentUser, Depends(get_current_user)]
GuideStatus = Literal["draft", "in_review", "changes_requested", "approved"]
ReviewOutcome = Literal["changes_requested", "approved"]


class RequestBody(BaseModel):
    model_config = ConfigDict(extra="forbid")


class DecisionInput(RequestBody):
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    decision_date: date
    details: Annotated[str, StringConstraints(strip_whitespace=True, max_length=10000)] = ""


class Decision(DecisionInput):
    id: UUID
    handover_id: UUID
    decided_by: UUID
    created_at: datetime


class GuideDraft(RequestBody):
    content: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100000)]
    revision: int = Field(default=0, ge=0)


class GuideRevision(RequestBody):
    revision: int = Field(ge=1)


class GuideReview(GuideRevision):
    outcome: ReviewOutcome
    comment: Annotated[str, StringConstraints(strip_whitespace=True, max_length=10000)] = ""


class Guide(BaseModel):
    handover_id: UUID
    content: str
    status: GuideStatus
    revision: int
    submitted_by: UUID | None
    reviewed_by: UUID | None
    review_comment: str | None
    reviewed_at: datetime | None


class HandoverSummary(BaseModel):
    id: UUID
    project_name: str
    can_write: bool
    can_edit: bool
    can_review: bool
    can_approve: bool


def matches_employee(user: CurrentUser, employee_email: str | None) -> bool:
    if not (user.email_verified and user.email and employee_email):
        return False
    return user.email.strip().lower() == employee_email.strip().lower()


@directory_router.get("/handovers", response_model=list[HandoverSummary])
def list_workflow_handovers(user: User):
    admin = user.role == Role.admin
    can_write = user.role != Role.viewer
    handovers = []
    page_size = 200
    offset = 0
    while True:
        rows = (
            supabase_admin.table("handovers")
            .select(f"project_name,{PARTICIPANT_COLUMNS}")
            .order("project_name")
            .order("id")
            .range(offset, offset + page_size - 1)
            .execute()
            .data
        )
        for row in rows:
            departing = matches_employee(user, row["departing_employee"])
            incoming = matches_employee(user, row["incoming_employee"])
            if admin or departing or incoming:
                handovers.append(HandoverSummary(
                    id=row["id"],
                    project_name=row["project_name"] or "Untitled handover",
                    can_write=can_write,
                    can_edit=can_write and (admin or departing),
                    can_review=can_write and (admin or incoming),
                    can_approve=can_write and departing,
                ))
        if len(rows) < page_size:
            return handovers
        offset += page_size


def handover_access(handover_id: UUID, user: User) -> dict:
    rows = (
        supabase_admin.table("handovers")
        .select(PARTICIPANT_COLUMNS)
        .eq("id", str(handover_id))
        .limit(1)
        .execute()
        .data
    )
    if rows:
        handover = rows[0]
        if (
            user.role == Role.admin
            or matches_employee(user, handover["departing_employee"])
            or matches_employee(user, handover["incoming_employee"])
        ):
            return handover
    raise HTTPException(404, "Handover not found")


Handover = Annotated[dict, Depends(handover_access)]


@router.get("/decisions", response_model=list[Decision])
def list_decisions(
    handover: Handover,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
):
    return (
        supabase_admin.table("decisions")
        .select("*")
        .eq("handover_id", handover["id"])
        .order("decision_date", desc=True)
        .order("created_at", desc=True)
        .order("id")
        .range(offset, offset + limit - 1)
        .execute()
        .data
    )


@router.post("/decisions", response_model=Decision, status_code=201)
def record_decision(body: DecisionInput, handover: Handover, user: User):
    if user.role == Role.viewer:
        raise HTTPException(403, "Viewers cannot record decisions")
    return (
        supabase_admin.table("decisions")
        .insert({
            **body.model_dump(mode="json"),
            "handover_id": handover["id"],
            "decided_by": user.id,
        })
        .execute()
        .data[0]
    )


def require_guide_editor(handover: dict, user: CurrentUser) -> None:
    if user.role == Role.viewer or (
        user.role != Role.admin and not matches_employee(user, handover["departing_employee"])
    ):
        raise HTTPException(403, "Only the outgoing owner or an admin can edit or submit")


def get_saved_guide(handover_id: str) -> dict:
    rows = (
        supabase_admin.table("handover_guides")
        .select("*")
        .eq("handover_id", handover_id)
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        raise HTTPException(404, "Guide not found")
    return rows[0]


def update_guide(
    handover_id: str, revision: int, allowed_statuses: list[GuideStatus], changes: dict
) -> dict:
    rows = (
        supabase_admin.table("handover_guides")
        .update({**changes, "revision": revision + 1})
        .eq("handover_id", handover_id)
        .eq("revision", revision)
        .in_("status", allowed_statuses)
        .execute()
        .data
    )
    if not rows:
        raise HTTPException(409, "Guide revision or status changed. Reload the guide and try again.")
    return rows[0]


@router.get("/guide", response_model=Guide)
def read_guide(handover: Handover):
    return get_saved_guide(handover["id"])


@router.put("/guide", response_model=Guide)
def save_draft(body: GuideDraft, handover: Handover, user: User):
    require_guide_editor(handover, user)
    if body.revision == 0:
        try:
            return (
                supabase_admin.table("handover_guides")
                .insert({"handover_id": handover["id"], "content": body.content})
                .execute()
                .data[0]
            )
        except APIError as error:
            if error.code == "23505":
                raise HTTPException(409, "Guide already exists. Reload the guide and try again.") from error
            raise
    return update_guide(
        handover["id"], body.revision, ["draft", "changes_requested"], {"content": body.content}
    )


@router.post("/guide/submit", response_model=Guide)
def submit_guide(body: GuideRevision, handover: Handover, user: User):
    require_guide_editor(handover, user)
    return update_guide(
        handover["id"],
        body.revision,
        ["draft", "changes_requested"],
        {
            "status": "in_review",
            "submitted_by": user.id,
            "reviewed_by": None,
            "review_comment": None,
            "reviewed_at": None,
        },
    )


@router.post("/guide/review", response_model=Guide)
def review_guide(body: GuideReview, handover: Handover, user: User):
    if body.outcome == "approved":
        if user.role == Role.viewer or not matches_employee(user, handover["departing_employee"]):
            raise HTTPException(403, "Only the departing employee can approve the guide")
    elif user.role == Role.viewer or not (
        user.role == Role.admin or matches_employee(user, handover["incoming_employee"])
    ):
        raise HTTPException(403, "You cannot request changes for this guide")
    if body.outcome == "changes_requested" and not body.comment:
        raise HTTPException(422, "A comment is required when requesting changes")
    guide = get_saved_guide(handover["id"])
    if guide["revision"] != body.revision or guide["status"] != "in_review":
        raise HTTPException(409, "Guide revision or status changed. Reload the guide and try again.")
    if body.outcome == "changes_requested" and guide["submitted_by"] == user.id:
        raise HTTPException(403, "The submitter cannot review their own guide")
    return update_guide(
        handover["id"],
        body.revision,
        ["in_review"],
        {
            "status": body.outcome,
            "reviewed_by": user.id,
            "review_comment": body.comment or None,
            "reviewed_at": datetime.now(timezone.utc).isoformat(),
        },
    )
