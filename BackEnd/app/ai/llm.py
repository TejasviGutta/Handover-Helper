from openai import OpenAI

MODEL_NAME = "qwen3:4b"
BASE_URL = "http://localhost:11434/v1"
openai = OpenAI(api_key ="ollama", base_url = BASE_URL)

SYSTEM_PROMPT = """
You are an AI assistant for Handover Helper.
Your purpose is to help employees understand project
responsibilities, workflows, and knowledge transfers.

Provide clear, concise, professional answers.
"""

def generate_response(prompt: str) -> str:
    if not prompt.strip():
        raise ValueError("Prompt cannot be empty")

    response = openai.chat.completions.create(
        model=MODEL_NAME,
        messages=[
            {
                "role": "system",
                "content": SYSTEM_PROMPT
            },
            {
                "role": "user",
                "content": prompt
            }
        ]
    )

    return response.choices[0].message.content or ""
