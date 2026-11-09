"""Focused extraction checks; run with PYTHONPATH=BackEnd python -m unittest."""

import unittest
from io import BytesIO

import pymupdf
from docx import Document

from app.documents.extraction import ExtractionError, extract_document


class ExtractionFormatsTest(unittest.TestCase):
    def test_pdf_preserves_page_location(self):
        document = pymupdf.open()
        document.new_page().insert_text((72, 72), "Handover notes")
        content = document.tobytes()
        document.close()
        self.assertEqual(extract_document(content, "notes.pdf"), [
            {"text": "Handover notes", "location": "Page 1"}
        ])

    def test_docx_includes_paragraphs_and_tables(self):
        document = Document()
        document.add_paragraph("Project notes")
        table = document.add_table(rows=1, cols=2)
        table.cell(0, 0).text = "Owner"
        table.cell(0, 1).text = "Alex"
        output = BytesIO()
        document.save(output)
        self.assertEqual(extract_document(output.getvalue(), "notes.docx"), [
            {"text": "Project notes\nOwner | Alex", "location": "Document"}
        ])

    def test_csv_and_windows_1252_text(self):
        self.assertEqual(extract_document(b"Name,Role\nJos\xe9,Lead", "team.csv")[1],
                         {"text": "José | Lead", "location": "Row 2"})
        self.assertEqual(extract_document(b"caf\xe9", "notes.txt")[0]["text"], "café")

    def test_empty_and_invalid_documents(self):
        for content, name in [(b"", "empty.txt"), (b"bad", "bad.pdf")]:
            with self.subTest(name=name), self.assertRaises(ExtractionError):
                extract_document(content, name)


if __name__ == "__main__":
    unittest.main()
