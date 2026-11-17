from fastapi import APIRouter, Depends, File, UploadFile

from app.auth import get_current_user
from app.file_security import check_uploaded_file


# Create a router for file security endpoints
router = APIRouter(
    prefix="/files",
    tags=["File Security"]
)


@router.post("/check", dependencies=[Depends(get_current_user)])
async def check_file(file: UploadFile = File(...)):

    # Validate the uploaded file
    safe_filename, contents = await check_uploaded_file(file)

    # Return information about the validated file
    return {
        "message": "File passed initial security checks",
        "filename": safe_filename,
        "size_bytes": len(contents)
    }