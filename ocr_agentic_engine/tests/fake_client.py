"""FakeOllamaClient — queued responses + model allow-list for tests."""
from __future__ import annotations

from dataclasses import dataclass, field
from types import SimpleNamespace
from typing import Any


@dataclass
class FakeOllamaClient:
    responses: list[Any] = field(default_factory=list)
    models: list[str] = field(default_factory=list)
    calls: list[dict] = field(default_factory=list)

    def chat(self, *, model: str, messages: list[dict], format: dict | None = None,
             options: dict | None = None, tools: list[dict] | None = None):
        self.calls.append({"model": model, "messages": messages, "format": format,
                            "options": options, "tools": tools})
        return self.responses.pop(0)

    def list(self):
        return SimpleNamespace(models=[SimpleNamespace(name=m) for m in self.models])
