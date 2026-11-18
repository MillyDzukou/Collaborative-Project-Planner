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

Lint with `npm run lint` in `api/` and `web/`; CI runs lint, type-check, tests and build.
E2E: `cd web && npm run e2e` (needs the stack up; `POST /auth/register` is limited to
10/hour/IP, so restart the `api` container if you hit 429 during repeated runs).

## Conventions

- API errors use `{ error: { code, message } }`; request bodies use camelCase unless an
  existing endpoint says otherwise (task create/update use `duration_weeks`, `assignee_id`).
- Throw `HttpError` (or let errors propagate); never write per-router error handlers — the
  central `errorHandler` in `api/src/http/errorHandler.ts` formats everything.
- New list endpoints must paginate with `parsePagination` and return `page: {limit, offset, total}`.
- Log with `req.log` / `logger` (pino), never `console.log`.
- Scheduling logic stays a pure function in `api/src/scheduling/computeSchedule.ts`.

## Load testing

`load/README.md` has the k6 workflow. The load stack is a separate compose project (`-p planner-load`, ports
4100/5433/6380, `docker-compose.load.yml`, production API image). Never run `load/seed-bulk.sql` against the dev DB.
When adding a query that filters on a column not covered by an index, check it with `EXPLAIN ANALYZE` (`load/explain.sql`).

## Production rehearsal / deploy

`docker-compose.prod.yml` runs the production images locally (http://localhost:8080, needs `JWT_SECRET` and
`POSTGRES_PASSWORD` in the environment; separate project `planner-prod`). The web image proxies `/api` to the API, so
production builds use `VITE_API_URL=/api`. Keep `prod` as the LAST stage of both Dockerfiles. Never put real
secrets, hosting credentials or tokens in the repo; real deployment steps (accounts, secrets, DNS) are the user's — see `docs/deployment.md`.
