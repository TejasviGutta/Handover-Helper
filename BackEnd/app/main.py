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


# Receives one file, checks it, and saves it to Supabase.
# Only signed-in users can upload.
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

    # Save the file and its record, stamped with who uploaded it.
    try:
        record = save_file(content, details, uploaded_by=user.id)
    except Exception:
        # Write the full error to the terminal for us,
        # but send the user a plain message with no inside details.
        # Error details can reveal how the system works, which helps attackers.
        logger.exception("Saving upload failed")
        raise HTTPException(status_code=500, detail="Upload failed. Please try again.")

    return {"status": "uploaded", "document": record}