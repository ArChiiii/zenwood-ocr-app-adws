"""FastAPI bootstrap — lifespan brings up Ollama client, PaddleOCR, sweeper."""
from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from ocr_agentic_engine.client import get_ollama_client
from ocr_agentic_engine.router import router as engine_router
from ocr_agentic_engine.sweep import DownloadSweeper

log = logging.getLogger("ocr_agentic_engine")


@asynccontextmanager
async def lifespan(app: FastAPI):
    from paddleocr import PPStructureV3
    app.state.structure = PPStructureV3(
        use_doc_orientation_classify=False, use_doc_unwarping=False,
        use_textline_orientation=False, use_seal_recognition=False,
        use_formula_recognition=False, use_chart_recognition=False,
    )
    app.state.ollama = get_ollama_client()
    app.state.engine_tmp_root = Path(os.getenv("ENGINE_TMP_ROOT", "/tmp/engine-tmp"))
    app.state.engine_downloads_root = Path(os.getenv("ENGINE_DOWNLOADS_ROOT", "/tmp/engine-downloads"))
    app.state.engine_tmp_root.mkdir(parents=True, exist_ok=True)
    app.state.engine_downloads_root.mkdir(parents=True, exist_ok=True)
    app.state.engine_sweeper = DownloadSweeper(app.state.engine_downloads_root)
    app.state.engine_sweeper.start()
    try:
        yield
    finally:
        app.state.engine_sweeper.stop()


app = FastAPI(title="Zentral AI Engine", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o for o in os.getenv("ENGINE_CORS_ORIGINS", "http://localhost:3000").split(",") if o],
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)
app.include_router(engine_router)


@app.get("/health")
def health():
    return {"ok": True}
