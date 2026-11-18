import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, createApp } from "../../src/server.js";
import { config } from "../../src/config.js";
import { pool } from "../../src/db/pool.js";
import { resetDatabase, seedProject, seedTask } from "../tasks/helpers.js";

describe("API hardening", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await pool.end();
  });

  describe("headers and CORS", () => {
    it("sets helmet security headers and hides x-powered-by", async () => {
      const res = await request(app).get("/health");
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["x-powered-by"]).toBeUndefined();
    });

    it("allows only the configured web origin via CORS", async () => {
      const allowed = config.webOrigins[0]!;
      const ok = await request(app).get("/health").set("Origin", allowed);
      expect(ok.headers["access-control-allow-origin"]).toBe(allowed);
      expect(ok.headers["access-control-allow-credentials"]).toBe("true");

      const evil = await request(app).get("/health").set("Origin", "https://evil.example");
      expect(evil.headers["access-control-allow-origin"]).toBeUndefined();
    });

    it("returns a request id, and honours a safe caller-supplied one", async () => {
      const generated = await request(app).get("/health");
      expect(generated.headers["x-request-id"]).toMatch(/^[\w-]{8,}$/);

      const supplied = await request(app).get("/health").set("X-Request-Id", "abc-123");
      expect(supplied.headers["x-request-id"]).toBe("abc-123");

      const unsafe = await request(app).get("/health").set("X-Request-Id", "bad id with spaces!");
      expect(unsafe.headers["x-request-id"]).not.toBe("bad id with spaces!");
    });
  });

  describe("rate limiting", () => {
    it("throttles repeated failed logins with a 429 in the standard error shape", async () => {
      const limited = createApp({ rateLimit: { login: 3 } });
      const attempt = () =>
        request(limited).post("/auth/login").send({ email: "nobody@example.com", password: "wrong-password-1" });

      for (let i = 0; i < 3; i++) {
        expect((await attempt()).status).toBe(401);
      }
      const blocked = await attempt();
      expect(blocked.status).toBe(429);
      expect(blocked.body.error.code).toBe("rate_limited");
    });

    it("applies a global cap to all routes", async () => {
      const limited = createApp({ rateLimit: { global: 2 } });
      // /health is registered before the limiter; use a limited route.
      expect((await request(limited).get("/nope")).status).toBe(404);
      expect((await request(limited).get("/nope")).status).toBe(404);
      expect((await request(limited).get("/nope")).status).toBe(429);
    });
  });

  describe("central error handler", () => {
    it("returns the standard shape for unknown routes", async () => {
      const res = await request(app).get("/does-not-exist");
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: { code: "not_found", message: expect.any(String) } });
    });

    it("returns 400 invalid_json for malformed JSON bodies", async () => {
      const res = await request(app).post("/auth/login").set("Content-Type", "application/json").send("{not json");
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("invalid_json");
    });

    it("returns 413 for oversized bodies", async () => {
      const res = await request(app).post("/auth/login").send({ email: "a@b.co", password: "x".repeat(200_000) });
      expect(res.status).toBe(413);
      expect(res.body.error.code).toBe("payload_too_large");
    });
  });

  describe("input validation", () => {
    it("rejects over-long task and project names and absurd passwords", async () => {
      const { projectId, ownerCookie } = await seedProject("limits");

      const task = await request(app)
        .post(`/projects/${projectId}/tasks`)
        .set("Cookie", ownerCookie)
        .send({ name: "x".repeat(201), duration_weeks: 1 });
      expect(task.status).toBe(400);

      const project = await request(app).post("/projects").set("Cookie", ownerCookie).send({ name: "x".repeat(201) });
      expect(project.status).toBe(400);

      const reg = await request(app)
        .post("/auth/register")
        .send({ email: "long@example.com", password: "p".repeat(129), name: "Long" });
      expect(reg.status).toBe(400);
    });
  });

  describe("pagination", () => {
    it("paginates tasks with limit/offset and reports the total", async () => {
      const { projectId, ownerCookie } = await seedProject("page");
      for (let i = 0; i < 5; i++) await seedTask(projectId, { name: `t${i}` });

      const res = await request(app).get(`/projects/${projectId}/tasks?limit=2&offset=2`).set("Cookie", ownerCookie);
      expect(res.status).toBe(200);
      expect(res.body.tasks.map((t: { name: string }) => t.name)).toEqual(["t2", "t3"]);
      expect(res.body.page).toEqual({ limit: 2, offset: 2, total: 5 });
    });

    it("applies a default limit and paginates projects and members", async () => {
      const { projectId, ownerCookie } = await seedProject("page2");

      const projects = await request(app).get("/projects").set("Cookie", ownerCookie);
      expect(projects.body.page).toEqual({ limit: 50, offset: 0, total: 1 });

      const members = await request(app).get(`/projects/${projectId}/members?limit=1`).set("Cookie", ownerCookie);
      expect(members.body.members).toHaveLength(1);
      expect(members.body.page.total).toBe(1);
    });

    it("rejects invalid pagination parameters", async () => {
      const { projectId, ownerCookie } = await seedProject("page3");
      for (const q of ["limit=0", "limit=201", "limit=abc", "offset=-1"]) {
        const res = await request(app).get(`/projects/${projectId}/tasks?${q}`).set("Cookie", ownerCookie);
        expect(res.status, q).toBe(400);
      }
    });
  });
});
