# Install & Prime

## Read
backend/.env.example (never read .env)
frontend/.env.local.example (never read .env.local)

## Read and Execute
.claude/commands/prime.md

## Run
- Think through each of these steps to make sure you don't miss anything.
- Install backend dependencies: `cd backend && uv sync`
- Install frontend dependencies: `cd frontend && npm install`
- Copy env files if they don't already exist:
  - `cp -n backend/.env.example backend/.env`
  - `cp -n frontend/.env.local.example frontend/.env.local`

## Report
- Output the work you've just done in a concise bullet point list.
- Instruct the user to fill out `backend/.env` based on `backend/.env.example` (Supabase JWT secret, LLM provider config).
- Instruct the user to fill out `frontend/.env.local` based on `frontend/.env.local.example` (Supabase URL, anon key, backend URL).
- Mention the frontend URL: http://localhost:3000
- Mention the backend API URL: http://localhost:8000
- Mention: Ollama must be running locally if using `LLM_PROVIDER=ollama` (default). Start it with `ollama serve` if not already running.
- Mention: 'To setup your AFK Agent, be sure to update the remote repo url and push to a new repo so you have access to git issues and git prs:
  ```
  git remote add origin <your-new-repo-url>
  git push -u origin main
  ```'
- Mention: If you want to upload images to github during the review process setup cloudflare for public image access you can setup your cloudflare environment variables. See .env.example for the variables.
