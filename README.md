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

## Design decisions

- **PostgreSQL**, not a document store: the data (users, projects, tasks,
  dependencies) is relational and benefits from foreign keys and constraints.
- **Optimistic concurrency** (a `version` column) instead of row locking: simple,
  no locks held while a user is thinking, explicit 409 conflicts.
- **Redis pub/sub** so the API stays stateless and horizontally scalable — any
  instance can publish an event and every instance forwards it to its own
  WebSocket clients.
- **Scheduling logic as a pure function** (`computeSchedule`), independent of the
  web framework, so it is trivial to unit test.

## Status

Steps 1-8 are done: scope defined, infra scaffolded, the database designed,
authentication (register/login/logout/me), projects and permissions
(roles, membership, last-owner protection), tasks and dependencies (CRUD,
cycle/cross-project rejection), the CPM scheduling engine, and the React
frontend (login/register, project list, board with inline-editable task
table, dependencies, Gantt view with critical tasks highlighted, read-only
viewer mode). Next up is Step 9 (real-time updates) — see
[`docs/ai-build-guide.md`](docs/ai-build-guide.md).
