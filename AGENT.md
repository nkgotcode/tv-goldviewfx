# AGENT

## Build/Test Commands

- Backend tests: `cd backend && bun test --preload ./tests/setup.ts`
- RL service tests: `cd backend/rl-service && uv run pytest`
- Frontend dev: `cd frontend && bun run dev`
- Convex dev: `npx convex dev`

## Operational Notes

- When adding RL contracts, update both backend (`backend/src/types/rl.ts`) and RL service (`backend/rl-service/src/schemas.py`) in the same change.
- Keep online-learning status payload compatible with `/frontend/src/services/rl_ops.ts` to avoid mission-control drift.
