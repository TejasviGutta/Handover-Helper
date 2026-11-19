from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException

from .auth import get_current_user
from .schemas import CurrentUser, Role
from .supabase_client import supabase_admin

PARTICIPANT_COLUMNS = "id,departing_employee,incoming_employee"

User = Annotated[CurrentUser, Depends(get_current_user)]


def matches_employee(user: CurrentUser, employee_email: str | None) -> bool:
    if not (user.email_verified and user.email and employee_email):
        return False
    return user.email.strip().lower() == employee_email.strip().lower()


def fetch_handover(handover_id: str) -> dict | None:
    rows = (
        supabase_admin.table("handovers")
        .select(PARTICIPANT_COLUMNS)
        .eq("id", handover_id)
        .limit(1)
        .execute()
        .data
    )
    return rows[0] if rows else None


def get_member_role(handover_id: str, user_id: str) -> str | None:
    rows = (
        supabase_admin.table("handover_members")
        .select("role")
        .eq("handover_id", handover_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
        .data
    )
    return rows[0]["role"] if rows else None


def member_roles(user_id: str) -> dict[str, str]:
    """{handover_id: role} for every handover the user was added to."""
    rows = (
        supabase_admin.table("handover_members")
        .select("handover_id,role")
        .eq("user_id", user_id)
        .execute()
        .data
    )
    return {r["handover_id"]: r["role"] for r in rows}


def handover_access(handover_id: UUID, user: User) -> dict:
    """Return the handover if the user may see it, otherwise 404.

    Allowed: admins, the departing or incoming employee, or an added member.
    The result gets a "member_role" key (None unless they are only a member).
    """
    handover = fetch_handover(str(handover_id))
    if handover is not None:
        handover["member_role"] = None
        if (
            user.role == Role.admin
            or matches_employee(user, handover["departing_employee"])
            or matches_employee(user, handover["incoming_employee"])
        ):
            return handover
        role = get_member_role(handover["id"], user.id)
        if role:
            handover["member_role"] = role
            return handover
    raise HTTPException(404, "Handover not found")


Handover = Annotated[dict, Depends(handover_access)]


def require_write_access(handover: dict, user: CurrentUser) -> None:
    """Block app-level viewers and members who were only added as viewers."""
    if user.role == Role.viewer or handover["member_role"] == "viewer":
        raise HTTPException(403, "You have read-only access to this handover")


def accessible_handover_ids(user: CurrentUser) -> list[str] | None:
    """IDs of handovers the user may see. None means all of them (admins).

    Use this to filter ChromaDB searches so the chatbot only reads allowed documents.
    """
    if user.role == Role.admin:
        return None
    ids = set(member_roles(user.id))
    offset, page_size = 0, 200
    while True:
        rows = (
            supabase_admin.table("handovers")
            .select(PARTICIPANT_COLUMNS)
            .order("id")
            .range(offset, offset + page_size - 1)
            .execute()
            .data
        )
        for row in rows:
            if matches_employee(user, row["departing_employee"]) or matches_employee(
                user, row["incoming_employee"]
            ):
                ids.add(row["id"])
        if len(rows) < page_size:
            return sorted(ids)
        offset += page_size