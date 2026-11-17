import csv
from io import BytesIO, StringIO
from pathlib import Path, PurePosixPath
from uuid import uuid4
from zipfile import ZipFile

from fastapi import HTTPException, UploadFile


# Maximum upload size: 20 MB
MAX_FILE_SIZE = 20 * 1024 * 1024

# Maximum expanded size for Word and Excel documents: 100 MB
MAX_EXPANDED_SIZE = 100 * 1024 * 1024

# Maximum number of files inside a Word or Excel document
MAX_ARCHIVE_FILES = 1000

# File types supported by the frontend
ALLOWED_EXTENSIONS = {
    ".pdf",
    ".docx",
    ".xlsx",
    ".csv",
    ".txt"
}

# Read uploaded files in 1 MB chunks
CHUNK_SIZE = 1024 * 1024


def validate_text_file(contents: bytes, extension: str):
    # Check that the file contains valid UTF-8 text
    try:
        text = contents.decode("utf-8-sig")

    except UnicodeDecodeError as error:
        raise HTTPException(
            status_code=415,
            detail="Invalid text encoding"
        ) from error

    # Reject binary data disguised as text
    if any(
        ord(char) < 32 and char not in "\r\n\t"
        for char in text
    ):
        raise HTTPException(
            status_code=415,
            detail="Invalid text file contents"
        )

    # Check CSV formatting
    if extension == ".csv":
        try:
            reader = csv.reader(
                StringIO(text, newline=""),
                strict=True
            )

            # Read each row to check for malformed CSV
            for row in reader:
                pass

        except csv.Error as error:
            raise HTTPException(
                status_code=415,
                detail="Invalid CSV file"
            ) from error


def validate_office_file(contents: bytes, extension: str):
    # Word and Excel documents use ZIP-based file formats

    # Determine the main document file we expect
    if extension == ".docx":
        main_file = "word/document.xml"
    else:
        main_file = "xl/workbook.xml"

    try:
        # Open the document as a ZIP archive
        with ZipFile(BytesIO(contents)) as archive:

            files = archive.infolist()

            # Reject documents containing too many internal files
            if len(files) > MAX_ARCHIVE_FILES:
                raise HTTPException(
                    status_code=413,
                    detail="Document contains too many files"
                )

            # Check that the expected document components exist
            filenames = {item.filename for item in files}

            required_files = {
                "[Content_Types].xml",
                "_rels/.rels",
                main_file
            }

            if not required_files.issubset(filenames):
                raise HTTPException(
                    status_code=415,
                    detail="Invalid Word or Excel document"
                )

            total_expanded_size = 0

            # Inspect every file inside the document
            for item in files:
                name = item.filename

                # Reject unsafe internal file paths
                if (
                    name.startswith("/")
                    or "\\" in name
                    or ":" in name
                    or ".." in PurePosixPath(name).parts
                ):
                    raise HTTPException(
                        status_code=415,
                        detail="Unsafe document contents"
                    )

                # Reject encrypted internal files
                if item.flag_bits & 1:
                    raise HTTPException(
                        status_code=415,
                        detail="Encrypted documents are not supported"
                    )

                # Reject embedded VBA macro projects
                if name.lower().endswith("vbaproject.bin"):
                    raise HTTPException(
                        status_code=415,
                        detail="Macro-enabled documents are not allowed"
                    )

                # Calculate the total expanded document size
                total_expanded_size += item.file_size

                # Help protect against oversized compressed documents
                if total_expanded_size > MAX_EXPANDED_SIZE:
                    raise HTTPException(
                        status_code=413,
                        detail="Document expands beyond the allowed size"
                    )

            # Check the integrity of the ZIP contents
            if archive.testzip() is not None:
                raise HTTPException(
                    status_code=415,
                    detail="Corrupted Word or Excel document"
                )

    except HTTPException:
        # Preserve the validation errors above
        raise

    except Exception as error:
        # Reject files that cannot be read as Office documents
        raise HTTPException(
            status_code=415,
            detail="Invalid Word or Excel file"
        ) from error


async def check_uploaded_file(file: UploadFile) -> tuple[str, bytes]:
    """
    Validate an uploaded file before storage.

    Returns:
        A safe filename and the validated file contents.
    """

    # Get the uploaded filename
    filename = file.filename or ""

    # Reject dangerous or invalid filenames
    if (
        not filename
        or len(filename) > 150
        or any(char in filename for char in ("/", "\\", ":"))
        or any(ord(char) < 32 for char in filename)
    ):
        raise HTTPException(
            status_code=400,
            detail="Invalid filename"
        )

    # Check the file extension
    extension = Path(filename).suffix.lower()

    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=415,
            detail="Only PDF, DOCX, XLSX, CSV, and TXT files are allowed"
        )

    # Read the file while checking its size
    contents = bytearray()

    while True:
        chunk = await file.read(CHUNK_SIZE)

        if not chunk:
            break

        # Reject files larger than 20 MB
        if len(contents) + len(chunk) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=413,
                detail="File must be 20 MB or smaller"
            )

        contents.extend(chunk)

    # Reject empty files
    if not contents:
        raise HTTPException(
            status_code=400,
            detail="Cannot upload an empty file"
        )

    data = bytes(contents)

    # Validate PDF format markers
    if extension == ".pdf":
        if (
            not data.startswith(b"%PDF-")
            or b"%%EOF" not in data[-2048:]
        ):
            raise HTTPException(
                status_code=415,
                detail="Invalid PDF file"
            )

    # Validate TXT and CSV contents
    elif extension in {".txt", ".csv"}:
        validate_text_file(data, extension)

    # Validate Word and Excel documents
    elif extension in {".docx", ".xlsx"}:
        validate_office_file(data, extension)

    # Generate a unique, safe storage filename
    safe_filename = f"{uuid4().hex}{extension}"

    # Return the validated file contents
    return safe_filename, data