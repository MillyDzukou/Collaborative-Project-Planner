import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { app } from "../../src/server.js";
import { attachRealtime } from "../../src/realtime/ws.js";
import { publishProjectEvent } from "../../src/realtime/events.js";
import { pool } from "../../src/db/pool.js";
import { addMemberToProject, resetDatabase, seedProject, seedUser } from "../tasks/helpers.js";

let server: Server;
let realtime: { close: () => void };
let port: number;

beforeAll(async () => {
  server = createServer(app);
  realtime = attachRealtime(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  realtime.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
});

beforeEach(async () => {
  await resetDatabase();
});

const wsUrl = (projectId: number) => `ws://127.0.0.1:${port}/ws?projectId=${projectId}`;

/** Connects and resolves once the server's "connected" greeting arrives, buffering later messages. */
function connect(projectId: number, cookie?: string) {
  const ws = new WebSocket(wsUrl(projectId), { headers: cookie ? { Cookie: cookie } : {} });
  const messages: { type: string; [k: string]: unknown }[] = [];
  const waiters: (() => void)[] = [];
  ws.on("message", (data) => {
    messages.push(JSON.parse(String(data)));
    waiters.splice(0).forEach((w) => w());
  });
  const next = async (timeoutMs = 3000) => {
    const deadline = Date.now() + timeoutMs;
    while (messages.length === 0) {
      const left = deadline - Date.now();
      if (left <= 0) throw new Error("timed out waiting for a WebSocket message");
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, left);
        waiters.push(() => {
          clearTimeout(t);
          resolve();
        });
      });
    }
    return messages.shift()!;
  };
  return { ws, messages, next };
}

/** Resolves with the HTTP status when the upgrade is refused. */
function rejectedStatus(projectId: number, cookie?: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl(projectId), { headers: cookie ? { Cookie: cookie } : {} });
    ws.on("unexpected-response", (_req, res) => {
      resolve(res.statusCode ?? 0);
      ws.terminate();
    });
    ws.on("open", () => {
      ws.close();
      reject(new Error("connection unexpectedly opened"));
    });
    ws.on("error", () => undefined);
  });
}

describe("WebSocket realtime", () => {
  it("rejects connections without a login cookie (401)", async () => {
    const { projectId } = await seedProject("ws-anon");
    expect(await rejectedStatus(projectId)).toBe(401);
  });

  it("rejects an invalid token (401)", async () => {
    const { projectId } = await seedProject("ws-badtoken");
    expect(await rejectedStatus(projectId, "planner_token=not-a-jwt")).toBe(401);
  });

  it("rejects non-members with 404, like the REST API", async () => {
    const { projectId } = await seedProject("ws-nonmember");
    const outsider = await seedUser("ws-outsider");
    expect(await rejectedStatus(projectId, outsider.cookie)).toBe(404);
  });

  it("rejects a cross-origin upgrade from a disallowed Origin (403)", async () => {
    const { projectId, ownerCookie } = await seedProject("ws-origin");
    const status = await new Promise<number>((resolve, reject) => {
      const ws = new WebSocket(wsUrl(projectId), { headers: { Cookie: ownerCookie, Origin: "https://evil.example" } });
      ws.on("unexpected-response", (_req, res) => {
        resolve(res.statusCode ?? 0);
        ws.terminate();
      });
      ws.on("open", () => reject(new Error("connection unexpectedly opened")));
      ws.on("error", () => undefined);
    });
    expect(status).toBe(403);
  });

  it("lets a member join and delivers events published for their project only", async () => {
    const a = await seedProject("ws-a");
    const b = await seedProject("ws-b");

    const clientA = connect(a.projectId, a.ownerCookie);
    const clientB = connect(b.projectId, b.ownerCookie);
    expect(await clientA.next()).toMatchObject({ type: "connected", projectId: a.projectId });
    expect(await clientB.next()).toMatchObject({ type: "connected", projectId: b.projectId });

    await publishProjectEvent({ type: "task.updated", projectId: a.projectId, payload: { hello: "a" }, version: 2 });

    expect(await clientA.next()).toMatchObject({ type: "task.updated", projectId: a.projectId, version: 2 });
    // Project B's room must not see project A's event.
    await new Promise((r) => setTimeout(r, 300));
    expect(clientB.messages).toHaveLength(0);

    clientA.ws.close();
    clientB.ws.close();
  });

  it("broadcasts a real REST write to every member of the project", async () => {
    const { projectId, ownerCookie } = await seedProject("ws-rest");
    const editor = await addMemberToProject(projectId, "editor", "ws-rest-editor");

    const owner = connect(projectId, ownerCookie);
    const other = connect(projectId, editor.cookie);
    await owner.next();
    await other.next();

    const res = await fetch(`http://127.0.0.1:${port}/projects/${projectId}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ownerCookie },
      body: JSON.stringify({ name: "Live task", duration_weeks: 2 }),
    });
    expect(res.status).toBe(201);

    for (const client of [owner, other]) {
      const msg = await client.next();
      expect(msg).toMatchObject({ type: "task.created", projectId });
      expect((msg.payload as { task: { name: string } }).task.name).toBe("Live task");
    }

    owner.ws.close();
    other.ws.close();
  });
});
