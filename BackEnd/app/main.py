from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .routers import handover_workflow, members, users

app = FastAPI(title="Handover Helper API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users.router)
app.include_router(members.router)
app.include_router(handover_workflow.router)
app.include_router(handover_workflow.directory_router)


@app.get("/health")
def health():
    return {"status": "ok"}