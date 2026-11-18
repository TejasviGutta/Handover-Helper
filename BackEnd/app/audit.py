# Writes a record to the audit_log table every time something worth
# tracking happens: uploads, blocked uploads, download links, denied access.
#
# Security teams use logs like this to answer "who did what, and when"
# after something goes wrong.
#
# Two rules:
# 1. Logging must never break the main action. If the log can't be written,
#    the upload or download still goes ahead, and the error shows in the terminal.
# 2. Never put file contents or personal info from inside files in the log.

import logging
import uuid
from datetime import datetime, timezone

from app.files.storage import get_client

logger = logging.getLogger(__name__)


def log_event(
    action,
    user=None,
    target_type=None,
    target_id=None,
    target_label=None,
    details=None,
    ip=None,
):
    """Adds one row to audit_log.

    action: what happened, like "file.upload" or "file.download_denied".
    user: the signed-in user, if there is one.
    target_type, target_id, target_label: what it happened to, like a document.
    details: extra facts, like why a file was blocked. Never file contents.
    ip: the address the request came from.
    """
    extra = dict(details or {})
    if ip:
        extra["ip"] = ip

    row = {
        "id": str(uuid.uuid4()),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "actor_id": str(user.id) if user else None,
        "actor_email": getattr(user, "email", None) if user else None,
        "action": action,
        "target_type": target_type,
        "target_id": str(target_id) if target_id else None,
        "target_label": target_label,
        "details": extra,
    }

    try:
        get_client().table("audit_log").insert(row).execute()
    except Exception:
        # Don't stop the main action. Just make the problem visible.
        logger.exception("Could not write to audit_log: %s", action)
