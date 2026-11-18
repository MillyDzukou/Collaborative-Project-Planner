import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { pool } from "../../src/db/pool.js";
import { addMemberToProject, buildApp, resetDatabase, seedProject, seedTask } from "./helpers.js";

const app = buildApp();

describe("optimistic concurrency on PATCH /tasks/:id", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await pool.end();
  });

  it("requires the version field (400)", async () => {
    const { projectId, ownerCookie } = await seedProject("noversion");
    const taskId = await seedTask(projectId);

    const res = await request(app).patch(`/tasks/${taskId}`).set("Cookie", ownerCookie).send({ name: "x" });
    expect(res.status).toBe(400);
  });

  it("increments the version on every successful update", async () => {
    const { projectId, ownerCookie } = await seedProject("bump");
    const taskId = await seedTask(projectId);

    const first = await request(app).patch(`/tasks/${taskId}`).set("Cookie", ownerCookie).send({ version: 1, name: "a" });
    const second = await request(app).patch(`/tasks/${taskId}`).set("Cookie", ownerCookie).send({ version: 2, name: "b" });

    expect(first.body.task.version).toBe(2);
    expect(second.body.task.version).toBe(3);
  });

  it("returns 409 with the current state when the version is stale", async () => {
    const { projectId, ownerCookie } = await seedProject("stale");
    const editor = await addMemberToProject(projectId, "editor", "stale-editor");
    const taskId = await seedTask(projectId, { name: "original" });

    // Both users loaded version 1; the editor saves first.
    await request(app).patch(`/tasks/${taskId}`).set("Cookie", editor.cookie).send({ version: 1, name: "editor's change" });

    const res = await request(app).patch(`/tasks/${taskId}`).set("Cookie", ownerCookie).send({ version: 1, name: "owner's change" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("version_conflict");
    expect(res.body.error.details.current).toMatchObject({ id: taskId, name: "editor's change", version: 2 });

    // The stale write must not have been applied.
    const { rows } = await pool.query("SELECT name, version FROM tasks WHERE id = $1", [taskId]);
    expect(rows[0]).toMatchObject({ name: "editor's change", version: 2 });
  });

  it("lets the loser retry successfully with the version from the 409", async () => {
    const { projectId, ownerCookie } = await seedProject("retry");
    const taskId = await seedTask(projectId);
    await request(app).patch(`/tasks/${taskId}`).set("Cookie", ownerCookie).send({ version: 1, name: "first" });

    const conflict = await request(app).patch(`/tasks/${taskId}`).set("Cookie", ownerCookie).send({ version: 1, name: "second" });
    const retry = await request(app)
      .patch(`/tasks/${taskId}`)
      .set("Cookie", ownerCookie)
      .send({ version: conflict.body.error.details.current.version, name: "second" });

    expect(retry.status).toBe(200);
    expect(retry.body.task).toMatchObject({ name: "second", version: 3 });
  });

  it("with simultaneous updates from the same version, exactly one succeeds", async () => {
    const { projectId, ownerCookie } = await seedProject("race");
    const taskId = await seedTask(projectId);

    const attempts = Array.from({ length: 10 }, (_, i) =>
      request(app).patch(`/tasks/${taskId}`).set("Cookie", ownerCookie).send({ version: 1, name: `writer ${i}` }),
    );
    const results = await Promise.all(attempts);

    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(9);

    const { rows } = await pool.query("SELECT version FROM tasks WHERE id = $1", [taskId]);
    expect(rows[0].version).toBe(2);
  });
});
