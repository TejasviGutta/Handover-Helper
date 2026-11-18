# Security checks for uploaded files.
#
# The browser already checks file type and size, but anyone who knows how
# can skip the browser and send files straight to the server.
# So the server checks everything again here, and these checks are the ones
# that actually protect the app.
#
# Checks, in order:
# 1. Size: no bigger than 20 MB
# 2. File ending: must be .pdf, .docx, .xlsx, .csv, or .txt
# 3. File signature: the first bytes must match what the ending claims
#    (a program renamed to report.pdf gets caught here)
# 4. For Word and Excel: the inside of the file must look like a real
#    Word or Excel file, and must not be a "zip bomb"
# 5. For CSV and text: the file must be readable text, not hidden binary data

import codecs
import io
import os
import re
import uuid
import zipfile

# The size limit, 20 MB, written in bytes (20 x 1024 x 1024).
# Keep this the same as the limit on the upload page.
MAX_FILE_SIZE = 20 * 1024 * 1024

# The file endings we allow.
ALLOWED_EXTENSIONS = {".pdf", ".docx", ".xlsx", ".csv", ".txt"}

# Word and Excel files are really zip files with a set of files inside.
# These limits stop a "zip bomb": a small file that expands into a huge one
# when opened, and can crash the server.
MAX_UNZIPPED_SIZE = 200 * 1024 * 1024  # 200 MB once unpacked
MAX_ZIP_ENTRIES = 5000  # number of files packed inside

# How much of a text file to sample when checking it's really text.
TEXT_SAMPLE_SIZE = 64 * 1024  # 64 KB

# The longest original file name we keep as a label.
MAX_LABEL_LENGTH = 200


class FileRejected(Exception):
    """Raised when a file fails a check. The message is safe to show the user."""


def get_extension(filename):
    """Returns the file ending in lowercase, like ".pdf". Empty if there isn't one."""
    return os.path.splitext(filename or "")[1].lower()


def check_size(content):
    """Blocks empty files and files over 20 MB."""
    if len(content) == 0:
        raise FileRejected("File is empty")
    if len(content) > MAX_FILE_SIZE:
        raise FileRejected("File is too large (20 MB max)")


def check_extension(filename):
    """Blocks any file ending that isn't on the allowed list."""
    ext = get_extension(filename)
    if ext not in ALLOWED_EXTENSIONS:
        raise FileRejected("File type not supported")
    return ext


def check_pdf(content):
    """A real PDF always starts with the characters %PDF-."""
    if not content.startswith(b"%PDF-"):
        raise FileRejected("File type not supported")


def check_office_zip(content, ext):
    """Checks a Word (.docx) or Excel (.xlsx) file.

    These are zip files inside. A zip file starts with the bytes PK.
    Then we look inside to make sure it's really Word or Excel,
    and that it won't unpack into something huge.
    """
    # Every zip file starts with these four bytes.
    if not content.startswith(b"PK\x03\x04"):
        raise FileRejected("File type not supported")

    try:
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            entries = archive.infolist()

            # Too many files packed inside is a warning sign.
            if len(entries) > MAX_ZIP_ENTRIES:
                raise FileRejected("File type not supported")

            # Add up how big everything would be once unpacked.
            unzipped_size = sum(entry.file_size for entry in entries)
            if unzipped_size > MAX_UNZIPPED_SIZE:
                raise FileRejected("File type not supported")

            # A real Word file has word/document.xml inside.
            # A real Excel file has xl/workbook.xml inside.
            names = {entry.filename for entry in entries}
            required = "word/document.xml" if ext == ".docx" else "xl/workbook.xml"
            if required not in names:
                raise FileRejected("File type not supported")

            # Files whose names try to climb out of the folder (like ../../secret)
            # are a known attack. Real Office files never have these.
            for name in names:
                if name.startswith("/") or ".." in name.split("/"):
                    raise FileRejected("File type not supported")

    except zipfile.BadZipFile:
        # Starts like a zip but is broken or fake.
        raise FileRejected("File type not supported")


def check_text(content):
    """Checks a CSV or text file is really readable text.

    These have no signature, so instead we look for signs of binary data.
    Programs and images contain zero bytes. Normal text never does.
    """
    sample = content[:TEXT_SAMPLE_SIZE]

    if b"\x00" in sample:
        raise FileRejected("File type not supported")

    # The text must read as UTF-8 (the common standard) or Windows-1252
    # (what older Excel versions save CSVs as).
    # "final=False" stops it failing if the sample cuts a letter in half.
    for encoding in ("utf-8", "cp1252"):
        try:
            codecs.getincrementaldecoder(encoding)().decode(sample, final=False)
            return
        except UnicodeDecodeError:
            continue

    raise FileRejected("File type not supported")


def check_signature(content, ext):
    """Runs the right content check for the file's ending."""
    if ext == ".pdf":
        check_pdf(content)
    elif ext in (".docx", ".xlsx"):
        check_office_zip(content, ext)
    elif ext in (".csv", ".txt"):
        check_text(content)


def make_storage_name(ext):
    """Makes a random name to save the file under, like 3f9a...c2.pdf.

    The user's file name is never used as the storage path, so a name like
    ../../secret can't move the file into another folder.
    """
    return f"{uuid.uuid4().hex}{ext}"


def clean_label(filename):
    """Makes the original file name safe to store and show as a label.

    Removes any folder path, strips characters that could cause trouble,
    and cuts very long names short.
    """
    # Keep only the last part, in case the name includes folders.
    name = (filename or "").replace("\\", "/").split("/")[-1]
    # Remove invisible control characters.
    name = re.sub(r"[\x00-\x1f\x7f]", "", name).strip()
    if not name:
        name = "unnamed file"
    return name[:MAX_LABEL_LENGTH]


def validate_file(filename, content):
    """Runs every check on one uploaded file.

    Returns the safe details to save if the file passes.
    Raises FileRejected with a user-friendly message if it fails.
    """
    check_size(content)
    ext = check_extension(filename)
    check_signature(content, ext)

    return {
        "storage_name": make_storage_name(ext),
        "original_name": clean_label(filename),
        "extension": ext,
        "size": len(content),
    }