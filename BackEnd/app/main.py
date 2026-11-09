# The starting point of the backend server.
# Every request from the frontend comes in here first.

# FastAPI is the tool that turns Python functions into web addresses.
from fastapi import FastAPI

# CORS is a browser safety rule. It blocks web pages from calling a server
# unless that server says "this page is allowed." We allow only our frontend.
from fastapi.middleware.cors import CORSMiddleware

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