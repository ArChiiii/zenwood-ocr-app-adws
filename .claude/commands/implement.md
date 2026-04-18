# Implement the following plan
Follow the `Instructions` to implement the `Plan` then `Report` the completed work.

## Instructions
- Read the plan, think hard about the plan and implement the plan.
- For backend changes (Python/FastAPI), ensure code works with `uv run` from the `backend/` directory.
- For frontend changes (Next.js), ensure code works with `npm` from the `frontend/` directory.
- Run relevant tests after implementation to verify correctness.

## Plan
$ARGUMENTS

## Verification
- **Backend tests**: `cd backend && uv run pytest -x -q`
- **Frontend lint**: `cd frontend && npx @biomejs/biome check .`
- **Frontend types**: `cd frontend && npx tsc --noEmit`
- **Frontend build**: `cd frontend && npm run build`
- Run only the checks relevant to the changes made.

## Report
- Summarize the work you've just done in a concise bullet point list.
- Report the files and total lines changed with `git diff --stat`
