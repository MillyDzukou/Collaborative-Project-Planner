// Shared helpers for the k6 load tests. Run inside the grafana/k6 container.
import http from "k6/http";
import { check, fail } from "k6";

export const BASE = __ENV.BASE_URL || "http://host.docker.internal:4100";
const JSON_HEADERS = { "Content-Type": "application/json" };
const PASSWORD = "load-test-password-1";

export function params(token, name) {
  return {
    headers: { ...JSON_HEADERS, Cookie: `planner_token=${token}` },
    tags: name ? { name } : undefined,
  };
}

function post(path, body, p) {
  return http.post(`${BASE}${path}`, JSON.stringify(body), p ?? { headers: JSON_HEADERS });
}

/**
 * Creates `users` accounts (register + login), each owning a project with `tasksPerProject`
 * tasks wired into a mix of chains and branches. User 0 additionally owns a "big" project of
 * `bigTasks` tasks. Returns tokens and ids for the scenarios (setup() data must be JSON).
 *
 * The auth cookie is `secure`, which k6's cookie jar won't send over plain http, so tokens are
 * read from the login response and sent via an explicit Cookie header.
 */
export function provision({ users, tasksPerProject, bigTasks }) {
  const run = Date.now().toString(36);
  const out = { users: [], bigProjectId: null, bigTaskCount: bigTasks };

  for (let i = 0; i < users; i++) {
    const email = `load-${run}-${i}@example.com`;
    const reg = post("/auth/register", { email, password: PASSWORD, name: `Load ${i}` });
    if (reg.status !== 201) fail(`register failed: ${reg.status} ${reg.body}`);
    const login = post("/auth/login", { email, password: PASSWORD });
    if (login.status !== 200) fail(`login failed: ${login.status} ${login.body}`);
    const token = login.cookies.planner_token[0].value;

    const proj = post("/projects", { name: `Load project ${i}` }, params(token));
    if (proj.status !== 201) fail(`create project failed: ${proj.status}`);
    const projectId = proj.json("project.id");

    out.users.push({ email, password: PASSWORD, token, projectId });
    buildGraph(token, projectId, tasksPerProject);
  }

  if (bigTasks > 0 && out.users[0]) {
    const u = out.users[0];
    const proj = post("/projects", { name: "Big load project" }, params(u.token));
    out.bigProjectId = proj.json("project.id");
    buildGraph(u.token, out.bigProjectId, bigTasks);
  }
  return out;
}

function buildGraph(token, projectId, n) {
  const ids = [];
  // Create tasks in batches of 20 to keep setup quick.
  for (let start = 0; start < n; start += 20) {
    const reqs = [];
    for (let i = start; i < Math.min(start + 20, n); i++) {
      reqs.push(["POST", `${BASE}/projects/${projectId}/tasks`, JSON.stringify({ name: `Task ${i}`, duration_weeks: 1 + (i % 5) }), params(token)]);
    }
    for (const r of http.batch(reqs)) {
      if (r.status !== 201) fail(`create task failed: ${r.status} ${r.body}`);
      ids.push(r.json("task.id"));
    }
  }
  // Dependencies: each task depends on the previous one every 3rd task (chains), and on a task
  // two back for branching/merging, giving a realistic mixed DAG (never cyclic: only earlier ids).
  const deps = [];
  for (let i = 1; i < ids.length; i++) {
    if (i % 3 !== 0) deps.push([ids[i], ids[i - 1]]);
    if (i >= 2 && i % 4 === 0) deps.push([ids[i], ids[i - 2]]);
  }
  for (let start = 0; start < deps.length; start += 20) {
    const reqs = deps.slice(start, start + 20).map(([t, d]) => [
      "POST", `${BASE}/tasks/${t}/dependencies`, JSON.stringify({ dependsOnTaskId: d }), params(token),
    ]);
    for (const r of http.batch(reqs)) check(r, { "dependency created": (x) => x.status === 201 });
  }
}
