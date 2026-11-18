import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { HttpError } from "../tasks/http-error.js";
import type { Pagination } from "../http/pagination.js";
import type { ProjectRole } from "./permissions.js";
import { isProjectRole } from "./permissions.js";
import { type MemberRow, type Member, type Project, type ProjectRow, toMember, toProject } from "./types.js";
import type { CreateProjectInput, UpdateProjectInput } from "./validation.js";

const MEMBER_SELECT = `
  SELECT pm.project_id, pm.user_id, pm.role, u.email, u.name
  FROM project_members pm
  JOIN users u ON u.id = pm.user_id
`;

export async function getMemberRole(projectId: number, userId: number): Promise<ProjectRole | null> {
  const { rows } = await pool.query<{ role: ProjectRole }>(
    "SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2",
    [projectId, userId],
  );
  return rows[0]?.role ?? null;
}

export async function listProjectsForUser(
  userId: number,
  { limit, offset }: Pagination,
): Promise<{ items: Project[]; total: number }> {
  const [{ rows }, count] = await Promise.all([
    pool.query<ProjectRow>(
      `SELECT p.*
       FROM projects p
       JOIN project_members pm ON pm.project_id = p.id
       WHERE pm.user_id = $1
       ORDER BY p.id ASC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    ),
    pool.query<{ n: string }>("SELECT count(*) AS n FROM project_members WHERE user_id = $1", [userId]),
  ]);
  return { items: rows.map(toProject), total: Number(count.rows[0]?.n ?? 0) };
}

export async function createProject(userId: number, input: CreateProjectInput): Promise<Project> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query<ProjectRow>(
      `INSERT INTO projects (name, description, created_by)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [input.name, input.description, userId],
    );
    const row = rows[0];
    if (!row) {
      throw new Error("insert did not return a row");
    }

    await client.query(
      `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [row.id, userId],
    );

    await client.query("COMMIT");
    return toProject(row);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function getProjectById(projectId: number): Promise<Project | null> {
  const { rows } = await pool.query<ProjectRow>("SELECT * FROM projects WHERE id = $1", [projectId]);
  const row = rows[0];
  return row ? toProject(row) : null;
}

export async function updateProject(projectId: number, patch: UpdateProjectInput): Promise<Project | null> {
  const columns: string[] = [];
  const values: unknown[] = [];
  let index = 1;

  if (patch.name !== undefined) {
    columns.push(`name = $${index++}`);
    values.push(patch.name);
  }
  if (patch.description !== undefined) {
    columns.push(`description = $${index++}`);
    values.push(patch.description);
  }

  if (columns.length === 0) {
    return getProjectById(projectId);
  }

  values.push(projectId);
  const { rows } = await pool.query<ProjectRow>(
    `UPDATE projects SET ${columns.join(", ")} WHERE id = $${index} RETURNING *`,
    values,
  );
  const row = rows[0];
  return row ? toProject(row) : null;
}

export async function deleteProject(projectId: number): Promise<boolean> {
  const { rowCount } = await pool.query("DELETE FROM projects WHERE id = $1", [projectId]);
  return (rowCount ?? 0) > 0;
}

export async function listMembers(
  projectId: number,
  { limit, offset }: Pagination,
): Promise<{ items: Member[]; total: number }> {
  const [{ rows }, count] = await Promise.all([
    pool.query<MemberRow>(`${MEMBER_SELECT} WHERE pm.project_id = $1 ORDER BY pm.user_id ASC LIMIT $2 OFFSET $3`, [projectId, limit, offset]),
    pool.query<{ n: string }>("SELECT count(*) AS n FROM project_members WHERE project_id = $1", [projectId]),
  ]);
  return { items: rows.map(toMember), total: Number(count.rows[0]?.n ?? 0) };
}

export async function findUserIdByEmail(email: string): Promise<number | null> {
  const { rows } = await pool.query<{ id: number }>("SELECT id FROM users WHERE email = $1", [email]);
  return rows[0]?.id ?? null;
}

/**
 * Invites a user (identified by email, which must already have an account)
 * to a project with the given role.
 */
export async function addMember(projectId: number, email: string, role: ProjectRole): Promise<Member> {
  const userId = await findUserIdByEmail(email);
  if (userId === null) {
    throw new HttpError(404, "user_not_found", `no user registered with email ${email}`);
  }

  try {
    await pool.query(
      `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, $3)`,
      [projectId, userId, role],
    );
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new HttpError(409, "already_member", "this user is already a member of the project");
    }
    throw err;
  }

  const { rows } = await pool.query<MemberRow>(`${MEMBER_SELECT} WHERE pm.project_id = $1 AND pm.user_id = $2`, [
    projectId,
    userId,
  ]);
  const row = rows[0];
  if (!row) {
    throw new Error("insert did not return a row");
  }
  return toMember(row);
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

/**
 * Changes a member's role, enforcing that the project always has at least
 * one remaining owner. Runs inside a transaction with the project's member
 * rows locked, so concurrent demotions/removals can't both succeed and
 * leave the project ownerless.
 */
export async function updateMemberRole(
  projectId: number,
  userId: number,
  role: ProjectRole,
): Promise<Member | null> {
  if (!isProjectRole(role)) {
    throw new HttpError(400, "invalid_request", "role must be one of owner, editor, viewer");
  }

  const client: PoolClient = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: memberRows } = await client.query<{ role: ProjectRole }>(
      "SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2 FOR UPDATE",
      [projectId, userId],
    );
    const existing = memberRows[0];
    if (!existing) {
      await client.query("ROLLBACK");
      return null;
    }

    if (existing.role === "owner" && role !== "owner") {
      const ownerCount = await countOwners(client, projectId);
      if (ownerCount <= 1) {
        throw new HttpError(422, "last_owner_required", "a project must always have at least one owner");
      }
    }

    await client.query("UPDATE project_members SET role = $1 WHERE project_id = $2 AND user_id = $3", [
      role,
      projectId,
      userId,
    ]);

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  const { rows } = await pool.query<MemberRow>(`${MEMBER_SELECT} WHERE pm.project_id = $1 AND pm.user_id = $2`, [
    projectId,
    userId,
  ]);
  const row = rows[0];
  return row ? toMember(row) : null;
}

/**
 * Removes a member, enforcing the same last-owner protection as
 * `updateMemberRole`.
 */
export async function removeMember(projectId: number, userId: number): Promise<"removed" | "not_found"> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: memberRows } = await client.query<{ role: ProjectRole }>(
      "SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2 FOR UPDATE",
      [projectId, userId],
    );
    const existing = memberRows[0];
    if (!existing) {
      await client.query("ROLLBACK");
      return "not_found";
    }

    if (existing.role === "owner") {
      const ownerCount = await countOwners(client, projectId);
      if (ownerCount <= 1) {
        throw new HttpError(422, "last_owner_required", "a project must always have at least one owner");
      }
    }

    await client.query("DELETE FROM project_members WHERE project_id = $1 AND user_id = $2", [projectId, userId]);
    await client.query("COMMIT");
    return "removed";
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function countOwners(client: PoolClient, projectId: number): Promise<number> {
  const { rows } = await client.query<{ count: string }>(
    "SELECT count(*) FROM project_members WHERE project_id = $1 AND role = 'owner'",
    [projectId],
  );
  return Number(rows[0]?.count ?? "0");
}
