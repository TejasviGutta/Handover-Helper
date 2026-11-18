# Decides who can add files to a handover.
#
# Uploading is the departing employee's job: they gather their work so the
# next person can learn from it. So only the departing employee on a handover,
# or an admin, can upload files to it. Viewers can never upload.
#
# Emails are matched with the team's matches_employee check, which only
# trusts verified emails. Without that, someone could sign up using another
# person's email address, skip verifying it, and get into their handover.

from app.files.storage import get_client
from app.routers.handover_workflow import matches_employee


def get_handover(handover_id):
    """Looks up one handover's people. Returns None if there isn't one."""
    result = (
        get_client()
        .table("handovers")
        .select("id, departing_employee, incoming_employee")
        .eq("id", str(handover_id))
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def can_upload_to(user, handover):
    """True if this user is allowed to add files to this handover."""
    # Roles can arrive as a Role choice or plain text. ".value" gives plain text.
    role = getattr(user.role, "value", user.role)
    if role == "viewer":
        return False
    if role == "admin":
        return True
    return matches_employee(user, handover.get("departing_employee"))
