# The starting point of the backend server.
# Every request from the frontend comes in here first.

# FastAPI is the tool that turns Python functions into web addresses.
# UploadFile and File let an address receive uploaded files.
# HTTPException lets us send back an error with a message.
from fastapi import FastAPI, File, HTTPException, UploadFile

# CORS is a browser safety rule. It blocks web pages from calling a server
# unless that server says "this page is allowed." We allow only our frontend.
from fastapi.middleware.cors import CORSMiddleware

# Our security checks, from app/files/security.py.
from app.files.security import MAX_FILE_SIZE, FileRejected, validate_file

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
# For now it only reports the result. Saving to Supabase comes next.
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