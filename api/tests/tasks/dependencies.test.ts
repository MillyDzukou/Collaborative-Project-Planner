import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { pool } from "../../src/db/pool.js";
import { buildApp, resetDatabase, seedProject, seedTask } from "./helpers.js";

const app = buildApp();

describe("task dependencies", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await pool.end();
  });

  it("rejects a task depending on itself with 422", async () => {
    const { projectId } = await seedProject("self");
    const taskId = await seedTask(projectId, { name: "A" });

    const res = await request(app)
      .post(`/tasks/${taskId}/dependencies`)
      .send({ dependsOnTaskId: taskId });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("self_dependency");
  });

  it("rejects a 3-task cycle: A->B, B->C, then C->A", async () => {
    const { projectId } = await seedProject("cycle");
    const a = await seedTask(projectId, { name: "A" });
    const b = await seedTask(projectId, { name: "B" });
    const c = await seedTask(projectId, { name: "C" });

    const first = await request(app)
      .post(`/tasks/${a}/dependencies`)
      .send({ dependsOnTaskId: b });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post(`/tasks/${b}/dependencies`)
      .send({ dependsOnTaskId: c });
    expect(second.status).toBe(201);

    const third = await request(app)
      .post(`/tasks/${c}/dependencies`)
      .send({ dependsOnTaskId: a });
    expect(third.status).toBe(422);
    expect(third.body.error.code).toBe("dependency_cycle");

    // the rejected edge must not have been partially written
    const check = await pool.query(
      "SELECT 1 FROM task_dependencies WHERE task_id = $1 AND depends_on_task_id = $2",
      [c, a],
    );
    expect(check.rowCount).toBe(0);
  });

  it("rejects a dependency between tasks in two different projects with 422", async () => {
    const projectOne = await seedProject("cross-one");
    const projectTwo = await seedProject("cross-two");
    const taskInProjectOne = await seedTask(projectOne.projectId, { name: "P1 task" });
    const taskInProjectTwo = await seedTask(projectTwo.projectId, { name: "P2 task" });

    const res = await request(app)
      .post(`/tasks/${taskInProjectOne}/dependencies`)
      .send({ dependsOnTaskId: taskInProjectTwo });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("cross_project_dependency");
  });

  it("accepts a valid dependency chain", async () => {
    const { projectId } = await seedProject("chain");
    const a = await seedTask(projectId, { name: "A" });
    const b = await seedTask(projectId, { name: "B" });
    const c = await seedTask(projectId, { name: "C" });

    const ab = await request(app)
      .post(`/tasks/${a}/dependencies`)
      .send({ dependsOnTaskId: b });
    expect(ab.status).toBe(201);

    const bc = await request(app)
      .post(`/tasks/${b}/dependencies`)
      .send({ dependsOnTaskId: c });
    expect(bc.status).toBe(201);

    const check = await pool.query(
      "SELECT task_id, depends_on_task_id FROM task_dependencies WHERE task_id = ANY($1::int[]) ORDER BY task_id",
      [[a, b]],
    );
    expect(check.rows).toEqual([
      { task_id: a, depends_on_task_id: b },
      { task_id: b, depends_on_task_id: c },
    ]);
  });

  it("removes a dependency", async () => {
    const { projectId } = await seedProject("remove");
    const a = await seedTask(projectId, { name: "A" });
    const b = await seedTask(projectId, { name: "B" });

    await request(app).post(`/tasks/${a}/dependencies`).send({ dependsOnTaskId: b });

    const del = await request(app).delete(`/tasks/${a}/dependencies/${b}`);
    expect(del.status).toBe(204);

    const check = await pool.query(
      "SELECT 1 FROM task_dependencies WHERE task_id = $1 AND depends_on_task_id = $2",
      [a, b],
    );
    expect(check.rowCount).toBe(0);
  });

  it("returns 404 when removing a dependency that does not exist", async () => {
    const { projectId } = await seedProject("remove-missing");
    const a = await seedTask(projectId, { name: "A" });
    const b = await seedTask(projectId, { name: "B" });

    const del = await request(app).delete(`/tasks/${a}/dependencies/${b}`);
    expect(del.status).toBe(404);
  });
});
