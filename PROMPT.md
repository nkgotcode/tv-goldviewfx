@prd.md @activity.md

We are building this project according to the PRD in this repo.

First read activity.md to see what was recently accomplished.

## Start the Application

Default start (two terminals):

- Terminal 1 (backend API + worker): `./scripts/daemonize-backend.sh start`
- Terminal 2 (frontend dashboard): `cd frontend && bun install && bun run dev`

Start only the services required for the selected task:

- Backend API only: `cd backend && bun install && bun run dev`
- RL service: `cd backend/rl-service && uv run uvicorn server:app --host 0.0.0.0 --port 9101`
- E2E flow: `./scripts/e2e-local.sh`

If the port is taken, use another port and document it in activity.md.

## Work on Tasks

Open prd.md and find the single highest priority task where `"passes": false`.

Work on exactly ONE task:
1. Implement the change according to the task steps
2. Run any relevant checks for that area

## Verify in Browser

If the task touches UI, use agent-browser to verify:

1. Open the local server URL:
   ```
   agent-browser open http://localhost:3000
   ```

2. Take a snapshot to see the page structure:
   ```
   agent-browser snapshot -i -c
   ```

3. Take a screenshot for visual verification:
   ```
   agent-browser screenshot screenshots/[task-name].png
   ```

4. Check for console errors or layout issues

If browser verification is not applicable, state why in activity.md.

## Log Progress

Append a dated progress entry to activity.md describing:
- What you changed
- What commands you ran
- Verification results (tests/URLs/screenshots)
- Any issues encountered and how you resolved them

## Update Task Status

When the task is confirmed working, update that task's `"passes"` field in prd.md
from `false` to `true`.

## Commit Changes

Make one git commit for that task only with a clear, descriptive message:
```
git add .
git commit -m "feat: [brief description of what was implemented]"
```

Do NOT run `git init`, do NOT change git remotes, and do NOT push.

## Important Rules

- ONLY work on a SINGLE task per iteration
- Always verify UI changes in a browser before marking a task as passing
- Always log your progress in activity.md
- Always commit after completing a task

## Completion

When ALL tasks have `"passes": true`, output:

<promise>COMPLETE</promise>
