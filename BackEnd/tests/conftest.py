"""Test setup.

app.config requires these settings at import time. Tests replace the database
and the current user with fakes, so these dummy values are never used to
connect anywhere. Never put real credentials here.
"""

import os

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_PUBLISHABLE_KEY", "test.publishable.key")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test.service.key")