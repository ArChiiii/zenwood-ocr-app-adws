# Start the application

## Variables

BACKEND_PORT: 8000
FRONTEND_PORT: 3000
BACKEND_SESSION: zentralai-backend
FRONTEND_SESSION: zentralai-frontend

## Workflow

Check to see if processes are already running on ports BACKEND_PORT and FRONTEND_PORT.

### Backend

If a process is already running on port BACKEND_PORT, skip starting the backend.

If there is no process running on port BACKEND_PORT, run these commands:

Run `tmux new-session -d -s BACKEND_SESSION -c "$PWD/backend" 'uv run uvicorn main:app --host 0.0.0.0 --port BACKEND_PORT --reload'`
Run `sleep 3`

### Frontend

If a process is already running on port FRONTEND_PORT, skip starting the frontend.

If there is no process running on port FRONTEND_PORT, run these commands:

Run `tmux new-session -d -s FRONTEND_SESSION -c "$PWD/frontend" 'npm run dev'`
Run `sleep 3`

### Open browser

Run `open http://localhost:FRONTEND_PORT`

Let the user know that the application is running and the browser is open.

To view logs at any time, run:
- Backend: `tmux capture-pane -p -t BACKEND_SESSION`
- Frontend: `tmux capture-pane -p -t FRONTEND_SESSION`
