# Interview and résumé prep

Everything here is grounded in what is actually in this repository and what was actually measured. Where something is
**not** true or **not** verified, it is called out, because an interviewer who probes is worth more than a polished claim
that falls apart. Edit the wording into your own voice; you should be able to explain every line out loud.

## 1. Read this first: claims you can and can't make

| You can say | You can't say (yet) |
|-------------|---------------------|
| Built and ran it end to end locally; 90 automated API tests, 5 browser (Playwright) flows, k6 load tests | "Deployed" or "live at …": nothing is deployed; the Render config has never been applied |
| Wrote a GitHub Actions workflow (lint, type-check, test, build, e2e) | "CI is green": the workflow has never run (no GitHub remote yet) |
| Load-tested on a laptop and fixed a measured bottleneck (before/after numbers below) | "Handles N users in production" or any absolute capacity: numbers are single runs on one laptop with everything in Docker |
| Held 1,000 simultaneous WebSocket connections with zero failures | "Supports 1,000 users": 1,000 is the number *tried*, not a ceiling, and connect times were slow while ramping (p95 about 18 s) |
| Built with an AI coding assistant (Claude Code) using worktrees and independent review agents; I can explain the code | Hide that: it is in `docs/ai-build-guide.md`, and interviewers will ask. See section 5 |

If you want live-link and green-CI claims, do the real deploy and push to GitHub first (see `docs/deployment.md`).

## 2. The 30-second pitch

