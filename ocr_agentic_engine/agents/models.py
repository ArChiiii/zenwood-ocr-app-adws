"""Per-agent default model names + env override (spec §5.3)."""
from __future__ import annotations

import json
import os

AGENT_MODELS: dict[str, str] = {
    "extractor":            "qwen2.5vl:7b",
    "classifier":           "qwen2.5vl:7b",
    "comparator":           "llama3.1:8b",
    "handwriting_detector": "qwen2.5vl:7b",
}


def agent_model(name: str) -> str:
    raw = os.getenv("ENGINE_MODELS_JSON")
    if raw:
        try:
            overrides = json.loads(raw)
            if name in overrides:
                return str(overrides[name])
        except json.JSONDecodeError:
            pass
    return AGENT_MODELS[name]
