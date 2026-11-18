# Building this project with Claude Code

This maps the 16 steps from `Collaborative Planner Build Guide.docx` onto concrete
Claude Code workflows. The project itself is a learning vehicle for three things
beyond the web app: **MCP servers**, **git worktrees**, and **multi-agent
orchestration**. Each step below says whether to use a single plain session, a
subagent fan-out, a worktree, or an MCP server — and why.

Do the steps in order. Don't start the frontend (Step 8) before the API tests
pass, and don't deploy (Step 14) before CI (Step 12) is green.

## The three concepts, in context

**MCP servers** give Claude direct, structured access to a running system instead
of you copy-pasting output back and forth. Two are worth connecting here:
- A **Postgres MCP server** (e.g. `@modelcontextprotocol/server-postgres` pointed
  at `postgres://planner:planner@localhost:5432/planner`) lets Claude inspect
  schema, run read queries, and sanity-check migrations directly — used from
  Step 3 onward.
- A **Playwright/browser MCP server** lets Claude drive a real browser against
  the running `web` container — used from Step 8 (manual exploration) and
  Step 12 (writing e2e tests against real behavior, not guessed selectors).

Connect these once with `claude mcp add`, then `ToolSearch` surfaces their tools
on demand — you don't need to keep them loaded all session.

**Worktrees** (`EnterWorktree` / `Agent` with `isolation: "worktree"`) let you run
two Claude Code sessions against the same repo on different branches at once,
each with its own checkout, without them stepping on each other's uncommitted
files. Use them when two chunks of work are genuinely independent and you want
to parallelize instead of context-switching serially. This guide flags the two
places that fits best: Step 6+7 (tasks API vs. scheduling engine) and Step 9
(running two API instances to prove pub/sub fan-out).

**Subagents** (the `Agent` tool, `fork`, and the built-in `/code-review` /
`/security-review` skills) are for fanning work out within one branch — writing
a test matrix in parallel with implementation, or getting an independent
adversarial review before you trust a sensitive piece of code (auth, permission
checks, the concurrency-control query).

---

## Step 1 — Define the scope
**When:** Week 1. **Mode:** plain session, no tools beyond file edits.

Ask Claude to turn the docx's MVP/non-goals list into the README directly:

> Read `Collaborative Planner Build Guide.docx` section 1 and write 6-8 user
> stories plus an MVP/non-goals list into README.md, in the style of "As a
> project owner, I can invite a teammate and give them edit access."

Done when the README has user stories, MVP list, and non-goals, and you've
agreed not to add features until the MVP is deployed.

## Step 2 — Repository and tooling

Already done by this scaffold: `docker-compose.yml`, `api/`, `web/`, strict
TypeScript, `.env.example`, a working `GET /health`. Confirm with:

```bash
docker compose up --build
curl http://localhost:4000/health
```

If you want to learn the MCP setup flow now rather than later, this is a good
moment to add the Postgres MCP server, since Postgres is already running.

## Step 3 — Design the database
**Mode:** plain session + **Postgres MCP** to verify.

> Add `node-pg-migrate` to `api/`. Write migration 001 creating `users`,
> `projects`, `project_members`, `tasks`, `task_dependencies` per the schema in
> the build guide section 3: primary keys, foreign keys, `NOT NULL`, unique
> constraints (unique email; unique `(project_id, user_id)`; unique
> `(task_id, depends_on_task_id)`), a check constraint rejecting self-dependency,
> and indexes on foreign keys.

Then, with the Postgres MCP server connected, ask Claude to run the migration
against the live `postgres` container and inspect the resulting schema
(`\d+ tasks`, confirm constraints) instead of trusting the SQL by eye. Also ask
for a seed script and a Mermaid ER diagram for the README.

Done when migrations run on an empty database, roll back cleanly, and the ER
diagram is committed.

## Step 4 — Authentication
**Mode:** plain session, then `/security-review` before moving on.