> "I built a real-time collaborative project planner. A team builds a plan as tasks and dependencies, the app computes
> the critical path (the chain of tasks that determines the project's duration), and every edit shows up live on
> teammates' screens. When two people edit the same task, the second save is rejected with the current state instead of
> silently overwriting, and the user chooses what to keep. It's React and Express on PostgreSQL, with Redis pub/sub so the API
> can run as several instances. I load-tested it, found a missing index with `EXPLAIN ANALYZE`, and cut a hot query from about
> 20 ms to 0.2 ms."

## 3. Five-minute walkthrough

**Minute 0:00–0:45, problem and users.** Project plans change constantly and several people edit them. Two things go wrong:
people overwrite each other's edits, and nobody can see which tasks actually drive the finish date. The app addresses both:
live shared state, explicit conflict handling, and a computed critical path. Three roles: owner, editor, viewer.

**0:45–1:45, architecture** (draw `docs/architecture.md`'s first diagram).
- Browser → nginx (serves the SPA, proxies `/api` and WebSockets) → stateless Express API → PostgreSQL; Redis is the event bus.
- Every write commits to Postgres, then publishes `{type, projectId, payload, version}` to a Redis channel `project:<id>`. Every API
  instance subscribes for the projects its connected clients are viewing and forwards events over WebSocket. So any instance can take
  the write and every client still hears about it.
- Events only say "something changed"; clients refetch through the normal REST path, which already enforces permissions. One source
  of truth, no client-side merge logic.
- The critical-path scheduler is a pure function (`computeSchedule`): topological sort, forward pass, backward pass, float. No DB or
  HTTP imports, so it is unit-tested in isolation.

**1:45–3:30, one hard problem: concurrent edits** (the story to tell in depth; STAR form in section 4a).

**3:30–4:30, evidence it works:** 90 API tests against real Postgres/Redis, including WebSocket and concurrency tests; 5 Playwright
flows including live updates across two browser contexts; a k6 load test that found a real bottleneck (section 4b).

**4:30–5:00, what I'd improve** (be specific and honest): move rate-limit counters from per-process memory to Redis; add refresh/
revocable sessions (JWTs are stateless and last 1 hour); finish the UI for roles/removal/assignee/cost (the API already supports
them); do the real deploy and verify `TRUST_PROXY` and HTTPS cookies; add a Postgres or Redis outage test.

## 4. Stories (pick one or two; each is true and backed by the repo)

### 4a. Concurrent edits: optimistic concurrency (best "hard problem")

- **Situation:** two people edit the same task at once. Last-write-wins silently destroys work; row locks are held while a human thinks
  and are abandoned when a tab closes.
- **Action:** a `version` column. Every `PATCH /tasks/:id` carries the version the client last saw, and the update is a single atomic
  statement: `UPDATE tasks SET …, version = version + 1 WHERE id = $1 AND version = $2`. Zero rows updated means someone else got there
  first, so the API returns `409 version_conflict` with the task's current state (`error.details.current`). The UI shows
  "changed by someone else" with *reapply my change* / *keep their version*.
- **Result:** a test fires 10 simultaneous updates from the same version and asserts exactly one succeeds and nine get 409; a Playwright
  flow covers the banner end to end.
- **Why not CRDTs / locks:** conflicts on one task row are rare and cheap for a human to resolve; CRDT merge semantics are
  unintuitive for field edits (two people renaming the same task); locks fail when users walk away.
- **Honest limits:** only task fields are versioned (dependency add/remove is idempotent and not versioned); the loser must retry.

### 4b. Load testing found two real problems

- **Situation:** Step 13 asked for a baseline and one real bottleneck.
- **Action:** seeded the load database at realistic scale (50k users, 200k memberships, 1M tasks, 900k dependencies), ran k6
  scenarios (mixed workload, a 500-task schedule, logins, 1,000 WebSockets), and used `EXPLAIN ANALYZE` on every hot query.
- **Finding 1 (performance):** `GET /projects` did a sequential scan of all 200k `project_members` rows, because the only index there
  starts with `project_id` and the query filters by `user_id`. One index (`user_id, project_id`) took the list query from 20.4 ms to
  0.24 ms and the count from 18.0 ms to 0.11 ms. The scans also burned CPU, slowing every other endpoint.
  Mixed-workload p95: list projects 433 → 106 ms, list tasks 802 → 219 ms, patch task 508 → 252 ms; errors 0.02% → 0%.
- **Finding 2 (a bug I had written):** 96% of logins failed with 429. My rate limiter counted its own 429 responses as failures, so one
  burst of concurrent valid logins locked the IP out for 15 minutes. Fixed by counting only real 401s, with a regression test that I
  confirmed fails on the old code.
- **Caveats to volunteer:** single runs on one laptop (run-to-run noise was large; small-database baselines were sometimes slower than
  the "after" numbers), so "the index is the whole improvement" is an inference supported by the query plans, not a CPU profile.

### 4c. Browser testing found a bug that unit tests missed

- Writing the first real Playwright run exposed that after login the UI stayed on the sign-up form: clearing the whole React Query cache
  detached the "current user" query the app was watching. API tests were all green; only a real browser caught it. Fixed by removing every
  query except `me`.
- Same run showed that live events refetched five queries each, which let a few clients on one IP exhaust the rate limit. Fix: refetch only
  what an event can have changed.

### 4d. Cookies vs hosting domains (good design-reasoning story)

- The session cookie is `HttpOnly; Secure; SameSite=Lax`. On most hosts the SPA and API live on two subdomains of a shared domain, which
  browsers treat as cross-site, so the cookie would silently never be sent. Instead of weakening the cookie, production serves the SPA and
  proxies `/api` (and WebSockets) through the same nginx origin. Verified locally: all 5 browser flows pass against that topology; real HTTPS
  is **not** verified until a real deploy.

## 5. Being open about the AI-assisted workflow

The project was built with Claude Code: each step in its own git worktree, an independent review agent checking and merging each step
(`docs/ai-build-guide.md`, `CLAUDE.md`). A truthful, confident way to say it:

> "I used an AI coding assistant and structured the process so I could trust the result: every step had tests, every step was reviewed
> by a separate agent that re-ran the checks, and between the tests, the load testing and the reviews we caught real problems: a
> shutdown crash, a login lockout, and an error path that would have hung requests.
> I made the design decisions, and I can walk through any part of the code."

**Only say the last sentence if it is true for you.** Before an interview, read these until you can explain them without notes:
`api/src/tasks/service.ts` (`updateTask`), `api/src/realtime/ws.ts`, `api/src/scheduling/computeSchedule.ts`,
`api/src/http/rateLimit.ts`, `api/src/projects/permissions.ts`, `web/src/hooks/useProjectSocket.ts`.

## 6. Résumé bullets (measured, honest)

Pick 3 to 4. Numbers are from single laptop runs and say so where it matters. No deployment or CI claims.

**Project line:** *Collaborative Project Planner: real-time project-planning web app (React, TypeScript, Express, PostgreSQL, Redis, WebSockets, Docker)*

Recommended:
- Designed and built a real-time collaborative planner where teams model tasks and dependencies and see the computed **critical path**
  (CPM scheduler as a pure, unit-tested function); edits propagate to teammates' screens over authenticated WebSockets, fanned out across API
  instances via Redis pub/sub.
- Implemented **optimistic concurrency control** (version-checked atomic `UPDATE`, `409` with current state, reapply/keep UI); verified with a
  concurrency test where 10 simultaneous writers produce exactly one success.
- **Load-tested with k6 on a 1M-task dataset** and used `EXPLAIN ANALYZE` to find a sequential scan on the project list; one composite index cut
  the query from 20.4 ms to 0.24 ms and p95 list latency from 433 ms to 106 ms; held 1,000 concurrent WebSocket connections with a 477 ms p95
  write-to-socket delivery latency (single-machine test).
- Wrote **90 integration/unit tests** (real Postgres/Redis), **5 Playwright end-to-end flows** (including live updates across two browsers),
  and a GitHub Actions workflow; hardened the API with rate limiting, helmet, central error handling, structured logging and pagination.

Shorter alternatives:
- Built a real-time collaborative critical-path planner (React, Express, PostgreSQL, Redis, WebSockets) with role-based access, optimistic-concurrency conflict handling and live updates.
- Cut a hot query 85× (20.4 → 0.24 ms) after finding a missing index with `EXPLAIN ANALYZE` during k6 load testing on a 1M-row dataset.

(`20.4 / 0.24` is about 85×; use "85×" only if you also say it is one query on a seeded dataset; the end-to-end p95 improved about 4×.)

If asked "was it deployed?": "Not yet. It's prepared and rehearsed locally with production images and an nginx proxy, and I have a deploy
config ready, but I haven't put it on a host." That is a fine answer; "deployed" if it wasn't is not.

## 7. Likely questions and grounded answers

**Why PostgreSQL?** The data is relational; foreign keys and unique/check constraints (no self-dependency, one membership per user per
project) enforce integrity in the database, not only in code.

**How do you prevent dependency cycles?** On every dependency insert the service walks the existing edges (DFS) to see whether the new edge would
create a cycle and rejects with 422; self-dependency and cross-project edges are rejected too. The scheduler also throws on a cycle rather than looping.

**How does real-time work across multiple servers?** Redis pub/sub. A write publishes to `project:<id>`; each instance subscribes only for rooms
with connected clients and forwards to them. `scripts/fanout-check.mjs` proves a write through instance A reaches a socket on instance B (about
19 ms locally).

**What if Redis is down?** Writes still succeed (publish failures are caught and logged, never thrown), but clients don't get live events; the web
app refetches everything when its socket reconnects. Pub/sub is fire-and-forget, so there's no replay of missed events. I have not tested a Redis
outage end to end; I'd say so.

**How are permissions enforced?** One function, `canPerform(role, action)`, called on every request via middleware; the UI hiding buttons is not a
control. Non-members get 404, not 403, so a project's existence isn't leaked, and the same applies to WebSocket upgrades.

**What would break first under load?** Login: argon2 is deliberately CPU-heavy and shares the libuv threadpool (4 threads by default). Also: rate-limit
counters are per-process, so they aren't global across instances; and the schedule is recomputed on every request (fine at the tested sizes).

**How do you know your load numbers are trustworthy?** Be candid: single runs on a laptop where k6, the API and Postgres compete for CPU; I trust the
query plans (20 ms → 0.2 ms) more than the end-to-end percentages, and I said so in the write-up. A proper benchmark needs separate load generator and
server hosts, repeated runs and a CPU profile.

**What did testing catch that you didn't expect?** The login lockout bug (my own rate limiter), the UI stuck on the login form (only a real browser caught
it), a shutdown crash from unsubscribing on an already-closed Redis connection, and several wrong claims in my own docs found by the reviewer.

**What would you do with another week?** Do the real deploy and verify HTTPS cookies and proxy hop count; Redis-backed rate limiting; revocable sessions;
roles/removal UI; an outage test for Redis and Postgres; dependency edits under optimistic concurrency.

## 8. If you will demo it live

Use `docs/demo-script.md` (2 minutes). Have a fallback: screenshots in `docs/screenshots/`. Seed the demo account first
(`README` quick start) and register a second user in a second browser so the live-update and conflict moments work.
