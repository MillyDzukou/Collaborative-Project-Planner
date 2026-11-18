// Proves Redis pub/sub fan-out: listens on instance B, writes via instance A.
//   node scripts/fanout-check.mjs [apiA=http://localhost:4000] [apiB=http://localhost:4001]
import WebSocket from "ws";

const A = process.argv[2] ?? "http://localhost:4000";
const B = process.argv[3] ?? "http://localhost:4001";
const J = { "Content-Type": "application/json" };
const email = `fanout-${Date.now()}@example.com`;
const password = "fanoutpassword1";

await fetch(`${A}/auth/register`, { method: "POST", headers: J, body: JSON.stringify({ email, password, name: "Fanout" }) });
const login = await fetch(`${A}/auth/login`, { method: "POST", headers: J, body: JSON.stringify({ email, password }) });
const cookie = login.headers.get("set-cookie").split(";")[0];
const auth = { ...J, Cookie: cookie };
const { project } = await (await fetch(`${A}/projects`, { method: "POST", headers: auth, body: JSON.stringify({ name: "Fanout test" }) })).json();

const ws = new WebSocket(`${B.replace(/^http/, "ws")}/ws?projectId=${project.id}`, { headers: { Cookie: cookie } });
let sent = 0;
const got = new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error("no event within 3s")), 3000);
  ws.on("message", (d) => {
    const m = JSON.parse(String(d));
    if (m.type !== "connected") {
      clearTimeout(t);
      resolve({ m, ms: Date.now() - sent });
    }
  });
  ws.on("error", reject);
});
await new Promise((r) => ws.on("open", r));
sent = Date.now();
await fetch(`${A}/projects/${project.id}/tasks`, { method: "POST", headers: auth, body: JSON.stringify({ name: "T1", duration_weeks: 2 }) });
const { m, ms } = await got;
console.log(`OK: instance B received "${m.type}" written via instance A in ${ms}ms`);
ws.close();
process.exit(0);
