import os
import time
from pathlib import Path

from ocr_agentic_engine.sweep import DownloadSweeper, sweep_once


def _touch_old(path: Path, hours: float):
    path.mkdir(parents=True, exist_ok=True); (path / "f").write_bytes(b"x")
    t = time.time() - hours * 3600
    os.utime(path, (t, t)); os.utime(path / "f", (t, t))


def test_sweep_removes_old_leaves_fresh(tmp_path, monkeypatch):
    monkeypatch.setenv("ENGINE_DOWNLOAD_TTL_HOURS", "24")
    _touch_old(tmp_path / "old", 25)
    _touch_old(tmp_path / "new", 1)
    sweep_once(tmp_path)
    assert not (tmp_path / "old").exists()
    assert (tmp_path / "new").exists()


def test_sweeper_start_stop(tmp_path):
    s = DownloadSweeper(tmp_path, interval_seconds=0.01)
    s.start(); time.sleep(0.05); s.stop()
    assert not s._timer.is_alive()
