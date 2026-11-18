import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { pool } from "../../src/db/pool.js";
import { buildApp, resetDatabase, seedProject, seedTask } from "./helpers.js";

const app = buildApp();

describe("task CRUD", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await pool.end();
  });

  it("creates a task with valid input", async () => {
    const { projectId, ownerCookie } = await seedProject("create");

    const res = await request(app)
      .post(`/projects/${projectId}/tasks`)
      .set("Cookie", ownerCookie)
      .send({ name: "Design schema", duration_weeks: 2 });

    expect(res.status).toBe(201);
    expect(res.body.task).toMatchObject({
      projectId,
      name: "Design schema",
      durationWeeks: 2,
      status: "pending",
      assigneeId: null,
      version: 1,
    });
  });

  it("rejects creating a task with duration_weeks <= 0", async () => {
    const { projectId, ownerCookie } = await seedProject("baddur");

    const resZero = await request(app)
      .post(`/projects/${projectId}/tasks`)
      .set("Cookie", ownerCookie)
      .send({ name: "Bad task", duration_weeks: 0 });
    expect(resZero.status).toBe(400);
    expect(resZero.body.error).toBeDefined();
    expect(resZero.body.error.code).toBeTypeOf("string");

    const resNegative = await request(app)
      .post(`/projects/${projectId}/tasks`)
      .set("Cookie", ownerCookie)
      .send({ name: "Bad task", duration_weeks: -3 });
    expect(resNegative.status).toBe(400);
    expect(resNegative.body.error).toBeDefined();
  });

  it("rejects creating a task for a project that does not exist", async () => {
    const { ownerCookie } = await seedProject("orphan-caller");

    const res = await request(app)
      .post("/projects/999999/tasks")
      .set("Cookie", ownerCookie)
      .send({ name: "Orphan task", duration_weeks: 1 });
    expect(res.status).toBe(404);
  });

  it("lists tasks for a project", async () => {
    const { projectId, ownerCookie } = await seedProject("list");
    await seedTask(projectId, { name: "A" });
    await seedTask(projectId, { name: "B" });

    const res = await request(app).get(`/projects/${projectId}/tasks`).set("Cookie", ownerCookie);
    expect(res.status).toBe(200);
    expect(res.body.tasks).toHaveLength(2);
  });

  it("updates a task's mutable fields", async () => {
    const { projectId, ownerCookie } = await seedProject("update");
    const taskId = await seedTask(projectId, { name: "Old name" });

    const res = await request(app)
      .patch(`/tasks/${taskId}`)
      .set("Cookie", ownerCookie)
      .send({ version: 1, name: "New name", status: "in_progress" });

    expect(res.status).toBe(200);
    expect(res.body.task).toMatchObject({ name: "New name", status: "in_progress", version: 2 });
  });

  it("returns 404 when updating a task that does not exist", async () => {
    const { ownerCookie } = await seedProject("update-missing");
    const res = await request(app)
      .patch("/tasks/999999")
      .set("Cookie", ownerCookie)
      .send({ version: 1, name: "Nope" });
    expect(res.status).toBe(404);
  });

  it("deletes a task", async () => {
    const { projectId, ownerCookie } = await seedProject("delete");
    const taskId = await seedTask(projectId);

    const res = await request(app).delete(`/tasks/${taskId}`).set("Cookie", ownerCookie);
    expect(res.status).toBe(204);

    const getRes = await request(app).get(`/projects/${projectId}/tasks`).set("Cookie", ownerCookie);
    expect(getRes.body.tasks).toHaveLength(0);
  });
});
