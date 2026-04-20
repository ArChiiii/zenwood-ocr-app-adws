# Start Frontend (Remote Backend)

Start the local Next.js frontend. The `ocr_agentic_engine` backend runs on a remote host — this command does NOT touch the backend.

## Variables

FRONTEND_PORT_PREFERRED: 3000
FRONTEND_PORT_FALLBACKS: 3001 3002 3003
FRONTEND_SESSION: zenwood-ocr-frontend
FRONTEND_PORT: (resolved at runtime — see step 2)

## Workflow

### 1. Verify engine reachability

- Read `NEXT_PUBLIC_ENGINE_URL` from `frontend/.env.local`.
- Run `curl -fsS --max-time 8 "$NEXT_PUBLIC_ENGINE_URL/health"`. Expect `{"ok": true}`.
- If it fails, stop and report the URL + error. Do NOT spawn a local engine — PaddleOCR-GPU + Ollama (with `qwen2.5vl:7b`, `llama3.1:8b` pulled) are required, and remote/dedicated hosting is the intentional setup. Ask the user to bring the engine host online (or run `tailscale up`) before retrying.

### 2. Frontend (local, always in tmux)

- The frontend MUST run inside a named tmux session (`FRONTEND_SESSION`) so both the user and Claude can attach/inspect logs later. Never use `nohup`, `&`, or `npm run dev` in the foreground.
- Set `FRONTEND_PORT = FRONTEND_PORT_PREFERRED` (3000) initially.

#### 2a. Reuse existing session if alive

- `tmux has-session -t FRONTEND_SESSION 2>/dev/null` AND `curl -fsS "http://localhost:FRONTEND_PORT" > /dev/null` both succeed → reuse, skip to step 3.
- Session exists but port dead → `tmux kill-session -t FRONTEND_SESSION` and continue.

#### 2b. Resolve port conflict (interactive)

- Run `lsof -i :FRONTEND_PORT -sTCP:LISTEN -P -n`. If something is bound:
  - Identify the holder (`COMMAND` + `PID`).
  - **Stop and ask the user** to choose one of:
    1. **Kill it and use port 3000** — run `kill <PID>` (or `kill -9 <PID>` if it doesn't exit in 2s), then re-check the port is free. Warn if the holder is a user-facing app (e.g. `Cursor`, `Chrome`, `Code`) — killing may close the editor.
    2. **Use a fallback port** from `FRONTEND_PORT_FALLBACKS` (3001, 3002, 3003) — pick the first one whose `lsof` is empty. Set `FRONTEND_PORT` to that value.
    3. **Abort** — exit and let the user resolve manually.
  - Do NOT auto-kill. Do NOT auto-fallback. Wait for explicit choice.
- After resolution, confirm `lsof -i :FRONTEND_PORT -sTCP:LISTEN -P -n` is empty before continuing.

#### 2c. Spawn the session

- `tmux new-session -d -s FRONTEND_SESSION -c "$PWD/frontend" -e "PORT=$FRONTEND_PORT" 'npm run dev'`
- `sleep 3`
- Confirm readiness: `curl -fsS "http://localhost:FRONTEND_PORT" > /dev/null`. If it fails, dump `tmux capture-pane -p -t FRONTEND_SESSION` and surface the error.

#### 2d. CORS warning (non-3000 only)

- If `FRONTEND_PORT != 3000`, remind the user: the remote engine's `ENGINE_CORS_ORIGINS` likely whitelists only `http://localhost:3000`. Browser requests will be blocked until they add `http://localhost:<FRONTEND_PORT>` to that env on the remote host.

### 3. Open browser

- Run `open http://localhost:FRONTEND_PORT`.
- Tell the user the frontend is running locally and is wired to the remote engine at `NEXT_PUBLIC_ENGINE_URL` (from `frontend/.env.local`).

## Logs & control

- Frontend logs: `tmux capture-pane -p -t FRONTEND_SESSION`
- Stop frontend: `tmux kill-session -t FRONTEND_SESSION`
- Remote engine is managed separately on the remote host — out of scope for this command.

## Notes

- Per-request auth uses Supabase JWT; the frontend forwards it to the engine. If engine calls return 401, re-check `NEXT_PUBLIC_SUPABASE_*` in `frontend/.env.local` and that `SUPABASE_JWT_SECRET` on the remote engine matches the same Supabase project.
- CORS: the remote engine must include the local frontend origin in `ENGINE_CORS_ORIGINS` (default `http://localhost:3000`). If browser requests are blocked, update that env var on the remote host.
