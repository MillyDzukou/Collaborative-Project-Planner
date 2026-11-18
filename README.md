# Collaborative Project Planner

A real-time collaborative project planner: teams create tasks and dependencies, the
app computes the critical path, and every change appears live on teammates' screens.

Full build plan, data model and concept glossary: see
`Collaborative Planner Build Guide.docx` (kept local, not committed) and
[`docs/ai-build-guide.md`](docs/ai-build-guide.md) for how each step is built with
Claude Code.

## User stories

1. As a new user, I can register an account and log in, so that my projects are
   private to me and my team.
2. As a project owner, I can create a project, so that I have a dedicated space
   to plan it with my team.
3. As a project owner, I can invite a teammate and give them a role (editor or
   viewer), so that I control who can change the plan.
4. As an editor, I can add tasks to a project with a name and duration, so that
   the plan reflects the real work breakdown.
5. As an editor, I can define dependencies between tasks, so that the schedule
   respects the real order of work.
6. As a project member, I can view the computed critical path and project
   duration, so that I know which tasks can't slip without delaying the project.
7. As a project member, I can see teammates' changes appear live on my screen,
   so that we can plan together without refreshing or overwriting each other's
   edits.
8. As a viewer, I can read a project's tasks and schedule but not edit them, so
   that stakeholders can follow progress without risking the plan.

## MVP and non-goals

**In scope for v1:** register and log in; create projects; invite members with
a role; add tasks and dependencies; view the critical path; see live updates
from teammates.

**Explicitly not in v1:** email notifications, file uploads, a mobile app,
resource levelling. These are cut so the MVP can actually ship — revisit only
after the MVP above is deployed.

## Tech stack

| Layer     | Choice                                    |
|-----------|--------------------------------------------|
| Frontend  | React + Vite + TypeScript                  |
| Backend   | Express + TypeScript                       |
| Database  | PostgreSQL                                 |
| Messaging | Redis (pub/sub for WebSocket fan-out)      |
| Runtime   | Docker / Docker Compose                    |

## Quick start

Requires only Docker.

```bash
cp .env.example .env
docker compose up --build
```

- API: http://localhost:4000/health
- Web: http://localhost:5173

That's the whole setup — one command, no local Node/Postgres/Redis install required.
Stop with `Ctrl+C`, tear down with `docker compose down` (add `-v` to also drop
database/redis volumes).

## Folder structure

```
.
├── docker-compose.yml       # postgres, redis, api, web — one-command dev environment
├── .env.example              # copy to .env
├── api/                       # Express + TypeScript backend
│   ├── src/
│   │   ├── server.ts          # app setup, middleware, error handler
│   │   ├── config.ts          # typed environment variables
│   │   ├── db/                # pg pool, redis client, migration runner
│   │   ├── auth/               # routes, middleware, password hashing      (Step 4)
│   │   ├── projects/           # routes, service, permission checks        (Step 5)
│   │   ├── tasks/               # routes, service, dependency rules         (Step 6)
│   │   ├── scheduling/          # computeSchedule.ts — pure CPM logic        (Step 7)
│   │   └── realtime/            # WebSocket setup, Redis pub/sub            (Step 9)
│   ├── migrations/              # versioned SQL migrations                  (Step 3)
│   ├── tests/                   # unit + integration tests                  (Step 12)
│   └── Dockerfile               # multi-stage: dev / build / prod
├── web/                        # React + Vite frontend
│   ├── src/
│   │   ├── pages/               # login, project list, project board        (Step 8)
│   │   ├── components/
│   │   ├── hooks/                # React Query hooks, websocket hook
│   │   └── api/                  # typed API client
│   ├── e2e/                      # Playwright tests                          (Step 12)
│   └── Dockerfile
└── docs/
    ├── ai-build-guide.md        # how to build each step with Claude Code
    ├── architecture.md          # system diagram + design decisions
    └── decisions/                # architecture decision records
```

## Database

