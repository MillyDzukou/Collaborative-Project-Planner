# 2-minute demo script

The demo video has **not been recorded yet**; this is the script to record it from. Use the seeded demo account
(`npm run seed:demo`, see the README quick start) plus a second registered user, and two browser windows side by side.

Total: about 2 minutes. Screen-record at 1080p; keep the browser zoom at 100–110%.

| Time | Show | Say |
|------|------|-----|
| 0:00 | Login page, log in as the demo user | "This is a collaborative project planner: a team builds a plan as tasks and dependencies, and the app works out the critical path." |
| 0:10 | Open **Product launch (demo)**; point at the summary line | "The sample plan has 11 tasks and comes out at 17 weeks, with 7 critical tasks, the ones that can't slip without delaying launch." |
| 0:25 | Scroll to the Gantt chart | "Red bars are critical. Blue ones have float, so they can move without affecting the finish date." |
| 0:40 | Change **Backend API** from 5 to 3 weeks (click the number) | "Shorten the backend and the critical path changes: the duration drops and different tasks turn red." |
| 0:55 | Add a dependency (e.g. Documentation depends on Load testing) | "Dependencies are finish-to-start. Cycles and cross-project links are rejected by the API." |
| 1:10 | Second window: second user, invited as **editor** earlier. Edit a task in window A | "Both of us are on the same project. When I edit here, it appears on the other screen straight away, with no refresh." |
| 1:25 | Both windows edit the *same* task: save in A, then in B | "If two people edit the same task, the second save is rejected rather than silently overwriting. B sees what changed and can reapply their edit or keep the other version." |
| 1:40 | Log in as a **viewer** (or invite one) | "Viewers can see the plan and its schedule, but every edit control is gone, and the server enforces it too, not just the UI." |
| 1:50 | Close on the README / `docs/architecture.md` diagram | "Under the hood: Express and PostgreSQL, Redis pub/sub for live updates across servers, optimistic concurrency for conflicts, and a load test that found and fixed a real database index problem." |

## Before recording

- [ ] Stack running, demo account seeded, second user registered and invited as editor, a third as viewer.
- [ ] Reset the demo project to its seeded state (re-seed on a fresh database) so durations match the script (17 weeks).
- [ ] Hide bookmarks/other tabs; no real emails or secrets visible on screen.
- [ ] The Live badge shows green in both windows before you start the collaboration part.
