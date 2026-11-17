#Import tools for handling API authentication
from fastapi import Depends, HTTPException
#Import tools for recieving login tokens
from fastapi.security import (
    HTTPBearer,
    HTTPAuthorizationCredentials,
)

#Import existing supabase client
from app.supabase_client import supabase

#Tell FastAPI to expect a bearer token
security = HTTPBearer(auto_error=False)

#Check which emplyee is making the request
def get_current_user(
        credentials: HTTPAuthorizationCredentials | None = Depends(security)
    ):
    #Reject requests withput a login token.
    if credentials is None:
        raise HTTPException(
            status_code=401,
            detail="Not Authenticated"
        )
    try:
        #Ask Supabase to validate the User's token
        response = supabase.auth.get_user(
            credentials.credentials
            )

        user = response.user

        if user is None:
            raise ValueError("Invalid user")
        return user

    except Exception:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token"
        )    