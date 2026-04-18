"""Ollama client protocol + live-client factory."""
from __future__ import annotations

import os
from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class OllamaClientProtocol(Protocol):
    def chat(self, *, model: str, messages: list[dict], format: dict | None = None,
             options: dict | None = None, tools: list[dict] | None = None) -> Any: ...
    def list(self) -> Any: ...


def get_ollama_client() -> OllamaClientProtocol:
    from ollama import Client
    return Client(host=os.getenv("OLLAMA_HOST", "http://localhost:11434"))
