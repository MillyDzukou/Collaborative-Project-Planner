import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../../src/server.js";
import { pool } from "../../src/db/pool.js";
import { addMember, resetDatabase, seedProject, seedTask, seedUser } from "./helpers.js";

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetDatabase();
});

describe("permission matrix: viewer cannot write", () => {
  it("a viewer cannot create a task (403)", async () => {
    const { projectId } = await seedProject("viewer-create");
    const viewer = await addMember(projectId, "viewer", "viewer-create-member");

    const res = await request(app)
      .post(`/projects/${projectId}/tasks`)
      .set("Cookie", viewer.cookie)
      .send({ name: "Nope", duration_weeks: 1 });

    expect(res.status).toBe(403);
  });

  it("a viewer cannot edit a task (403)", async () => {
    const { projectId } = await seedProject("viewer-edit");
    const viewer = await addMember(projectId, "viewer", "viewer-edit-member");
    const taskId = await seedTask(projectId);

    const res = await request(app)
      .patch(`/tasks/${taskId}`)
      .set("Cookie", viewer.cookie)
      .send({ name: "Changed" });

    expect(res.status).toBe(403);
  });

  it("a viewer cannot delete a task (403)", async () => {
    const { projectId } = await seedProject("viewer-delete");
    const viewer = await addMember(projectId, "viewer", "viewer-delete-member");
    const taskId = await seedTask(projectId);

    const res = await request(app).delete(`/tasks/${taskId}`).set("Cookie", viewer.cookie);

    expect(res.status).toBe(403);
  });
});

describe("permission matrix: non-member gets 404, never 403", () => {
  it("a non-member cannot read a project (404)", async () => {
    const { projectId } = await seedProject("nonmember-project");
    const outsider = await seedUser("outsider-project");

    const res = await request(app).get(`/projects/${projectId}`).set("Cookie", outsider.cookie);

    expect(res.status).toBe(404);
  });

  it("a non-member cannot read a project's tasks (404)", async () => {
    const { projectId } = await seedProject("nonmember-tasks");
    const outsider = await seedUser("outsider-tasks");
    await seedTask(projectId);

    const res = await request(app).get(`/projects/${projectId}/tasks`).set("Cookie", outsider.cookie);

    expect(res.status).toBe(404);
  });

  it("a non-member cannot read a project's schedule (404)", async () => {
    const { projectId } = await seedProject("nonmember-schedule");
    const outsider = await seedUser("outsider-schedule");
    await seedTask(projectId);

    const res = await request(app).get(`/projects/${projectId}/schedule`).set("Cookie", outsider.cookie);

    expect(res.status).toBe(404);
  });

  it("a non-member cannot read a single task (404)", async () => {
    const { projectId } = await seedProject("nonmember-task");
    const outsider = await seedUser("outsider-task");
    const taskId = await seedTask(projectId);

    const res = await request(app).get(`/tasks/${taskId}`).set("Cookie", outsider.cookie);

    expect(res.status).toBe(404);
  });

  it("requests with no auth cookie at all are rejected with 401, not 403/404", async () => {
    const { projectId } = await seedProject("unauthed");

    const res = await request(app).get(`/projects/${projectId}`);

    expect(res.status).toBe(401);
  });
});

describe("permission matrix: owner member management", () => {
  it("an owner can remove a member", async () => {
    const { projectId, owner } = await seedProject("owner-removes");
    const editor = await addMember(projectId, "editor", "owner-removes-editor");

    const res = await request(app)
      .delete(`/projects/${projectId}/members/${editor.userId}`)
      .set("Cookie", owner.cookie);

    expect(res.status).toBe(204);

    const check = await pool.query(
      "SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2",
      [projectId, editor.userId],
    );
    expect(check.rowCount).toBe(0);
  });

  it("the last owner of a project cannot be removed (422)", async () => {
    const { projectId, owner } = await seedProject("last-owner-remove");

    const res = await request(app)
      .delete(`/projects/${projectId}/members/${owner.userId}`)
      .set("Cookie", owner.cookie);

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("last_owner_required");

    const check = await pool.query(
      "SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2",
      [projectId, owner.userId],
    );
    expect(check.rowCount).toBe(1);
  });

  it("the last owner of a project cannot be demoted to editor or viewer (422)", async () => {
    const { projectId, owner } = await seedProject("last-owner-demote");

    const res = await request(app)
      .patch(`/projects/${projectId}/members/${owner.userId}`)
      .set("Cookie", owner.cookie)
      .send({ role: "editor" });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("last_owner_required");

    const check = await pool.query<{ role: string }>(
      "SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2",
      [projectId, owner.userId],
    );
    expect(check.rows[0]?.role).toBe("owner");
  });

  it("a non-last owner CAN be demoted, as long as another owner remains", async () => {
    const { projectId, owner } = await seedProject("demote-ok");
    const secondOwner = await addMember(projectId, "owner", "demote-ok-second");

    const res = await request(app)
      .patch(`/projects/${projectId}/members/${secondOwner.userId}`)
      .set("Cookie", owner.cookie)
      .send({ role: "editor" });

    expect(res.status).toBe(200);
    expect(res.body.member).toMatchObject({ userId: secondOwner.userId, role: "editor" });
  });
});

