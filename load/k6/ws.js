// WebSocket load test: many clients connected to project rooms while writers generate events.
// Measures max concurrent connections, connect success, and end-to-end event latency
// (REST write -> Redis -> WebSocket), using the task's updatedAt from the event payload.
//
//   docker run --rm -i -v "<repo>/load:/load" -e BASE_URL=http://host.docker.internal:4100 \
//     -e WS_MAX=1000 grafana/k6 run /load/k6/ws.js --summary-export=/load/results/ws.json
import http from "k6/http";
import ws from "k6/ws";
import { check, sleep } from "k6";
import { Counter, Gauge, Trend } from "k6/metrics";
import { BASE, params, provision } from "./lib.js";

const USERS = Number(__ENV.USERS || 20);
const WS_MAX = Number(__ENV.WS_MAX || 500);
const WRITE_RATE = Number(__ENV.WRITE_RATE || 20);
const WS_URL = BASE.replace(/^http/, "ws");

const connected = new Counter("ws_connected_total");
const failed = new Counter("ws_connect_failed_total");
const received = new Counter("ws_events_received_total");
const latency = new Trend("ws_event_latency_ms", true);
const open = new Gauge("ws_open_connections");

export const options = {
  setupTimeout: "600s",
  scenarios: {
    clients: {
      executor: "ramping-vus",
      exec: "client",
      startVUs: 0,
      stages: [
        { duration: "40s", target: WS_MAX },
        { duration: "40s", target: WS_MAX },
        { duration: "5s", target: 0 },
      ],
      gracefulStop: "30s",
    },
    writers: {
      executor: "constant-arrival-rate",
      exec: "writer",
      rate: WRITE_RATE,
      timeUnit: "1s",
      startTime: "20s", // let some clients connect first
      duration: "60s",
      preAllocatedVUs: 20,
      maxVUs: 60,
    },
  },
  thresholds: {
    ws_connect_failed_total: ["count==0"],
    ws_event_latency_ms: ["p(95)<1000"],
  },
};

export function setup() {
  return provision({ users: USERS, tasksPerProject: 10, bigTasks: 0 });
}

export function client(data) {
  const user = data.users[(__VU - 1) % data.users.length];
  const url = `${WS_URL}/ws?projectId=${user.projectId}`;
  const res = ws.connect(url, { headers: { Cookie: `planner_token=${user.token}` } }, (socket) => {
    socket.on("open", () => {
      connected.add(1);
      open.add(1);
    });
    socket.on("message", (raw) => {
      const msg = JSON.parse(raw);
      if (msg.type === "connected") return;
      received.add(1);
      const updated = msg.payload && msg.payload.task && msg.payload.task.updatedAt;
      if (updated) latency.add(Date.now() - Date.parse(updated));
    });
    socket.on("close", () => open.add(-1));
    // Hold the connection for the whole test; the ramp-down interrupts the VU.
    socket.setTimeout(() => socket.close(), 120000);
  });
  if (!check(res, { "ws upgraded (101)": (r) => r && r.status === 101 })) failed.add(1);
  sleep(1);
}

export function writer(data) {
  const user = data.users[Math.floor(Math.random() * data.users.length)];
  const tasks = http.get(`${BASE}/projects/${user.projectId}/tasks?limit=5`, params(user.token, "GET tasks (writer)"));
  const list = tasks.status === 200 ? tasks.json("tasks") : [];
  if (list.length === 0) return;
  const t = list[0];
  http.patch(
    `${BASE}/tasks/${t.id}`,
    JSON.stringify({ version: t.version, duration_weeks: 1 + Math.floor(Math.random() * 5) }),
    { ...params(user.token, "PATCH /tasks/:id (writer)"), responseCallback: http.expectedStatuses(200, 409) },
  );
}