Migrations live in `api/migrations/` (versioned SQL, run with
[`node-pg-migrate`](https://github.com/salsita/node-pg-migrate)). Entity
relationship diagram: [`docs/er-diagram.md`](docs/er-diagram.md).

```bash
cd api
npm install
DATABASE_URL=postgres://planner:planner@localhost:5432/planner npm run migrate:up
DATABASE_URL=postgres://planner:planner@localhost:5432/planner npm run seed
```

(When running inside Docker Compose, `DATABASE_URL` is already set on the `api`
container — these commands are for running migrations from the host.)

## Real-time

After each successful write the API publishes `{type, projectId, payload, version}`
to the Redis channel `project:<id>`; every API instance subscribes to the
channels of its connected clients and forwards messages over WebSocket. To prove
fan-out across instances:

```bash
docker compose --profile scale up -d api2     # second API on :4001
cd api && node scripts/fanout-check.mjs       # writes via :4000, listens on :4001
```

## Tests and CI

| Layer | Tool | Run |
|-------|------|-----|
| API unit + integration (real Postgres/Redis) | Vitest + supertest | `cd api && npm test` (use the `planner_test` DB, see `CLAUDE.md`) |
| WebSocket integration | Vitest + ws | included in `npm test` |
| Lint / type-check | ESLint, `tsc` | `npm run lint`, `npx tsc --noEmit` in `api/` and `web/` |
| End-to-end (browser) | Playwright | `cd web && npm run e2e` against the running stack (see `web/e2e/README.md`) |

GitHub Actions (`.github/workflows/ci.yml`) runs on every push to `main` and every
PR: API (lint, type-check, migrate, test, build, prod `npm audit`), web (lint,
build), then e2e (brings the stack up with Docker Compose and runs Playwright).
A CI status badge will be added once the repository has a GitHub remote.

## API hardening

- **Rate limiting:** 600 requests/min/IP globally (`RATE_LIMIT_GLOBAL`); `POST /auth/login` allows 10
  *failed* attempts per 15 min (successes don't count); `POST /auth/register`
  10/hour. Over the limit → `429 rate_limited`. Set `TRUST_PROXY` to the number
  of reverse-proxy hops when deployed so the real client IP is used.
- **Headers/CORS:** `helmet` defaults; CORS and the WebSocket `Origin` check use
  the `WEB_ORIGIN` allow-list (comma-separated), nothing else.
- **Errors:** every failure is `{ error: { code, message } }` from one central
  handler; 5xx never leaks internals. Malformed JSON → 400, oversized body
  (>100 kb) → 413, unknown route → 404.
- **Validation:** all inputs validated with length caps (names ≤ 200 chars,
  descriptions ≤ 5000, passwords ≤ 128 to bound argon2 work, …).
- **Logging:** structured `pino` JSON logs, one line per request with a request
  id (`X-Request-Id`, echoed back; a safe caller-supplied id is honoured).
  Cookies and auth headers are redacted. `LOG_LEVEL` controls verbosity.
- **Pagination:** list endpoints (`/projects`, `/projects/:id/tasks`,
  `/projects/:id/members`) accept `?limit=` (default 50, max 200) and
  `?offset=` and return `page: { limit, offset, total }`. The web app follows
  pages automatically.
- **Shutdown:** `SIGTERM`/`SIGINT` stop accepting connections, close WebSockets,
  drain in-flight requests, then close Postgres and Redis (10 s hard limit).
- **Secrets:** the API refuses to start in production with the default
  `JWT_SECRET`.
- **Dependencies:** `npm audit --omit=dev` is clean (zod upgraded to 4.x). The
  remaining advisories are dev-only tooling (vitest/vite/esbuild).

## Design decisions

- **PostgreSQL**, not a document store: the data (users, projects, tasks,
  dependencies) is relational and benefits from foreign keys and constraints.
- **Optimistic concurrency** (a `version` column) instead of row locking or CRDTs.
  Every `PATCH /tasks/:id` carries the `version` the client last saw, and the
  write is one atomic statement: `UPDATE tasks SET ..., version = version + 1
  WHERE id = $1 AND version = $2`. Zero rows updated means someone else got
  there first, so the API answers `409 version_conflict` with the task's current
  state and the UI offers "reapply my change" or "keep their version". Row
  locks would be held for as long as a person thinks (or abandoned when a tab
  closes), and a lost update is exactly what they exist to prevent but at a
  cost we don't need: conflicts on a task row are rare and cheap to resolve by
  hand. CRDTs would merge concurrent edits automatically, but that machinery
  (and its unintuitive merges, e.g. two people renaming the same task) is
  overkill for small, field-level edits where a human is better placed to pick
  the winner. The trade-off: a losing writer has to retry. A test fires ten
  simultaneous updates from the same version and asserts exactly one succeeds.
- **Redis pub/sub** so the API stays stateless and horizontally scalable — any
  instance can publish an event and every instance forwards it to its own
  WebSocket clients.
- **Scheduling logic as a pure function** (`computeSchedule`), independent of the
  web framework, so it is trivial to unit test.

## Status

Steps 1-11 are done: scope defined, infra scaffolded, the database designed,
authentication (register/login/logout/me), projects and permissions
(roles, membership, last-owner protection), tasks and dependencies (CRUD,
cycle/cross-project rejection), the CPM scheduling engine, the React
frontend (login/register, project list, board with inline-editable task
table, dependencies, Gantt view with critical tasks highlighted, read-only
viewer mode), and real-time updates (cookie-authenticated WebSocket at
`/ws?projectId=N`, members-only rooms, Redis pub/sub fan-out), and edit-conflict
handling (versioned PATCH, 409 with current state, reapply/keep UI), and API
hardening (see below). Step 12 (tests and CI) is done locally: 87 API
unit/integration tests, 5 Playwright e2e flows (green on three consecutive runs),
ESLint, and a GitHub Actions workflow (not yet run: the repo has no GitHub remote,
so the CI badge is still to add). Next up is Step 13 (load testing) — see
[`docs/ai-build-guide.md`](docs/ai-build-guide.md).
