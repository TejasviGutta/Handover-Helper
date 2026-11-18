# Hands out short-lived download links for files in the private bucket.
#
# The bucket is private, so files can't be opened with a normal link.
# Instead, after checking the person is allowed, we ask Supabase for a
# "signed" link that stops working after a few minutes. If the link gets
# shared or leaked, it's useless by then.

from app.files.storage import BUCKET, get_client

# How long a download link works, in seconds.
LINK_LIFETIME_SECONDS = 120

# Roles that can open any file.
FULL_ACCESS_ROLES = {"admin", "manager"}


class FileNotAvailable(Exception):
    """Raised when a file doesn't exist OR the person isn't allowed to see it.

    Both cases get the same message on purpose. If "not allowed" looked
    different from "doesn't exist", someone could guess file IDs to find
    out which files exist.
    """


def get_document(document_id):
    """Looks up one file's record. Returns None if there isn't one."""
    result = (
        get_client()
        .table("documents")
        .select("id, storage_path, original_name, handover_id, uploaded_by, status")
        .eq("id", str(document_id))
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def get_role(user):
    """Looks up the user's role (like "admin") from the profiles table."""
    result = (
        get_client()
        .table("profiles")
        .select("role")
        .eq("id", str(user.id))
        .limit(1)
        .execute()
    )
    return result.data[0]["role"] if result.data else None


def is_on_handover(user, handover_id):
    """True if the user is the departing or incoming employee on this handover.

    The handovers table stores those people by email.
    """
    if not handover_id or not getattr(user, "email", None):
        return False
    result = (
        get_client()
        .table("handovers")
        .select("departing_employee, incoming_employee")
        .eq("id", str(handover_id))
        .limit(1)
        .execute()
    )
    if not result.data:
        return False
    handover = result.data[0]
    email = user.email.strip().lower()
    people = [handover.get("departing_employee"), handover.get("incoming_employee")]
    return any(person and person.strip().lower() == email for person in people)


def access_reason(user, document):
    """Returns why this user can open this file, or None if they can't.

    The reason goes in the audit log, so we know which rule let them in.
    """
    if document.get("uploaded_by") and str(document["uploaded_by"]) == str(user.id):
        return "uploader"
    # The login check already looked up the role. Use it if it's there,
    # otherwise look it up. Roles can arrive as plain text or as a Role choice,
    # so ".value" turns a Role choice into plain text like "admin".
    role = getattr(user, "role", None) or get_role(user)
    role = getattr(role, "value", role)
    if role in FULL_ACCESS_ROLES:
        return f"role:{role}"
    if is_on_handover(user, document.get("handover_id")):
        return "handover_member"
    return None


def create_download_link(document):
    """Makes a short-lived link to one file.

    The "download" option makes the browser save it under the original
    file name, instead of the random name it's stored under.
    """
    result = get_client().storage.from_(BUCKET).create_signed_url(
        document["storage_path"],
        LINK_LIFETIME_SECONDS,
        {"download": document["original_name"]},
    )
    # Different versions of the Supabase tool spell this key differently.
    url = result.get("signedURL") or result.get("signedUrl") or result.get("signed_url")
    if not url:
        raise RuntimeError("Supabase did not return a signed link")
    return url
