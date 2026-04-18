from types import SimpleNamespace

import pytest

from ocr_agentic_engine.client import OllamaClientProtocol
from ocr_agentic_engine.tests.fake_client import FakeOllamaClient


def test_fake_client_satisfies_protocol():
    assert isinstance(FakeOllamaClient(responses=[], models=[]), OllamaClientProtocol)


def test_list_and_chat_are_queueable():
    r = SimpleNamespace(message=SimpleNamespace(content='{}', tool_calls=None))
    c = FakeOllamaClient(responses=[r], models=["m"])
    assert {m.name for m in c.list().models} == {"m"}
    assert c.chat(model="m", messages=[], format={}).message.content == '{}'


def test_chat_records_calls():
    r = SimpleNamespace(message=SimpleNamespace(content='{}', tool_calls=None))
    c = FakeOllamaClient(responses=[r], models=["m"])
    c.chat(model="m", messages=[{"role": "user", "content": "hi"}], format={"a": 1})
    assert c.calls[0]["messages"][0]["content"] == "hi"


def test_chat_raises_when_exhausted():
    c = FakeOllamaClient(responses=[], models=["m"])
    with pytest.raises(IndexError):
        c.chat(model="m", messages=[], format={})
