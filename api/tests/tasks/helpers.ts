import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import { pool } from "../../src/db/pool.js";
import { tasksRouter } from "../../src/tasks/router.js";
import { errorHandler } from "../../src/http/errorHandler.js";
import { AUTH_COOKIE_NAME } from "../../src/auth/index.js";
import { signAuthToken } from "../../src/auth/jwt.js";
import type { ProjectRole } from "../../src/projects/permissions.js";

export function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(tasksRouter);
  app.use(errorHandler);
  return app;
}

export interface SeededProject {
  projectId: number;
  userId: number;
  /** `"<AUTH_COOKIE_NAME>=<jwt>"` for the seeded owner — pass to `.set("Cookie", ...)`. */
  ownerCookie: string;
}

export interface SeededUser {
  userId: number;
  email: string;
  /** `"<AUTH_COOKIE_NAME>=<jwt>"` for this user — pass to `.set("Cookie", ...)`. */
  cookie: string;
}

let counter = 0;

/** Mints the same signed cookie value the auth module sets on login. */
export function cookieFor(userId: number, email: string): string {
  const token = signAuthToken({ id: userId, email });
  return `${AUTH_COOKIE_NAME}=${token}`;
}

/** Inserts a fresh user (no project membership) and returns an auth cookie for it. */
export async function seedUser(namePrefix: string): Promise<SeededUser> {
  counter += 1;
  const unique = `${Date.now()}-${counter}`;
  const email = `${namePrefix}-${unique}@example.com`;

  const userResult = await pool.query<{ id: number }>(
    `INSERT INTO users (email, password_hash, name)
     VALUES ($1, 'not-a-real-hash', $2)
     RETURNING id`,
    [email, `${namePrefix} user`],
  );
  const user = userResult.rows[0];
  if (!user) {
    throw new Error("failed to seed user");
  }

  return { userId: user.id, email, cookie: cookieFor(user.id, email) };
}

/** Inserts a fresh user + project (owned by that user) and returns an auth cookie for the owner. */
export async function seedProject(namePrefix: string): Promise<SeededProject> {
  counter += 1;
  const unique = `${Date.now()}-${counter}`;

  const userResult = await pool.query<{ id: number }>(
    `INSERT INTO users (email, password_hash, name)
     VALUES ($1, 'not-a-real-hash', $2)
     RETURNING id`,
    [`${namePrefix}-${unique}@example.com`, `${namePrefix} user`],
  );
  const user = userResult.rows[0];
  if (!user) {
    throw new Error("failed to seed user");
  }

  const projectResult = await pool.query<{ id: number }>(
    `INSERT INTO projects (name, description, created_by)
     VALUES ($1, 'seeded for tests', $2)
     RETURNING id`,
    [`${namePrefix} project ${unique}`, user.id],
  );
  const project = projectResult.rows[0];
  if (!project) {
    throw new Error("failed to seed project");
  }

  await pool.query(
    `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'owner')`,
    [project.id, user.id],
  );

  return {
    projectId: project.id,
    userId: user.id,
    ownerCookie: cookieFor(user.id, `${namePrefix}-${unique}@example.com`),
  };
}

/** Adds an existing (or newly seeded) user to a project with the given role, returning their cookie. */
export async function addMemberToProject(
  projectId: number,
  role: ProjectRole,
  namePrefix: string,
): Promise<SeededUser> {
  const user = await seedUser(namePrefix);
  await pool.query(
    `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, $3)`,
    [projectId, user.userId, role],
  );
  return user;
}

export async function seedTask(
  projectId: number,
  overrides: Partial<{ name: string; durationWeeks: number; status: string }> = {},
): Promise<number> {
  const result = await pool.query<{ id: number }>(
    `INSERT INTO tasks (project_id, name, duration_weeks, status)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [
      projectId,
      overrides.name ?? "seeded task",
      overrides.durationWeeks ?? 1,
      overrides.status ?? "pending",
    ],
  );
  const row = result.rows[0];
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
