from types import SimpleNamespace

import pytest
from pydantic import BaseModel

from ocr_agentic_engine.agents._base import LocalAgent
from ocr_agentic_engine.agents.models import agent_model
from ocr_agentic_engine.errors import AgentOutputError, ModelUnavailableError
from ocr_agentic_engine.tests.fake_client import FakeOllamaClient
from ocr_agentic_engine.tools import AgentTool


class In(BaseModel):
    q: str


class Out(BaseModel):
    a: str


class Dummy(LocalAgent[In, Out]):
    name = "dummy"
    model = "fake:1b"
    system_prompt = "echo q"
    output_model = Out

    def _build_messages(self, inp: In):
        return [{"role": "system", "content": self.system_prompt},
                {"role": "user", "content": inp.q}]


def _resp(content, tool_calls=None):
    return SimpleNamespace(message=SimpleNamespace(content=content, tool_calls=tool_calls))


def test_happy_path_parses_output():
    c = FakeOllamaClient(responses=[_resp('{"a":"ok"}')], models=["fake:1b"])
    assert Dummy(c).run(In(q="x")) == Out(a="ok")
    assert c.calls[0]["format"] == Out.model_json_schema()


def test_retries_on_invalid_json_then_succeeds():
    c = FakeOllamaClient(responses=[_resp("nope"), _resp('{"a":"ok"}')], models=["fake:1b"])
    assert Dummy(c).run(In(q="x")) == Out(a="ok")
    assert len(c.calls) == 2


def test_exhausts_retries_and_raises():
    c = FakeOllamaClient(responses=[_resp("a"), _resp("b"), _resp("c")], models=["fake:1b"])
    with pytest.raises(AgentOutputError) as ex:
        Dummy(c).run(In(q="x"))
    assert ex.value.stage == "dummy" and ex.value.cause is not None


def test_missing_model_raises_before_chat_call():
    c = FakeOllamaClient(responses=[], models=[])
    with pytest.raises(ModelUnavailableError):
        Dummy(c).run(In(q="x"))
    assert c.calls == []


def test_model_override_via_constructor():
    c = FakeOllamaClient(responses=[_resp('{"a":"ok"}')], models=["other:7b"])
    Dummy(c, model_override="other:7b").run(In(q="x"))
    assert c.calls[0]["model"] == "other:7b"


def test_env_model_override(monkeypatch):
    monkeypatch.setenv("ENGINE_MODELS_JSON", '{"extractor":"env-m:9b"}')
    assert agent_model("extractor") == "env-m:9b"
    assert agent_model("comparator") == "llama3.1:8b"


def test_tool_call_loop_executes_and_returns():
    calls = []
    tool = AgentTool(name="noop", fn=lambda x: (calls.append(x) or "done"),
                     schema={"type": "function", "function": {"name": "noop",
                              "parameters": {"type": "object",
                                              "properties": {"x": {"type": "integer"}}}}})
    tc = SimpleNamespace(function=SimpleNamespace(name="noop", arguments={"x": 1}))
    c = FakeOllamaClient(responses=[_resp(None, tool_calls=[tc]), _resp('{"a":"ok"}')],
                          models=["fake:1b"])

    class WithTool(Dummy):
        tools = [tool]

    assert WithTool(c).run(In(q="x")) == Out(a="ok")
    assert calls == [1]
