import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import settings
from .schemas import CurrentUser, Role
from .supabase_client import supabase_admin

bearer = HTTPBearer(auto_error=False)


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> CurrentUser:
    """Check the login token sent by the frontend and return who the user is."""
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not signed in")

    # Ask Supabase whether this token is valid
    resp = httpx.get(
        f"{settings.supabase_url}/auth/v1/user",
        headers={
            "Authorization": f"Bearer {creds.credentials}",
            "apikey": settings.supabase_publishable_key,
        },
        timeout=10,
    )
    if resp.status_code != 200:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
    auth_user = resp.json()

    # Look up the user's role in the profiles table
    rows = (
        supabase_admin.table("profiles")
        .select("role")
        .eq("id", auth_user["id"])
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No profile for this user")

    return CurrentUser(
        id=auth_user["id"], email=auth_user.get("email"), role=rows[0]["role"]
    )


def require_roles(*allowed: Role):
    """Use as a dependency to restrict an endpoint to certain roles."""

    def checker(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if user.role not in allowed:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Not allowed for your role")
        return user

    return checker