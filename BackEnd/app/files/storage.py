# Saves accepted files to Supabase.
# Each file goes into the private "documents" bucket,
# and gets one row in the "documents" table.

import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

# Load the secret settings from BackEnd/.env.
# This file is three folders up from here: files -> app -> BackEnd.
load_dotenv(Path(__file__).resolve().parents[2] / ".env")

# The storage bucket we created in Supabase.
BUCKET = "documents"

# The official type name for each file ending.
# Supabase checks this against the bucket's allowed types.
CONTENT_TYPES = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".csv": "text/csv",
    ".txt": "text/plain",
}


@lru_cache
def get_client():
    """Connects to Supabase once, and reuses that connection after.

    Uses the secret key, which skips row-level security.
    That's why it stays on the server and never goes to the browser.
    """
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SECRET_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL or SUPABASE_SECRET_KEY is missing from BackEnd/.env")
    return create_client(url, key)


def save_file(
    content,
    details,
    uploaded_by=None,
    handover_id=None,
    status="uploaded",
    redacted_text=None,
    redaction_summary=None,
):
    """Saves one file to the bucket and records it in the documents table.

    content: the file's bytes.
    details: what validate_file returned (storage name, original name, ending, size).
    status: the file's stage, like "uploaded", "parsed", or "redacted".
    redacted_text: the file's text with personal info hidden.
    redaction_summary: how many of each kind of personal info were hidden.
    Returns the new row from the documents table.
    """
    client = get_client()
    storage_name = details["storage_name"]

    # 1. Put the file in the bucket under its random name.
    # "upsert": "false" means never overwrite an existing file.
    client.storage.from_(BUCKET).upload(
        path=storage_name,
        file=content,
        file_options={
            "content-type": CONTENT_TYPES[details["extension"]],
            "upsert": "false",
        },
    )

    # 2. Add a row to the documents table.
    try:
        result = (
            client.table("documents")
            .insert(
                {
                    "handover_id": handover_id,
                    "original_name": details["original_name"],
                    "storage_path": storage_name,
                    "file_type": details["extension"],
                    "file_size": details["size"],
                    "status": status,
                    "uploaded_by": uploaded_by,
                    "redacted_text": redacted_text,
                    "redaction_summary": redaction_summary,
                }
            )
            .execute()
        )
    except Exception:
        # If the row couldn't be saved, delete the file too.
        # Otherwise we'd have a file in storage that nothing points to.
        client.storage.from_(BUCKET).remove([storage_name])
        raise

    return result.data[0]