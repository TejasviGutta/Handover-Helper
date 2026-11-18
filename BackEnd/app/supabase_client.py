from supabase import create_client

from .config import settings

# Uses the secret key, so it can read and change any row.
# It must only ever be used inside backend code.
supabase_admin = create_client(
    settings.supabase_url, settings.supabase_service_role_key
)