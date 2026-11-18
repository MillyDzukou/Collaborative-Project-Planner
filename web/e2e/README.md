# End-to-end tests (Playwright)

Step 12 of `docs/ai-build-guide.md`. The tests drive the real UI in Chromium against the
full stack, so nothing is mocked.

## Run

```bash
# 1. Start the stack from the repo root (once)
docker compose up --build -d
docker compose exec -T api npm run migrate:up

# 2. Install deps and the browser (once)
cd web
npm ci
npm run e2e:install

# 3. Run
npm run e2e
```

The HTML report is written to `web/playwright-report/` (`npx playwright show-report`).
Set `E2E_BASE_URL` to test a different web origin (default `http://localhost:5173`); the web
app talks to the API at `http://localhost:4000`.

## Flows

- `auth.spec.ts`: sign up, log out, wrong password rejected, log back in, session survives reload.
- `schedule.spec.ts`: create project, add tasks and a dependency, project duration, critical
  count, table float and Gantt bars.
- `collaboration.spec.ts` (serial): owner invites an editor and a viewer; live updates between
  two browser contexts without reload; viewer has no edit controls; stale edit shows the
  conflict banner and "Reapply my change" works.

## Notes

- Each run registers fresh users with unique emails (about 5 registrations). The API limits
  `POST /auth/register` to 10 per hour per IP; if you hit a 429, restart the api container
  (`docker compose restart api`) since the limiter is in memory.
- Tests are rerun-safe: they never depend on existing data.
