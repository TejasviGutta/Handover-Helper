"""Quiz-only client for a local Ollama server.

Uses Ollama's native /api/chat endpoint so the quiz feature can:
  - pick its own model (a non-thinking instruct model is much faster),
  - raise the context window (the default is too small for long documents),
  - force JSON output that matches the question schema (fewer retries).

Settings come from environment variables, with local defaults:
  QUIZ_LLM_MODEL        default "qwen3:4b-instruct"
  QUIZ_LLM_BASE_URL     default "http://localhost:11434"
  QUIZ_LLM_NUM_CTX      default 8192
  QUIZ_LLM_NUM_PREDICT  default 4096
  QUIZ_LLM_TIMEOUT      default 300 (seconds)
  QUIZ_LLM_THINK        unset by default; "true"/"false" sends Ollama's think flag
"""

import logging
import os
from dataclasses import dataclass

import httpx

from app.quiz.generator import QuizGenerationError

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
  "You write multiple-choice knowledge-check questions. "
  "Reply with a single JSON object and nothing else."
)

QUIZ_JSON_SCHEMA = {
  "type": "object",
  "properties": {
    "questions": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "prompt": {"type": "string"},
          "options": {
            "type": "array",
            "items": {"type": "string"},
            "minItems": 4,
            "maxItems": 4,
          },
          "correct": {"type": "integer", "minimum": 0, "maximum": 3},
          "explanation": {"type": "string"},
          "source_chunk_ids": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["prompt", "options", "correct"],
      },
    },
  },
  "required": ["questions"],
}


class QuizLLMError(QuizGenerationError):
  """The LLM server could not be reached or returned an unusable response."""


def _env_int(name: str, default: int) -> int:
  value = os.environ.get(name, "").strip()
  try:
    return int(value) if value else default
  except ValueError:
    return default


def _env_bool(name: str) -> bool | None:
  value = os.environ.get(name, "").strip().lower()
  if value in ("1", "true", "yes"):
    return True
  if value in ("0", "false", "no"):
    return False
  return None


@dataclass(frozen=True)
class QuizLLMSettings:
  model: str = "qwen3:4b-instruct"
  base_url: str = "http://localhost:11434"
  num_ctx: int = 8192
  num_predict: int = 4096
  timeout: float = 300.0
  # None leaves the flag out; some models reject it when they cannot think.
  think: bool | None = None
  keep_alive: str = "30m"

  @classmethod
  def from_env(cls) -> "QuizLLMSettings":
    return cls(
      model=os.environ.get("QUIZ_LLM_MODEL", "").strip() or cls.model,
      base_url=os.environ.get("QUIZ_LLM_BASE_URL", "").strip() or cls.base_url,
      num_ctx=_env_int("QUIZ_LLM_NUM_CTX", cls.num_ctx),
      num_predict=_env_int("QUIZ_LLM_NUM_PREDICT", cls.num_predict),
      timeout=float(_env_int("QUIZ_LLM_TIMEOUT", int(cls.timeout))),
      think=_env_bool("QUIZ_LLM_THINK"),
    )


class OllamaQuizLLM:
  """Callable that sends one prompt and returns the reply text."""

  def __init__(
    self,
    settings: QuizLLMSettings | None = None,
    http_client: httpx.Client | None = None,
  ) -> None:
    self.settings = settings or QuizLLMSettings.from_env()
    self.http_client = http_client

  def _payload(self, prompt: str) -> dict:
    payload = {
      "model": self.settings.model,
      "messages": [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": prompt},
      ],
      "stream": False,
      "format": QUIZ_JSON_SCHEMA,
      "keep_alive": self.settings.keep_alive,
      "options": {
        "num_ctx": self.settings.num_ctx,
        "num_predict": self.settings.num_predict,
      },
    }
    if self.settings.think is not None:
      payload["think"] = self.settings.think
    return payload

  def __call__(self, prompt: str) -> str:
    url = self.settings.base_url.rstrip("/") + "/api/chat"
    try:
      if self.http_client is not None:
        response = self.http_client.post(url, json=self._payload(prompt))
      else:
        with httpx.Client(timeout=self.settings.timeout) as client:
          response = client.post(url, json=self._payload(prompt))
    except httpx.HTTPError as exc:
      # Log the error type only; never the prompt or reply.
      logger.error("quiz llm request failed: %s", type(exc).__name__)
      raise QuizLLMError("LLM server is not reachable") from exc

    if response.status_code != 200:
      logger.error("quiz llm returned status %d", response.status_code)
      raise QuizLLMError("LLM server returned an error")

    try:
      data = response.json()
      content = data["message"]["content"]
    except (ValueError, KeyError, TypeError) as exc:
      logger.error("quiz llm returned an unexpected body")
      raise QuizLLMError("LLM server returned an unexpected response") from exc

    if data.get("done_reason") == "length":
      logger.warning("quiz llm output hit the token limit; JSON may be cut off")
    logger.info(
      "quiz llm done: output_tokens=%s seconds=%.1f",
      data.get("eval_count", "?"),
      (data.get("total_duration") or 0) / 1e9,
    )
    return content if isinstance(content, str) else ""