describe("permission matrix: editor can manage tasks but not members", () => {
  it("an editor CAN create a task", async () => {
    const { projectId } = await seedProject("editor-create");
    const editor = await addMember(projectId, "editor", "editor-create-member");

    const res = await request(app)
      .post(`/projects/${projectId}/tasks`)
      .set("Cookie", editor.cookie)
      .send({ name: "Editor task", duration_weeks: 1 });

    expect(res.status).toBe(201);
  });

  it("an editor CAN edit a task", async () => {
    const { projectId } = await seedProject("editor-edit");
    const editor = await addMember(projectId, "editor", "editor-edit-member");
    const taskId = await seedTask(projectId);

    const res = await request(app)
      .patch(`/tasks/${taskId}`)
      .set("Cookie", editor.cookie)
      .send({ name: "Edited by editor" });

    expect(res.status).toBe(200);
    expect(res.body.task).toMatchObject({ name: "Edited by editor" });
  });

  it("an editor CANNOT invite a member (403)", async () => {
    const { projectId } = await seedProject("editor-invite");
    const editor = await addMember(projectId, "editor", "editor-invite-member");
    const invitee = await seedUser("editor-invite-target");

    const res = await request(app)
      .post(`/projects/${projectId}/members`)
      .set("Cookie", editor.cookie)
      .send({ email: invitee.email, role: "viewer" });

    expect(res.status).toBe(403);
  });

  it("an editor CANNOT change another member's role (403)", async () => {
    const { projectId } = await seedProject("editor-change-role");
    const editor = await addMember(projectId, "editor", "editor-change-role-member");
    const viewer = await addMember(projectId, "viewer", "editor-change-role-viewer");

    const res = await request(app)
      .patch(`/projects/${projectId}/members/${viewer.userId}`)
      .set("Cookie", editor.cookie)
      .send({ role: "editor" });

    expect(res.status).toBe(403);
  });

  it("an editor CANNOT remove a member (403)", async () => {
    const { projectId } = await seedProject("editor-remove");
    const editor = await addMember(projectId, "editor", "editor-remove-member");
    const viewer = await addMember(projectId, "viewer", "editor-remove-viewer");

    const res = await request(app)
      .delete(`/projects/${projectId}/members/${viewer.userId}`)
      .set("Cookie", editor.cookie);

    expect(res.status).toBe(403);
  });

  it("an editor CANNOT delete the project (403)", async () => {
    const { projectId } = await seedProject("editor-delete-project");
    const editor = await addMember(projectId, "editor", "editor-delete-project-member");

    const res = await request(app).delete(`/projects/${projectId}`).set("Cookie", editor.cookie);

    expect(res.status).toBe(403);
  });
});

describe("permission matrix: any member can read", () => {
  it("an owner, editor, and viewer can all read the project's tasks", async () => {
    const { projectId, owner } = await seedProject("read-tasks");
    const editor = await addMember(projectId, "editor", "read-tasks-editor");
    const viewer = await addMember(projectId, "viewer", "read-tasks-viewer");
    await seedTask(projectId);

    for (const cookie of [owner.cookie, editor.cookie, viewer.cookie]) {
      const res = await request(app).get(`/projects/${projectId}/tasks`).set("Cookie", cookie);
      expect(res.status).toBe(200);
      expect(res.body.tasks).toHaveLength(1);
    }
  });

  it("an owner, editor, and viewer can all read the project's schedule", async () => {
    const { projectId, owner } = await seedProject("read-schedule");
    const editor = await addMember(projectId, "editor", "read-schedule-editor");
    const viewer = await addMember(projectId, "viewer", "read-schedule-viewer");
    const a = await seedTask(projectId, { name: "A", durationWeeks: 2 });
    const b = await seedTask(projectId, { name: "B", durationWeeks: 3 });
    await pool.query("INSERT INTO task_dependencies (task_id, depends_on_task_id) VALUES ($1, $2)", [b, a]);

    for (const cookie of [owner.cookie, editor.cookie, viewer.cookie]) {
      const res = await request(app).get(`/projects/${projectId}/schedule`).set("Cookie", cookie);
      expect(res.status).toBe(200);
      expect(res.body.tasks).toHaveLength(2);
    }
  });
});
