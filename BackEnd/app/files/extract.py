# Pulls the text out of uploaded files.
#
# This runs after the security checks pass, so we already know each file
# is really what its name says.
#
# The text stays in memory only. It's full of personal info (names, emails,
# phone numbers), so it never gets saved as-is. Step 6 hides the personal
# info, and only that cleaned version gets saved.
#
# Limits on pages, rows, and text length stop one huge file from
# tying up the server.

import io
import re

import pymupdf  # reads PDFs
from docx import Document  # python-docx, reads Word files
from openpyxl import load_workbook  # reads Excel files

# The most text we keep from one file, in characters.
# About 2 million characters is roughly 400,000 words.
MAX_TEXT_CHARS = 2_000_000

# The most PDF pages we read.
MAX_PDF_PAGES = 500

# The most rows we read from each Excel sheet.
MAX_SHEET_ROWS = 50_000


class ExtractionFailed(Exception):
    """Raised when a file's text can't be read. The message is safe to show the user."""


def extract_pdf(content):
    """Reads the text from each page of a PDF."""
    with pymupdf.open(stream=content, filetype="pdf") as pdf:
        # Password-protected PDFs can't be read without the password.
        if pdf.needs_pass:
            raise ExtractionFailed("This PDF is password protected. Remove the password and try again.")

        pages = []
        for page_number, page in enumerate(pdf):
            if page_number >= MAX_PDF_PAGES:
                break
            pages.append(page.get_text())
        return "\n\n".join(pages)


def extract_docx(content):
    """Reads the paragraphs and tables from a Word file."""
    document = Document(io.BytesIO(content))
    parts = []

    # Normal paragraphs of text.
    for paragraph in document.paragraphs:
        parts.append(paragraph.text)

    # Tables. Each row becomes one line, with cells split by " | ".
    for table in document.tables:
        for row in table.rows:
            parts.append(" | ".join(cell.text.strip() for cell in row.cells))

    return "\n".join(parts)


def extract_xlsx(content):
    """Reads every sheet of an Excel file, one row per line.

    read_only reads the file bit by bit instead of all at once, which uses less memory.
    data_only gives the values shown in cells, not the formulas behind them.
    """
    workbook = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    parts = []
    try:
        for sheet in workbook.worksheets:
            parts.append(f"Sheet: {sheet.title}")
            for row_number, row in enumerate(sheet.iter_rows(values_only=True)):
                if row_number >= MAX_SHEET_ROWS:
                    break
                # Skip empty cells, and skip rows that are completely empty.
                cells = [str(value) for value in row if value is not None]
                if cells:
                    parts.append(" | ".join(cells))
            parts.append("")
    finally:
        workbook.close()
    return "\n".join(parts)


def extract_plain(content):
    """Reads a CSV or text file.

    Tries UTF-8 first (utf-8-sig also handles the hidden marker Excel adds),
    then Windows-1252, which older Excel versions use for CSVs.
    """
    for encoding in ("utf-8-sig", "cp1252"):
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise ExtractionFailed("This file's text couldn't be read.")


def clean_text(text):
    """Tidies the text: removes hidden characters and extra blank space."""
    # Remove zero bytes, which can break databases.
    text = text.replace("\x00", "")
    # Remove spaces at the end of each line.
    text = re.sub(r"[ \t]+\n", "\n", text)
    # Turn 3 or more blank lines in a row into just one.
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def extract_text(content, ext):
    """Pulls the text out of one file.

    content: the file's bytes.
    ext: the file ending, like ".pdf" (already checked by the security checks).
    Returns the text. Raises ExtractionFailed if there's nothing readable.
    """
    readers = {
        ".pdf": extract_pdf,
        ".docx": extract_docx,
        ".xlsx": extract_xlsx,
        ".csv": extract_plain,
        ".txt": extract_plain,
    }

    try:
        text = readers[ext](content)
    except ExtractionFailed:
        # Our own messages pass straight through.
        raise
    except Exception:
        # Anything else means the file is damaged in a way the reader couldn't handle.
        # The real error stays out of the message, so we don't reveal inside details.
        raise ExtractionFailed("This file couldn't be read. It may be damaged.")

    text = clean_text(text)

    # A file with no text is no use for a handover guide.
    # The most common cause is a scanned PDF, which is a picture of text.
    if not text:
        raise ExtractionFailed(
            "No readable text found. Scanned documents aren't supported yet."
        )

    return text[:MAX_TEXT_CHARS]
