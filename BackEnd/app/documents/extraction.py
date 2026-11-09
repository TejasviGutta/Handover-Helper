
import csv
from io import BytesIO, StringIO
from pathlib import Path
import pymupdf
from docx import Document
from openpyxl import load_workbook


class ExtractionError(Exception):
    """Raised when a document cannot be processed."""
    pass


def decode_text(content: bytes) -> str:
    """Decode plain-text files."""
    try:
        if content.startswith((b"\xff\xfe", b"\xfe\xff")):
            return content.decode("utf-16")

        try:
            return content.decode("utf-8-sig")
        except UnicodeDecodeError:
            # The upload validator also accepts Windows-1252 text.
            return content.decode("cp1252")

    except UnicodeDecodeError as error:
        raise ExtractionError(
            "Unsupported text encoding."
        ) from error


def extract_document(content: bytes, filename: str) -> list[dict]:
    """
    Extract readable text from an uploaded document.

    Returns:
        [
            {"text": "...", "location": "Page 1"},
            {"text": "...", "location": "Page 2"}
        ]
    """

    if not content:
        raise ExtractionError("Document is empty.")

    extension = Path(filename).suffix.lower()
    sections = []

    try:

        # PDF
        if extension == ".pdf":
            with pymupdf.open(
                stream=content,
                filetype="pdf"
            ) as document:

                for page_number, page in enumerate(document, start=1):
                    text = page.get_text("text", sort=True).strip()

                    if text:
                        sections.append({
                            "text": text,
                            "location": f"Page {page_number}"
                        })

        # Word
        elif extension == ".docx":
            document = Document(BytesIO(content))

            paragraphs = [
                paragraph.text.strip()
                for paragraph in document.paragraphs
                if paragraph.text.strip()
            ]

            # Also extract content from tables.
            for table in document.tables:
                for row in table.rows:
                    values = [
                        cell.text.strip()
                        for cell in row.cells
                    ]
                    if any(values):
                        paragraphs.append(" | ".join(values))

            if paragraphs:
                sections.append({
                    "text": "\n".join(paragraphs),
                    "location": "Document"
                })

        # Plain text
        elif extension == ".txt":
            text = decode_text(content).strip()

            if text:
                sections.append({
                    "text": text,
                    "location": "Document"
                })

        # CSV
        elif extension == ".csv":
            text = decode_text(content)

            reader = csv.reader(StringIO(text, newline=""))

            for row_number, row in enumerate(reader, start=1):
                row_text = " | ".join(
                    value.strip() for value in row
                )

                if row_text.strip(" |"):
                    sections.append({
                        "text": row_text,
                        "location": f"Row {row_number}"
                    })

        # Excel
        elif extension == ".xlsx":
            workbook = load_workbook(
                BytesIO(content),
                read_only=True,
                data_only=True,
                keep_links=False
            )

            try:
                for sheet in workbook.worksheets:
                    for row_number, row in enumerate(
                        sheet.iter_rows(values_only=True),
                        start=1
                    ):
                        values = [
                            str(value) if value is not None else ""
                            for value in row
                        ]

                        if any(values):
                            sections.append({
                                "text": " | ".join(values),
                                "location": (
                                    f"Sheet {sheet.title}, "
                                    f"Row {row_number}"
                                )
                            })
            finally:
                workbook.close()

        else:
            raise ExtractionError(
                f"Unsupported file type: {extension}"
            )

    except ExtractionError:
        raise

    except Exception as error:
        raise ExtractionError(
            f"Could not extract text from {extension} file."
        ) from error

    if not sections:
        raise ExtractionError(
            "No readable text found. "
            "The document may be empty or require OCR."
        )

    return sections
