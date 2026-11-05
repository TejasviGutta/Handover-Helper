from BackEnd.app.ai.llm import generate_response

response = generate_response(
    "What is the purpose of a project handover?"
)

print(response)