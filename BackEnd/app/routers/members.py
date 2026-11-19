from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict, StringConstraints

from ..permissions import Handover, User, matches_employee
from ..schemas import Role
from ..supabase_client import supabase_admin

router = APIRouter(prefix="/handovers/{handover_id}", tags=["handover members"])

MemberRole = Literal["viewer", "contributor"]


class MemberInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: Annotated[
        str, StringConstraints(strip_whitespace=True, to_lower=True, min_length=3, max_length=320)
    ]
    role: MemberRole = "viewer"


class MemberOut(BaseModel):
    user_id: UUID
    email: str | None = None
    role: MemberRole
    added_at: datetime


def member_manager(handover: Handover, user: User) -> dict:
    if user.role == Role.admin or matches_employee(user, handover["departing_employee"]):
        return handover
    raise HTTPException(403, "Only the departing employee or an admin can manage members")


Manager = Annotated[dict, Depends(member_manager)]


@router.get("/members", response_model=list[MemberOut])
def list_members(handover: Handover):
    rows = (
        supabase_admin.table("handover_members")
        .select("user_id,role,added_at")
        .eq("handover_id", handover["id"])
        .order("added_at")
        .execute()
        .data
    )
    emails = {}
    if rows:
        profiles = (
            supabase_admin.table("profiles")
            .select("id,email")
            .in_("id", [r["user_id"] for r in rows])
            .execute()
            .data
        )
        emails = {p["id"]: p["email"] for p in profiles}
    return [MemberOut(**r, email=emails.get(r["user_id"])) for r in rows]


@router.put("/members", response_model=MemberOut)
def add_or_update_member(body: MemberInput, handover: Manager, user: User):
    profile = (
        supabase_admin.table("profiles")
        .select("id,email")
        .eq("email", body.email)
        .limit(1)
        .execute()
        .data
    )
    if not profile:
        raise HTTPException(404, "No user with that email. They need to sign up first.")
    row = (
        supabase_admin.table("handover_members")
        .upsert(
            {
                "handover_id": handover["id"],
                "user_id": profile[0]["id"],
                "role": body.role,
                "added_by": user.id,
            },
            on_conflict="handover_id,user_id",
        )
        .execute()
        .data[0]
    )
    return MemberOut(
        user_id=row["user_id"],
        email=profile[0]["email"],
        role=row["role"],
        added_at=row["added_at"],
    )


@router.delete("/members/{user_id}", status_code=204)
def remove_member(user_id: UUID, handover: Manager):
    (
        supabase_admin.table("handover_members")
        .delete()
        .eq("handover_id", handover["id"])
        .eq("user_id", str(user_id))
        .execute()
    )
    return Response(status_code=204)