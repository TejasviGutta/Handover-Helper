import json

import httpx
import pytest

from app.quiz.generator import QuizGenerationError
from app.quiz.llm_client import (
  QUIZ_JSON_SCHEMA,
  OllamaQuizLLM,
  QuizLLMError,
  QuizLLMSettings,
)

REPLY = json.dumps({"questions": []})


def client_with(handler):
  return httpx.Client(transport=httpx.MockTransport(handler))


def ok_handler(captured):
  def handler(request):
    captured["url"] = str(request.url)
    captured["body"] = json.loads(request.content)
    return httpx.Response(200, json={
      "message": {"role": "assistant", "content": REPLY},
      "done": True,
      "done_reason": "stop",
      "eval_count": 42,
      "total_duration": 2_000_000_000,
    })
  return handler


def test_sends_quiz_settings_and_returns_content():
  captured = {}
  settings = QuizLLMSettings(model="test-model", base_url="http://llm.test/", num_ctx=8192)
  llm = OllamaQuizLLM(settings, http_client=client_with(ok_handler(captured)))

  assert llm("Sample prompt") == REPLY
  assert captured["url"] == "http://llm.test/api/chat"
  body = captured["body"]
  assert body["model"] == "test-model"
  assert body["stream"] is False
  assert body["format"] == QUIZ_JSON_SCHEMA
  assert body["options"]["num_ctx"] == 8192
  assert body["messages"][-1] == {"role": "user", "content": "Sample prompt"}


def test_think_flag_is_omitted_by_default():
  captured = {}
  OllamaQuizLLM(QuizLLMSettings(), http_client=client_with(ok_handler(captured)))("p")
  assert "think" not in captured["body"]


def test_think_flag_is_sent_when_configured():
  captured = {}
  llm = OllamaQuizLLM(QuizLLMSettings(think=False), http_client=client_with(ok_handler(captured)))
  llm("p")
  assert captured["body"]["think"] is False


def test_connection_error_raises_generation_error():
  def handler(request):
    raise httpx.ConnectError("refused")

  llm = OllamaQuizLLM(QuizLLMSettings(), http_client=client_with(handler))
  with pytest.raises(QuizGenerationError):
    llm("p")


def test_error_status_raises_llm_error():
  llm = OllamaQuizLLM(
    QuizLLMSettings(),
    http_client=client_with(lambda request: httpx.Response(404, json={"error": "model not found"})),
  )
  with pytest.raises(QuizLLMError):
    llm("p")


def test_unexpected_body_raises_llm_error():
  llm = OllamaQuizLLM(
    QuizLLMSettings(),
    http_client=client_with(lambda request: httpx.Response(200, json={"nope": True})),
  )
  with pytest.raises(QuizLLMError):
    llm("p")


def test_settings_from_env(monkeypatch):
  monkeypatch.setenv("QUIZ_LLM_MODEL", "other-model")
  monkeypatch.setenv("QUIZ_LLM_NUM_CTX", "16384")
  monkeypatch.setenv("QUIZ_LLM_THINK", "false")
  monkeypatch.setenv("QUIZ_LLM_NUM_PREDICT", "not-a-number")
  settings = QuizLLMSettings.from_env()
  assert settings.model == "other-model"
  assert settings.num_ctx == 16384
  assert settings.think is False
  assert settings.num_predict == 4096


def test_settings_defaults(monkeypatch):
  for name in ("QUIZ_LLM_MODEL", "QUIZ_LLM_BASE_URL", "QUIZ_LLM_NUM_CTX", "QUIZ_LLM_THINK"):
    monkeypatch.delenv(name, raising=False)
  settings = QuizLLMSettings.from_env()
  assert settings.model == "qwen3:4b-instruct"
  assert settings.base_url == "http://localhost:11434"
  assert settings.think is None
