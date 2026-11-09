
from app.documents.extraction import extract_document, ExtractionError



from openpyxl import Workbook
from io import BytesIO

print("\nTEST 6: XLSX extraction")

# Create an Excel workbook
workbook = Workbook()

# First sheet
sheet1 = workbook.active
sheet1.title = "Team"

sheet1.append(["Name", "Role"])
sheet1.append(["John", "Project Manager"])
sheet1.append(["Sarah", "Developer"])

# Second sheet
sheet2 = workbook.create_sheet("Tasks")

sheet2.append(["Task", "Status"])
sheet2.append(["RAG Integration", "Pending"])
sheet2.append(["API Testing", "Completed"])

# Convert workbook into bytes
buffer = BytesIO()
workbook.save(buffer)
xlsx_bytes = buffer.getvalue()
workbook.close()

# Extract text
result = extract_document(xlsx_bytes, "handover.xlsx")

for section in result:
    print(section["location"], ":", section["text"])

# Verify results
assert len(result) == 6

assert result[0]["location"] == "Sheet Team, Row 1"
assert result[1]["text"] == "John | Project Manager"
assert result[2]["text"] == "Sarah | Developer"

assert result[3]["location"] == "Sheet Tasks, Row 1"
assert result[4]["text"] == "RAG Integration | Pending"
assert result[5]["text"] == "API Testing | Completed"

print("TEST 6 PASSED!")
