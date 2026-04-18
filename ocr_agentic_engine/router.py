"""POST /engine/{feature} + GET /engine/downloads/{run_id}/{filename} (spec §6.3)."""
from __future__ import annotations

import shutil
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from starlette.background import BackgroundTask

from ocr_agentic_engine.auth import get_current_user
from ocr_agentic_engine.engine import Engine
from ocr_agentic_engine.renderers import REGISTRY as _RENDERERS

router = APIRouter(prefix="/engine", tags=["engine"])

_ALLOWED = {"scan_conversion", "classification", "comparison", "handwriting_removal"}
_FORMATS = set(_RENDERERS.keys())  # pdf, docx, txt, html, xlsx, pptx


@router.post("/{feature}")
async def run_engine(
    feature: str,
    request: Request,
    files: list[UploadFile],
    user: Annotated[dict, Depends(get_current_user)],
    format: str = Query(default="pdf"),
    model: str | None = Query(default=None),
):
    if feature not in _ALLOWED:
        raise HTTPException(status_code=404, detail=f"unknown feature: {feature}")
    if format not in _FORMATS:
        raise HTTPException(status_code=400, detail=f"unknown format: {format}")
    if feature == "comparison" and len(files) != 2:
        raise HTTPException(status_code=400, detail="comparison requires exactly 2 files")
    if feature != "comparison" and len(files) != 1:
        raise HTTPException(status_code=400, detail=f"{feature} requires exactly 1 file")

    tmp_root: Path = request.app.state.engine_tmp_root
    downloads_root: Path = request.app.state.engine_downloads_root
    upload_stash = tmp_root / "_uploads"; upload_stash.mkdir(parents=True, exist_ok=True)

    saved: list[Path] = []
    for idx, uf in enumerate(files):
        target = upload_stash / f"{id(uf)}_{idx}_{uf.filename or 'input'}"
        target.write_bytes(await uf.read())
        saved.append(target)

    overrides = {feature: model} if model and feature != "scan_conversion" else None
    engine = Engine(
        ollama=request.app.state.ollama,
        tmp_root=tmp_root, downloads_root=downloads_root,
        structure=request.app.state.structure,
        model_overrides=overrides,
    )

    def _stream():
        try:
            yield from engine.run(feature, saved, {"format": format})  # type: ignore[arg-type]
        finally:
            for p in saved:
                p.unlink(missing_ok=True)

    return StreamingResponse(_stream(), media_type="text/event-stream")


@router.get("/downloads/{run_id}/{filename}")
def download(run_id: str, filename: str, request: Request,
              user: Annotated[dict, Depends(get_current_user)]):
    downloads_root: Path = request.app.state.engine_downloads_root
    run_dir = downloads_root / run_id
    file_path = run_dir / filename
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="not found")
    return FileResponse(
        str(file_path), filename=filename,
        background=BackgroundTask(lambda: shutil.rmtree(run_dir, ignore_errors=True)),
    )
