from fastapi import APIRouter, Depends, HTTPException

from ..auth import get_current_user, require_roles
from ..schemas import CurrentUser, ProfileOut, Role, RoleUpdate
from ..supabase_client import supabase_admin

router = APIRouter(tags=["users"])


@router.get("/me", response_model=CurrentUser)
def me(user: CurrentUser = Depends(get_current_user)):
    """Any signed-in user can see who they are and their role."""
    return user


@router.get("/users", response_model=list[ProfileOut])
def list_users(_: CurrentUser = Depends(require_roles(Role.admin))):
    """Admins only: list every user."""
    return supabase_admin.table("profiles").select("*").execute().data


@router.patch("/users/{user_id}/role", response_model=ProfileOut)
def change_role(
    user_id: str,
    body: RoleUpdate,
    admin: CurrentUser = Depends(require_roles(Role.admin)),
):
    """Admins only: change someone's role."""
    if user_id == admin.id:
        raise HTTPException(400, "You can't change your own role")
    rows = (
        supabase_admin.table("profiles")
        .update({"role": body.role.value})
        .eq("id", user_id)
        .execute()
        .data
    )
    if not rows:
        raise HTTPException(404, "User not found")
    return rows[0]