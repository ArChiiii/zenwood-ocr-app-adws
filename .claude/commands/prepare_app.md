# Prepare Application

Set up the application for review or test in **remote-backend + local-frontend** mode. The `ocr_agentic_engine` server runs on a remote host (see `frontend/.env.local::NEXT_PUBLIC_ENGINE_URL`); only the Next.js frontend runs locally.

## Variables

FRONTEND_PORT: 3000
FRONTEND_SESSION: zenwood-ocr-frontend

## Setup

- Read `README.md`, `frontend/README.md`, and `scripts/README.md` for context on architecture and the remote engine HTTP surface.
- Confirm `frontend/.env.local` exists and contains:
  - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase auth
  - `NEXT_PUBLIC_ENGINE_URL` — remote `ocr_agentic_engine` base URL (e.g. `http://<host>:8001`)
  - If missing, copy from `frontend/.env.local.example` and fill in values.
- Verify the remote engine is reachable: `curl -fsS "$NEXT_PUBLIC_ENGINE_URL/health"` should return `{"ok": true}`. If unreachable, stop and report — do NOT attempt to start a local engine (GPU / PaddleOCR are required).
- Install frontend deps if `frontend/node_modules` is missing: `cd frontend && npm install`.
- There is no local database to reset — uploads / downloads are handled server-side by the remote engine (`ENGINE_TMP_ROOT`, `ENGINE_DOWNLOADS_ROOT`).
- Start the frontend on FRONTEND_PORT via the `/start_remote` command (or see that command's body for manual steps). The command is idempotent — if a process is already bound to FRONTEND_PORT it skips the spawn.
- After the frontend is up, run `open http://localhost:FRONTEND_PORT` before executing test steps.
