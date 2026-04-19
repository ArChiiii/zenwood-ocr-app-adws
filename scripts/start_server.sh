#!/usr/bin/env bash
# Start the ocr-agentic-engine FastAPI server.
# Usage: ./scripts/start_server.sh [extra uvicorn args...]
set -euo pipefail

cd "$(dirname "$0")/.."

HOST="${ENGINE_HOST:-0.0.0.0}"
PORT="${ENGINE_PORT:-8001}"
RELOAD_FLAG="${ENGINE_RELOAD:-1}"

args=(uvicorn ocr_agentic_engine.app:app --host "$HOST" --port "$PORT")
if [[ "$RELOAD_FLAG" == "1" ]]; then
  args+=(--reload)
fi

exec uv run "${args[@]}" "$@"
