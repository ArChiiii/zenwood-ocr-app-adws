"""LocalAgent — shared scaffold for all engine agents (spec §5.2).

Two workflows:

1. **Native tool-calling** (for models that support Ollama's `tools` API, e.g.
   llama3.1): set :attr:`tools` to a list of :class:`AgentTool` and the base
   class runs the iterative chat/tool_calls loop.

2. **Python-resolved context** (for vision models like qwen2.5vl that don't
   expose tool-calling): override :meth:`_resolve_context` to pre-compute any
   images/notes the agent needs. They're attached to the last user message
   before a single chat call (no `tools=` param). Mix-and-match is fine —
   setting both is allowed but redundant.
"""
from __future__ import annotations

import json
from typing import Any, ClassVar, Generic, TypeVar

from pydantic import BaseModel, ValidationError

from ocr_agentic_engine.client import OllamaClientProtocol
from ocr_agentic_engine.errors import AgentOutputError, ModelUnavailableError, ToolExecutionError
from ocr_agentic_engine.tools import AgentTool

InputT = TypeVar("InputT", bound=BaseModel)
OutputT = TypeVar("OutputT", bound=BaseModel)
_MAX_RETRIES = 3


class AgentContext(BaseModel):
    """Pre-resolved tool output inlined into the prompt when native tool-calling is off."""
    images: list[str] = []
    notes: str = ""


class LocalAgent(Generic[InputT, OutputT]):
    name: ClassVar[str] = "agent"
    model: ClassVar[str] = ""
    system_prompt: ClassVar[str] = ""
    output_model: ClassVar[type[BaseModel]]
    tools: ClassVar[list[AgentTool]] = []
    options: ClassVar[dict[str, Any]] = {"temperature": 0.0, "num_ctx": 8192}

    def __init__(self, client: OllamaClientProtocol, model_override: str | None = None):
        self.client = client
        self._model = model_override or self.model

    def _build_messages(self, inp: InputT) -> list[dict]:  # pragma: no cover
        raise NotImplementedError

    def _resolve_context(self, inp: InputT) -> AgentContext:
        """Override to pre-compute tool output (images, notes) for non-tool-calling models."""
        return AgentContext()

    def run(self, inp: InputT) -> OutputT:
        self._verify_model()
        messages = self._build_messages(inp)

        ctx = self._resolve_context(inp)
        if ctx.notes:
            messages.append({"role": "user", "content": ctx.notes})
        if ctx.images:
            for m in reversed(messages):
                if m["role"] == "user":
                    m["images"] = list(ctx.images)
                    break

        tools_schema = [t.schema for t in self.tools] or None
        tools_by_name = {t.name: t for t in self.tools}

        last_err: Exception | None = None
        for _ in range(_MAX_RETRIES):
            resp = self.client.chat(model=self._model, messages=messages,
                                     format=self.output_model.model_json_schema(),
                                     options=self.options, tools=tools_schema)
            if getattr(resp.message, "tool_calls", None):
                messages = self._handle_tool_calls(messages, resp, tools_by_name)
                continue
            try:
                return self.output_model.model_validate_json(resp.message.content)  # type: ignore[return-value]
            except ValidationError as e:
                last_err = e
                messages.append({"role": "user",
                                  "content": f"Invalid JSON for {self.output_model.__name__}: {e}. "
                                              f"Return a single JSON object conforming to the schema."})
        raise AgentOutputError(stage=self.name,
                                message=f"{self.name} failed after {_MAX_RETRIES} attempts",
                                cause=last_err)

    def _verify_model(self) -> None:
        available = {getattr(m, "model", None) or getattr(m, "name", None)
                     for m in self.client.list().models}
        if self._model not in available:
            raise ModelUnavailableError(stage=self.name,
                                         message=f"model '{self._model}' not pulled — "
                                                  f"run `ollama pull {self._model}`")

    def _handle_tool_calls(self, messages, resp, tools_by_name):
        messages = list(messages)
        messages.append({"role": "assistant", "content": resp.message.content or "",
                          "tool_calls": [{"function": {"name": tc.function.name,
                                                         "arguments": tc.function.arguments}}
                                          for tc in resp.message.tool_calls]})
        for tc in resp.message.tool_calls:
            name = tc.function.name
            args = tc.function.arguments or {}
            tool = tools_by_name.get(name)
            if tool is None:
                messages.append({"role": "tool", "name": name,
                                  "content": json.dumps({"error": f"unknown tool: {name}"})})
                continue
            try:
                result = tool.fn(**args)
            except Exception as e:
                raise ToolExecutionError(stage=self.name,
                                          message=f"tool {name} failed: {e}", cause=e) from e
            messages.append({"role": "tool", "name": name, "content": _stringify(result)})
        return messages


def _stringify(result: Any) -> str:
    if isinstance(result, str):
        return result
    try:
        return json.dumps(result)
    except TypeError:
        return str(result)
