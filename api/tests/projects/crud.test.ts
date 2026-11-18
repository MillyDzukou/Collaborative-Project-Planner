import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../../src/server.js";
import { pool } from "../../src/db/pool.js";
import { addMember, resetDatabase, seedProject, seedUser } from "./helpers.js";

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetDatabase();
});

describe("GET/POST /projects", () => {
  it("requires auth", async () => {
    const res = await request(app).get("/projects");
    expect(res.status).toBe(401);
  });

  it("creates a project and makes the caller the owner", async () => {
    const user = await seedUser("create-project");

    const res = await request(app)
      .post("/projects")
      .set("Cookie", user.cookie)
      .send({ name: "New Project", description: "desc" });

    expect(res.status).toBe(201);
    expect(res.body.project).toMatchObject({ name: "New Project", description: "desc" });

    const memberRow = await pool.query<{ role: string }>(
      "SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2",
      [res.body.project.id, user.userId],
    );
    expect(memberRow.rows[0]?.role).toBe("owner");
  });

  it("lists only the caller's own projects", async () => {
    const { owner } = await seedProject("list-mine");
    await seedProject("list-not-mine");

    const res = await request(app).get("/projects").set("Cookie", owner.cookie);

    expect(res.status).toBe(200);
    expect(res.body.projects).toHaveLength(1);
  });
});

describe("GET/PATCH/DELETE /projects/:id", () => {
  it("a member can read the project", async () => {
    const { projectId, owner } = await seedProject("read-project");

    const res = await request(app).get(`/projects/${projectId}`).set("Cookie", owner.cookie);

    expect(res.status).toBe(200);
    expect(res.body.project).toMatchObject({ id: projectId });
  });

  it("an owner can update the project", async () => {
    const { projectId, owner } = await seedProject("update-project");

    const res = await request(app)
      .patch(`/projects/${projectId}`)
      .set("Cookie", owner.cookie)
      .send({ name: "Renamed" });

    expect(res.status).toBe(200);
    expect(res.body.project).toMatchObject({ name: "Renamed" });
  });

  it("an owner can delete the project", async () => {
    const { projectId, owner } = await seedProject("delete-project");

    const res = await request(app).delete(`/projects/${projectId}`).set("Cookie", owner.cookie);
    expect(res.status).toBe(204);

    const check = await pool.query("SELECT 1 FROM projects WHERE id = $1", [projectId]);
    expect(check.rowCount).toBe(0);
  });
});

describe("project members", () => {
  it("an owner can invite an existing user by email", async () => {
    const { projectId, owner } = await seedProject("invite");
    const invitee = await seedUser("invite-target");

    const res = await request(app)
      .post(`/projects/${projectId}/members`)
      .set("Cookie", owner.cookie)
      .send({ email: invitee.email, role: "editor" });

    expect(res.status).toBe(201);
    expect(res.body.member).toMatchObject({ userId: invitee.userId, role: "editor", email: invitee.email });
  });

  it("inviting an unknown email returns 404", async () => {
    const { projectId, owner } = await seedProject("invite-unknown");

    const res = await request(app)
      .post(`/projects/${projectId}/members`)
      .set("Cookie", owner.cookie)
      .send({ email: "nobody@example.com", role: "viewer" });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("user_not_found");
  });

  it("inviting an existing member again returns 409", async () => {
    const { projectId, owner } = await seedProject("invite-twice");
    const existing = await addMember(projectId, "viewer", "invite-twice-member");

    const res = await request(app)
      .post(`/projects/${projectId}/members`)
      .set("Cookie", owner.cookie)
      .send({ email: existing.email, role: "editor" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("already_member");
  });

  it("lists members with their roles", async () => {
    const { projectId, owner } = await seedProject("list-members");
    const editor = await addMember(projectId, "editor", "list-members-editor");

    const res = await request(app).get(`/projects/${projectId}/members`).set("Cookie", owner.cookie);

    expect(res.status).toBe(200);
    const userIds = (res.body.members as Array<{ userId: number }>).map((m) => m.userId).sort();
    expect(userIds).toEqual([owner.userId, editor.userId].sort((a, b) => a - b));
  });
});
