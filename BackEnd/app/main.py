# Import FastAPI to create backend application
from fastapi import FastAPI

# Import Handover Management API router
from app.routers.handovers import router as handover_router

# Import File Security router
from app.routers.files import router as files_router


# Create the main backend application
app = FastAPI(
    title="Handover Helper API"
)

# Connect Handover Management API to FastAPI
app.include_router(handover_router)

# Connect File Security API to FastAPI
app.include_router(files_router)


# Create basic endpoint to check server is running
@app.get("/")
def home():
    return {"message": "Handover Helper Backend is running."}