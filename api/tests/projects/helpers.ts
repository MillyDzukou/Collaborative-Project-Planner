import { pool } from "../../src/db/pool.js";
import { AUTH_COOKIE_NAME } from "../../src/auth/index.js";
import { signAuthToken } from "../../src/auth/jwt.js";
import type { ProjectRole } from "../../src/projects/permissions.js";

let counter = 0;

export interface SeededUser {
  userId: number;
  email: string;
  name: string;
  /** `"<AUTH_COOKIE_NAME>=<jwt>"` — pass directly to `.set("Cookie", ...)`. */
  cookie: string;
}

/** Mints the same signed cookie value the auth module sets on login. */
export function cookieFor(userId: number, email: string): string {
  const token = signAuthToken({ id: userId, email });
  return `${AUTH_COOKIE_NAME}=${token}`;
}

/** Inserts a fresh user row (no project membership) with a valid auth cookie. */
export async function seedUser(namePrefix: string): Promise<SeededUser> {
  counter += 1;
  const unique = `${Date.now()}-${counter}`;
  const email = `${namePrefix}-${unique}@example.com`;
  const name = `${namePrefix} user`;

  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO users (email, password_hash, name)
     VALUES ($1, 'not-a-real-hash', $2)
     RETURNING id`,
    [email, name],
  );
  const user = rows[0];
  if (!user) {
    throw new Error("failed to seed user");
  }

  return { userId: user.id, email, name, cookie: cookieFor(user.id, email) };
}

export interface SeededProject {
  projectId: number;
  owner: SeededUser;
}

/** Inserts a fresh user + project owned by that user. */
export async function seedProject(namePrefix: string): Promise<SeededProject> {
  const owner = await seedUser(namePrefix);
  counter += 1;

  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO projects (name, description, created_by)
     VALUES ($1, 'seeded for tests', $2)
     RETURNING id`,
    [`${namePrefix} project ${Date.now()}-${counter}`, owner.userId],
  );
  const project = rows[0];
  if (!project) {
    throw new Error("failed to seed project");
  }

  await pool.query(`INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'owner')`, [
    project.id,
    owner.userId,
  ]);

  return { projectId: project.id, owner };
}

/** Seeds a fresh user and adds them to an existing project with the given role. */
export async function addMember(
  projectId: number,
  role: ProjectRole,
  namePrefix: string,
): Promise<SeededUser> {
  const user = await seedUser(namePrefix);
  await pool.query(`INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, $3)`, [
    projectId,
    user.userId,
    role,
  ]);
  return user;
}

export async function seedTask(
  projectId: number,
  overrides: Partial<{ name: string; durationWeeks: number; status: string }> = {},
): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO tasks (project_id, name, duration_weeks, status)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [projectId, overrides.name ?? "seeded task", overrides.durationWeeks ?? 1, overrides.status ?? "pending"],
  );
  const row = rows[0];
  if (!row) {
    throw new Error("failed to seed task");
  }
  return row.id;
}

export async function resetDatabase(): Promise<void> {
  await pool.query(
    "TRUNCATE task_dependencies, tasks, project_members, projects, users RESTART IDENTITY CASCADE",
  );
}