> Implement `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`,
> `GET /auth/me` in `api/src/auth/`. Validate input with zod (valid email,
> password ≥ 10 chars). Hash with argon2. Issue a short-lived JWT in an
> httpOnly, secure cookie. Add middleware that reads the cookie and attaches
> the user to the request. Return the same generic error for wrong email vs.
> wrong password.

Write the test list yourself or hand it to Claude: register, duplicate email,
successful login, wrong password, protected route without a token (401).

Before moving to Step 5, run `/security-review` on the auth code specifically —
this is exactly the dual-use, credential-handling surface that skill exists for.
Done when all auth tests pass and `users` only ever stores password hashes.

## Step 5 — Projects and permissions
**Mode:** subagent fan-out for the test matrix.

> Implement project CRUD and member endpoints (invite, list, change role,
> remove) in `api/src/projects/`. Three roles: owner, editor, viewer. Put the
> rule in one function `canPerform(role, action)` in the service layer, called
> on every request — never rely on the UI hiding buttons. Return 404 (not 403)
> for projects the user isn't a member of.

This step has a precisely enumerable test matrix (viewer can't edit, non-member
can't read, owner can remove a member, last owner can't be removed). That's a
good fit for a single `Agent` call dedicated to writing the matrix while you
review the `canPerform` implementation yourself — or use `/code-review` after,
pointed specifically at `canPerform` and every route that calls it.

Done when the full permission test matrix passes.

## Steps 6 & 7 — Tasks/dependencies and the scheduling engine
**Mode:** two parallel **worktrees** — this is the clearest parallelization
point in the whole project, since the two pieces barely touch.

