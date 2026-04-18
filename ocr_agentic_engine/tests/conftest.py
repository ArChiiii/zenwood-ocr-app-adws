import os
import pytest


@pytest.fixture(autouse=True)
def _isolate_env(tmp_path, monkeypatch):
    monkeypatch.setenv("ENGINE_OCR_CACHE", "0")
    monkeypatch.setenv("ENGINE_OCR_CACHE_DIR", str(tmp_path / "ocr-cache"))
    monkeypatch.setenv("ENGINE_TMP_ROOT", str(tmp_path / "tmp"))
    monkeypatch.setenv("ENGINE_DOWNLOADS_ROOT", str(tmp_path / "dl"))
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "test-secret")
    yield
