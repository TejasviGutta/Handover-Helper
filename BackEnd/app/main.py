# The starting point of the backend server.
# Every request from the frontend comes in here first.

# logging writes error details to the terminal for us to read.
import logging

# FastAPI is the tool that turns Python functions into web addresses.
# UploadFile and File let an address receive uploaded files.
# HTTPException lets us send back an error with a message.
# Depends runs a check (like the login check) before the address does its work.
from fastapi import Depends, FastAPI, File, HTTPException, UploadFile

# CORS is a browser safety rule. It blocks web pages from calling a server
# unless that server says "this page is allowed." We allow only our frontend.
from fastapi.middleware.cors import CORSMiddleware

# Our security checks, from app/files/security.py.
from app.files.security import MAX_FILE_SIZE, FileRejected, validate_file

# Our text extraction, from app/files/extract.py.
from app.files.extract import ExtractionFailed, extract_text

# NEW: Our personal info redaction, from app/files/redact.py.
from app.files.redact import redact_text

# Our Supabase saving code, from app/files/storage.py.
from app.files.storage import save_file

# The login check, from app/auth.py.
from app.auth import get_current_user

# Set up a logger for this file.
logger = logging.getLogger(__name__)

# Create the server.
app = FastAPI(title="Handover Helper API")

# Allow the frontend to call this server.
# 5173 is where Vite runs the frontend on your computer.
# When the site goes online, its real address gets added here.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# A simple check that the server is running.
# Visiting /health should show {"status": "ok"}.
@app.get("/health")
def health():
    return {"status": "ok"}


# Receives one file and runs every security check on it.
# Only reports the result. Nothing gets saved. Handy for testing.
@app.post("/files/check")
async def check_file(file: UploadFile = File(...)):
    # Read at most 20 MB plus 1 byte.
    # If we get that extra byte, the file is too big, and we stop reading
    # instead of loading a huge file into memory.
    content = await file.read(MAX_FILE_SIZE + 1)

    try:
        details = validate_file(file.filename, content)
    except FileRejected as error:
        # 400 means "bad request". The message is safe to show the user.
        raise HTTPException(status_code=400, detail=str(error))

    return {"status": "accepted", **details}


# NEW: Renamed from /files/extract. Shows the text pulled out of a file,
# with personal info hidden, so we can check what the AI will see.
# Nothing gets saved. For testing only. Remove before the site goes live.
@app.post("/files/preview")
async def preview_file(file: UploadFile = File(...)):
    content = await file.read(MAX_FILE_SIZE + 1)

    try:
        details = validate_file(file.filename, content)
        text = extract_text(content, details["extension"])
    except (FileRejected, ExtractionFailed) as error:
        raise HTTPException(status_code=400, detail=str(error))

    redacted, summary = redact_text(text)

    return {
        "characters": len(redacted),
        "hidden": summary,
        # Only the first 3,000 characters, so huge files don't flood the screen.
        "preview": redacted[:3000],
    }


# Receives one file, checks it, reads its text, hides personal info,
# and saves it to Supabase. Only signed-in users can upload.
@app.post("/files/upload", status_code=201)
async def upload_file(
    file: UploadFile = File(...),
    # Runs the login check first. If it fails, the file is never read.
    user=Depends(get_current_user),
):
    # Same size-safe read as above.
    content = await file.read(MAX_FILE_SIZE + 1)

    # Run every security check first. Nothing is saved unless it passes.
    try:
        details = validate_file(file.filename, content)
    except FileRejected as error:
        raise HTTPException(status_code=400, detail=str(error))

    # Pull the text out. If there's no readable text, stop here.
    try:
        text = extract_text(content, details["extension"])
    except ExtractionFailed as error:
        raise HTTPException(status_code=400, detail=str(error))

    # NEW: Hide the personal info. If this fails for any reason, stop.
    # We never save text that wasn't redacted.
    try:
        redacted, summary = redact_text(text)
    except Exception:
        logger.exception("Redaction failed")
        raise HTTPException(
            status_code=500, detail="This file couldn't be processed. Please try again."
        )

    # NEW: The raw text isn't needed anymore. Drop it.
    del text

    # Save the file and its record, stamped with who uploaded it.
    # NEW: status is "redacted", and the cleaned text is saved with it.
    try:
        record = save_file(
            content,
            details,
            uploaded_by=user.id,
            status="redacted",
            redacted_text=redacted,
            redaction_summary=summary,
        )
    except Exception:
        # Write the full error to the terminal for us,
        # but send the user a plain message with no inside details.
        # Error details can reveal how the system works, which helps attackers.
        logger.exception("Saving upload failed")
        raise HTTPException(status_code=500, detail="Upload failed. Please try again.")

    # NEW: Don't send the whole text back to the browser. It isn't needed there.
    record.pop("redacted_text", None)

    return {"status": "uploaded", "hidden": summary, "document": record}