- Worktree A: `api/src/tasks/` — CRUD, finish-to-start dependencies, cycle
  detection (DFS or Kahn's algorithm) rejecting with 422, cross-project
  dependency rejection, wrapped in a DB transaction.
- Worktree B: `api/src/scheduling/computeSchedule.ts` — a **pure function**,
  no DB or HTTP import. Forward pass (ES/EF), backward pass (LS/LF), float,
  critical flag. Unit-test a simple chain, parallel branches, a diamond, then
  your ENGG 684 30-task network — must reproduce the 34-week duration and the
  three known critical paths.

```
EnterWorktree  # or: Agent({ isolation: "worktree", prompt: "..." })
```

Run both, merge each back to `main` when its tests pass, then wire
`GET /projects/:id/schedule` to call `computeSchedule`. Done when invalid
dependency cases are rejected, the cycle/self-dependency/cross-project tests
pass, and the scheduler reproduces your 34-week coursework result.

## Step 8 — Frontend
**Mode:** plain session; optionally the **Playwright MCP server** for manual
exploration as you go instead of only eyeballing it yourself.

> Build the React app in `web/src`: routes for login, project list, project
> board. React Query for server state. A task table with inline editing, a
> Gantt-style bar view using ES/duration from the schedule endpoint,
> highlighting critical tasks. Loading/empty/error states. Mobile-usable layout.

Done when, in a browser, you can register, create a project, add tasks and
dependencies, and see the critical path.

## Step 9 — Real-time updates
**Mode:** plain session for implementation; a second **worktree** (or just a
second terminal) to run two API instances and prove horizontal scaling.

> Add WebSockets (`ws` or socket.io) to the API, authenticated with the same
> cookie as REST. Join a room named after the project, only for members. After
> each successful write, publish `{type, projectId, payload, version}` to a
> Redis channel named for the project; every API instance subscribes and
> forwards to its own connected clients.

To actually test fan-out: run two `api` containers on different ports (scale
the compose service, or run a second instance from a worktree checkout), open
two browsers against different instances, edit in one, confirm the other
updates within ~1 second. This is the one piece of the architecture that's
hard to verify by reading code — you have to run it.

## Step 10 — Edit conflicts
**Mode:** plain session.

> Client sends the `version` it last saw with every `PATCH /tasks/:id`.
> Update with `UPDATE tasks SET ..., version = version + 1 WHERE id = $1 AND
> version = $2`. Zero rows updated → 409 with current state. Show "this task
> was changed by someone else" in the UI with reload/reapply options.

Write a test that fires two simultaneous updates and asserts exactly one
succeeds. Also write a short paragraph (for the README's design-decisions
section) on why optimistic concurrency over locking or CRDTs — Claude can draft
this once the code exists, since the trade-off is now concrete rather than
theoretical.

## Step 11 — Harden the API
**Mode:** `/security-review`, then plain session for fixes.

Rate limiting (stricter on `/auth/login`), `helmet`, a CORS allow-list of only
`WEB_ORIGIN`, validation on every input, one consistent `{error:{code,message}}`
shape from a central error handler, structured logging with `pino` including a
request ID, pagination on list endpoints, graceful shutdown, `npm audit`.

Run `/security-review` against the full `api/` diff before calling this step
done — it's built for exactly this "about to expose this to the internet"
checkpoint.

## Step 12 — Tests and CI
**Mode:** subagent fan-out across test types, **Playwright MCP** for e2e
authoring.

This is the best fit in the whole project for parallel agents, since unit,
integration, and e2e tests are largely independent of each other once the
app behaves correctly:

- One agent: unit tests for `computeSchedule` and `canPerform` (Vitest).
- One agent: integration tests hitting the real API + Postgres container.
- One agent (with Playwright MCP): 3-5 e2e flows — sign up, create project,
  add tasks, see a live update across two browser contexts.

Then a GitHub Actions workflow: install, lint, type-check, test, build, on
every push/PR. Done when the pipeline is green and the badge is in the README.

## Step 13 — Load testing
**Mode:** plain session.

> Write a k6 script: login, list projects, fetch the schedule, update a task.
> Add a WebSocket scenario with many connected clients.

Record the baseline (req/s, p95 latency, error rate, max WS connections). Find
one real bottleneck with `EXPLAIN ANALYZE` — the Postgres MCP server is useful
here too, for running `EXPLAIN ANALYZE` directly and reading the plan rather
than pasting it back and forth. Fix it, re-run, record before/after in the
README.

## Step 14 — Deploy
**Mode:** plain session. This step is genuinely sequential and risk-bearing
(real infrastructure, real secrets) — not a place to parallelize or delegate
to a worktree you won't watch closely.

Pick a host (Render/Fly.io/Railway), managed Postgres + Redis, the
already-multi-stage `api/Dockerfile` / `web/Dockerfile` `prod` targets, secrets
as host env vars, migrations as a release step, HTTPS, secure cookie flags,
CORS restricted to the production frontend URL, a demo account seeded with
your ENGG 684 network.

## Step 15 — Documentation
**Mode:** plain session; Claude drafts, you edit for voice.

Pitch paragraph + live link at the top of the README, screenshots/GIF,
architecture diagram, 5-minute setup instructions, OpenAPI/Swagger docs
generated from the route schemas, a design-decisions section, known
limitations, a 2-minute demo video.

## Step 16 — Interview and resume prep
**Mode:** plain session, conversational.

Draft a 5-minute walkthrough (problem, architecture, one hard problem you
solved, what you'd improve) and resume bullets using your actual measured
numbers from Step 13. Nothing new to build — this is about articulating what
exists.

---

## Quick reference: which tool for which step

| Steps | Mode |
|-------|------|
| 1, 2, 4, 8, 9, 10, 13, 14, 15, 16 | Plain session |
| 5, 12 | Subagent fan-out (`Agent`) |
| 6+7, 9 (multi-instance test) | Worktrees |
| 3, 13 | Postgres MCP server |
| 8, 12 | Playwright/browser MCP server |
| 4, 11 | `/security-review` |
| 5, 11 | `/code-review` |
