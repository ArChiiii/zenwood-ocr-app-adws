from ocr_agentic_engine.errors import (
    AgentOutputError, EngineError, FormatterError, InputValidationError,
    ModelUnavailableError, OCRError, ToolExecutionError,
)


def test_engine_error_carries_stage_and_cause():
    cause = ValueError("bad")
    e = EngineError(stage="extractor", message="nope", cause=cause)
    assert e.stage == "extractor" and e.cause is cause and "nope" in str(e)


def test_all_subclasses_inherit_engine_error():
    for cls in (OCRError, AgentOutputError, ModelUnavailableError,
                 ToolExecutionError, FormatterError, InputValidationError):
        assert issubclass(cls, EngineError)


def test_cause_defaults_to_none():
    assert ModelUnavailableError(stage="x", message="m").cause is None
