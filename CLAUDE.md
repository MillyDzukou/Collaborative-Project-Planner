# Collaborative Project Planner

Build plan: `docs/ai-build-guide.md`. Overview and status: `README.md`.

## Workflow rules

- **Every build step is done in its own git worktree, named after the step** — e.g.
  `step-8-frontend`, `step-9-realtime`, `step-10-conflicts`. Use `EnterWorktree` with
  that name, commit on the worktree branch, then merge into `main` with `--no-ff`.
- Update the README "Status" section when a step is finished.
- End commit messages with the `Co-Authored-By` line given by the harness.

## Running the app

`docker compose up --build -d`, then `docker compose exec -T api npm run migrate:up`.
Web: http://localhost:5173, API: http://localhost:4000/health. If dependencies change and
the containers can't find a package, remove the stale `api_node_modules` /
`web_node_modules` volumes (not `postgres_data`) and rebuild.

## Running API tests

Integration tests TRUNCATE tables, so never point them at the dev database. Use the
separate `planner_test` DB (create once with
`docker exec collaborativeprojectplanner-postgres-1 psql -U planner -d planner -c "CREATE DATABASE planner_test"`):

```bash
cd api
export DATABASE_URL=postgres://planner:planner@localhost:5432/planner_test REDIS_URL=redis://localhost:6379 NODE_ENV=test
npm run migrate:up && npx vitest run
```

## Conventions

- API errors use `{ error: { code, message } }`; request bodies use camelCase unless an
  existing endpoint says otherwise (task create/update use `duration_weeks`, `assignee_id`).
- Throw `HttpError` (or let errors propagate); never write per-router error handlers — the
  central `errorHandler` in `api/src/http/errorHandler.ts` formats everything.
- New list endpoints must paginate with `parsePagination` and return `page: {limit, offset, total}`.
- Log with `req.log` / `logger` (pino), never `console.log`.
- Scheduling logic stays a pure function in `api/src/scheduling/computeSchedule.ts`.
