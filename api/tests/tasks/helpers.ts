import express, { type Express } from "express";
import { pool } from "../../src/db/pool.js";
import { tasksRouter } from "../../src/tasks/router.js";

export function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use(tasksRouter);
  return app;
}

export interface SeededProject {
  projectId: number;
  userId: number;
}

let counter = 0;

/** Inserts a fresh user + project directly via SQL (no auth exists yet). */
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

  return { projectId: project.id, userId: user.id };
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
