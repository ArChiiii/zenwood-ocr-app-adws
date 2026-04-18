"""downloads_root sweeper — 24h default TTL (spec §6.3)."""
from __future__ import annotations

import os
import shutil
import threading
import time
from pathlib import Path


def _ttl_seconds() -> float:
    return float(os.getenv("ENGINE_DOWNLOAD_TTL_HOURS", "24")) * 3600


def sweep_once(downloads_root: Path) -> None:
    if not downloads_root.exists():
        return
    cutoff = time.time() - _ttl_seconds()
    for child in downloads_root.iterdir():
        if not child.is_dir():
            continue
        try:
            if child.stat().st_mtime < cutoff:
                shutil.rmtree(child, ignore_errors=True)
        except FileNotFoundError:
            continue


class DownloadSweeper:
    def __init__(self, downloads_root: Path, interval_seconds: float = 3600.0):
        self.downloads_root = downloads_root
        self.interval = interval_seconds
        self._stopped = threading.Event()
        self._lock = threading.Lock()
        self._timer = threading.Timer(self.interval, self._tick)

    def _tick(self):
        if self._stopped.is_set():
            return
        try:
            sweep_once(self.downloads_root)
        finally:
            with self._lock:
                if not self._stopped.is_set():
                    self._timer = threading.Timer(self.interval, self._tick)
                    self._timer.daemon = True
                    self._timer.start()

    def start(self):
        self._timer.daemon = True
        self._timer.start()

    def stop(self):
        self._stopped.set()
        with self._lock:
            self._timer.cancel()
        # Wait for any in-flight _tick thread to fully exit.
        self._timer.join(timeout=2.0)
