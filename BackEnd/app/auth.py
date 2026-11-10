# Checks that a request comes from a signed-in user.
#
# When someone signs in on the frontend, Supabase gives their browser a
# token: a long code that proves who they are. The upload page sends that
# token with every upload. Here we ask Supabase whether the token is real
# and still valid, and who it belongs to.

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.files.storage import get_client

# Reads the token from the request's "Authorization: Bearer <token>" header.
# auto_error=False lets us send our own plain-English message if it's missing.
bearer = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
):
    """Returns the signed-in user, or stops the request with a 401 error.

    401 means "not signed in". The request goes no further.
    """
    if credentials is None:
        raise HTTPException(status_code=401, detail="Please sign in to upload files.")

    # Ask Supabase who this token belongs to.
    # A fake, changed, or expired token fails here.
    try:
        response = get_client().auth.get_user(credentials.credentials)
    except Exception:
        raise HTTPException(
            status_code=401, detail="Your sign-in has expired. Please sign in again."
        )

    if response is None or response.user is None:
        raise HTTPException(
            status_code=401, detail="Your sign-in has expired. Please sign in again."
        )

    return response.user