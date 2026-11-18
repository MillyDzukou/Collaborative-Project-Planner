# Load testing (Step 13)

[k6](https://k6.io) scripts, a bulk-data seed, and `EXPLAIN ANALYZE` queries. Raw k6 summaries and
plan output are in [`results/`](results/).

## Setup

The load stack is separate from the dev stack (own compose project, ports and database volumes) and runs
the **production** API image with quiet logging and rate limits effectively off (see
`docker-compose.load.yml` — never use that file for a real deployment).

```bash
export API_PORT=4100 POSTGRES_PORT=5433 REDIS_PORT=6380
docker compose -p planner-load -f docker-compose.yml -f docker-compose.load.yml up -d --build postgres redis api
(cd api && DATABASE_URL=postgres://planner:planner@localhost:5433/planner npm run migrate:up)

# optional but needed for realistic numbers: ~50k users, 200k memberships, 1M tasks, 900k dependencies (~5 min)
docker exec -i planner-load-postgres-1 psql -U planner -d planner -v ON_ERROR_STOP=1 < load/seed-bulk.sql
```

## Run

k6 runs from its official Docker image (nothing to install):

```bash
docker run --rm -i -v "$PWD/load:/load" -e BASE_URL=http://host.docker.internal:4100 \
  grafana/k6 run /load/k6/http.js --summary-export=/load/results/http.json

docker run --rm -i -v "$PWD/load:/load" -e BASE_URL=http://host.docker.internal:4100 -e WS_MAX=1000 \
  grafana/k6 run /load/k6/ws.js --summary-export=/load/results/ws.json

docker exec -i planner-load-postgres-1 psql -U planner -d planner < load/explain.sql
```

Each script provisions its own users/projects in `setup()` (the auth cookie is `secure`, so tokens are read from the
login response and sent as an explicit `Cookie` header). Tunables: `USERS`, `PEAK_VUS`, `BIG_TASKS`, `BIG_VUS`,
`LOGIN_RATE` (`http.js`); `USERS`, `WS_MAX`, `WRITE_RATE` (`ws.js`).

## Scenarios

| Script | Scenario | What it does |
|--------|----------|--------------|
| `http.js` | `mixed` | 0→50 VUs: list projects, list tasks, fetch schedule, update a task (409 counted as a valid outcome) |
| `http.js` | `big_schedule` | 5 VUs hammering the schedule of a 500-task / ~600-dependency project |
| `http.js` | `login` | 5 logins/s (argon2 is deliberately CPU-expensive) |
| `ws.js` | `clients` | ramp to 1,000 simultaneous authenticated WebSocket connections across project rooms |
| `ws.js` | `writers` | 20 task updates/s; clients record REST-write → WebSocket delivery latency |

## Results

Machine: a single developer laptop running everything (k6, API, Postgres, Redis) in Docker, so absolute numbers
are conservative and only useful for comparing runs. API in the production image, one instance.

**Baseline (small DB, ~1.3k tasks)** — before any change: 147 req/s, 0.01% errors.

**Bottleneck: `GET /projects` and every request sharing the database.** With the DB at realistic scale
(200k `project_members` rows, 1M tasks), `EXPLAIN ANALYZE` showed the project list and its count doing a
sequential scan over all of `project_members`, because the only index there is `(project_id, user_id)` and
the query filters on `user_id`:

| Query | Before (plan) | After `idx_project_members_user_id (user_id, project_id)` |
|-------|---------------|-----------------------------------------------------------|
| project list (join) | Parallel Seq Scan, 20.4 ms | Index Only Scan, **0.24 ms** |
| project count | Seq Scan, 200k rows removed, 18.0 ms | Index Only Scan, **0.11 ms** |

All other hot queries (membership lookup, task page, schedule queries, login lookup) were already index
scans at ≤1.2 ms. The scans also burned CPU in parallel workers, so every endpoint got slower, not just the list.

k6 HTTP mixed workload on the bulk-sized DB, same script and machine:

| Metric (p95 unless noted) | Before | After |
|---------------------------|--------|-------|
| throughput | 106 req/s | **159 req/s** |
| `GET /projects` | 433 ms | **106 ms** |
| `GET /projects/:id/tasks` | 802 ms | **219 ms** |
| `GET /projects/:id/schedule` | 439 ms | **169 ms** |
| `GET` schedule, 500-task project | 432 ms | **163 ms** |
| `PATCH /tasks/:id` | 508 ms | **252 ms** |
| `POST /auth/login` | 834 ms | **431 ms** |
| error rate | 0.02% | **0%** |
| thresholds | 3 crossed | all pass |

**WebSockets (1,000 clients, 20 writes/s, one API instance):** all 1,000 connections upgraded successfully
(zero failures — the real ceiling was not reached; only 1,000 were tried), ~37.9k events delivered (310/s),
REST write → WebSocket delivery latency median 18 ms, p95 477 ms, max 3.1 s. The writer scenario ran short of
VUs (163 dropped iterations) because each iteration does two requests while the system is saturated.

## Defect found by load testing

The first bulk run had **96% of logins failing with 429**. The Step 11 login limiter counted every response with
status ≥ 400 as a failure — including its own 429s — so one burst of concurrent *valid* logins (argon2 keeps
requests in flight for hundreds of ms) put the whole IP in a self-perpetuating lockout for 15 minutes. Now only
real credential failures (401) stay counted and everything else is refunded when the response finishes (regression
test: `tests/hardening/hardening.test.ts`). Remaining behavior to know about: requests are counted on arrival, so
more than ~10 *simultaneous* logins from one IP get a 429 until they finish (3 of 676 logins in the "before" run
had this at 5 logins/s; 0 in the "after" run) — a deliberate trade-off that cuts off parallel password-guessing floods immediately.

## Known limits / next ideas

- Single API instance, one laptop: no horizontal scaling numbers yet (`docker compose --profile scale` can add `api2`).
- The migration builds the index inside a transaction (`node-pg-migrate` default), which locks writes to
  `project_members` while it builds; on a large production table use `CREATE INDEX CONCURRENTLY` outside a transaction.
- Login throughput is bounded by argon2 on the libuv threadpool (default 4 threads); this is the next ceiling.
