// HTTP load test: a realistic mixed workload, a heavy-schedule scenario on a big project,
// and login throughput (argon2 is deliberately CPU-expensive).
//
//   docker run --rm -i -v "<repo>/load:/load" -e BASE_URL=http://host.docker.internal:4100 \
//     grafana/k6 run /load/k6/http.js --summary-export=/load/results/http.json
import http from "k6/http";
import { check, sleep } from "k6";
import { BASE, params, provision } from "./lib.js";

const USERS = Number(__ENV.USERS || 20);
const PEAK_VUS = Number(__ENV.PEAK_VUS || 50);
const BIG_TASKS = Number(__ENV.BIG_TASKS || 500);

export const options = {
  setupTimeout: "600s",
  scenarios: {
    mixed: {
      executor: "ramping-vus",
      exec: "mixed",
      startVUs: 0,
      stages: [
        { duration: "30s", target: PEAK_VUS },
        { duration: "90s", target: PEAK_VUS },
        { duration: "15s", target: 0 },
      ],
    },
    big_schedule: {
      executor: "constant-vus",
      exec: "bigSchedule",
      vus: Number(__ENV.BIG_VUS || 5),
      duration: "135s",
    },
    login: {
      executor: "constant-arrival-rate",
      exec: "login",
      rate: Number(__ENV.LOGIN_RATE || 5),
      timeUnit: "1s",
      duration: "135s",
      preAllocatedVUs: 30,
      maxVUs: 100,
    },
  },
  thresholds: {
    "http_req_failed{scenario:mixed}": ["rate<0.01"],
    "http_req_failed{scenario:big_schedule}": ["rate<0.01"],
    "http_req_failed{scenario:login}": ["rate<0.01"],
    "http_req_duration{name:GET /projects}": ["p(95)<300"],
    "http_req_duration{name:GET /projects/:id/tasks}": ["p(95)<300"],
    "http_req_duration{name:GET /projects/:id/schedule}": ["p(95)<500"],
    "http_req_duration{name:PATCH /tasks/:id}": ["p(95)<300"],
    "http_req_duration{name:GET big /projects/:id/schedule}": ["p(95)<1000"],
    "http_req_duration{name:POST /auth/login}": ["p(95)<1500"],
  },
};

export function setup() {
  return provision({ users: USERS, tasksPerProject: 40, bigTasks: BIG_TASKS });
}

const EXPECT_OK_OR_CONFLICT = http.expectedStatuses(200, 409);

export function mixed(data) {
  const user = data.users[(__VU - 1) % data.users.length];
  const p = (name) => params(user.token, name);

  check(http.get(`${BASE}/projects`, p("GET /projects")), { "projects 200": (r) => r.status === 200 });

  const tasksRes = http.get(`${BASE}/projects/${user.projectId}/tasks`, p("GET /projects/:id/tasks"));
  check(tasksRes, { "tasks 200": (r) => r.status === 200 });

  check(http.get(`${BASE}/projects/${user.projectId}/schedule`, p("GET /projects/:id/schedule")), {
    "schedule 200": (r) => r.status === 200,
  });

  const tasks = tasksRes.status === 200 ? tasksRes.json("tasks") : [];
  if (tasks.length > 0) {
    const t = tasks[Math.floor(Math.random() * tasks.length)];
    const res = http.patch(
      `${BASE}/tasks/${t.id}`,
      JSON.stringify({ version: t.version, duration_weeks: 1 + Math.floor(Math.random() * 5) }),
      { ...p("PATCH /tasks/:id"), responseCallback: EXPECT_OK_OR_CONFLICT },
    );
    check(res, { "patch 200 or 409": (r) => r.status === 200 || r.status === 409 });
  }
  sleep(0.5 + Math.random());
}

export function bigSchedule(data) {
  const user = data.users[0];
  const res = http.get(`${BASE}/projects/${data.bigProjectId}/schedule`, params(user.token, "GET big /projects/:id/schedule"));
  check(res, { "big schedule 200": (r) => r.status === 200 });
  sleep(0.2);
}

export function login(data) {
  const user = data.users[Math.floor(Math.random() * data.users.length)];
  const res = http.post(`${BASE}/auth/login`, JSON.stringify({ email: user.email, password: user.password }), {
    headers: { "Content-Type": "application/json" },
    tags: { name: "POST /auth/login" },
  });
  check(res, { "login 200": (r) => r.status === 200 });
}
