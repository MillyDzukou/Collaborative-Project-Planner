/**
 * Seeds a demo account with a sample project network, for a public demo deployment.
 *
 *   DEMO_PASSWORD='something-long-and-unique' npm run seed:demo      (dev, via tsx)
 *   DEMO_PASSWORD=... node dist/db/seedDemo.js                       (production image)
 *
 * Idempotent: if the demo user already exists nothing is changed. The demo password is read from the
 * environment (never committed) and stored only as an argon2 hash. To demo your own network, replace
 * `NETWORK` below with your tasks (durations in weeks) and finish-to-start dependencies.
 */
import { hashPassword } from "../auth/password.js";
import { logger } from "../logger.js";
import { pool } from "./pool.js";

const DEMO_EMAIL = process.env.DEMO_EMAIL ?? "demo@planner.example";
const PROJECT_NAME = "Product launch (demo)";

// [name, durationWeeks, names it depends on]
const NETWORK: [string, number, string[]][] = [
  ["Requirements", 2, []],
  ["UX design", 3, ["Requirements"]],
  ["Infrastructure setup", 2, ["Requirements"]],
  ["Backend API", 5, ["UX design", "Infrastructure setup"]],
  ["Frontend", 4, ["UX design"]],
  ["Authentication", 3, ["Infrastructure setup"]],
  ["Integration", 2, ["Backend API", "Frontend", "Authentication"]],
  ["QA and bug fixing", 3, ["Integration"]],
  ["Documentation", 2, ["Backend API", "Frontend"]],
  ["Load testing", 1, ["QA and bug fixing"]],
  ["Launch", 1, ["QA and bug fixing", "Documentation", "Load testing"]],
];

async function main(): Promise<void> {
  const password = process.env.DEMO_PASSWORD;
  if (!password || password.length < 10) {
    throw new Error("DEMO_PASSWORD must be set to a password of at least 10 characters");
  }

  const existing = await pool.query<{ id: number }>("SELECT id FROM users WHERE email = $1", [DEMO_EMAIL]);
  if (existing.rows.length > 0) {
    logger.info({ email: DEMO_EMAIL }, "demo user already exists; nothing to do");
    return;
  }

  const passwordHash = await hashPassword(password);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: [user] } = await client.query<{ id: number }>(
      "INSERT INTO users (email, password_hash, name) VALUES ($1, $2, 'Demo User') RETURNING id",
      [DEMO_EMAIL, passwordHash],
    );
    const { rows: [project] } = await client.query<{ id: number }>(
      `INSERT INTO projects (name, description, created_by)
       VALUES ($1, 'Sample plan: add tasks, link dependencies, watch the critical path change.', $2) RETURNING id`,
      [PROJECT_NAME, user!.id],
    );
    await client.query("INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'owner')", [project!.id, user!.id]);

    const idByName = new Map<string, number>();
    for (const [name, weeks] of NETWORK) {
      const { rows: [task] } = await client.query<{ id: number }>(
        "INSERT INTO tasks (project_id, name, duration_weeks) VALUES ($1, $2, $3) RETURNING id",
        [project!.id, name, weeks],
      );
      idByName.set(name, task!.id);
    }
    for (const [name, , deps] of NETWORK) {
      for (const dep of deps) {
        await client.query("INSERT INTO task_dependencies (task_id, depends_on_task_id) VALUES ($1, $2)", [
          idByName.get(name),
          idByName.get(dep),
        ]);
      }
    }

    await client.query("COMMIT");
    logger.info({ email: DEMO_EMAIL, projectId: project!.id, tasks: NETWORK.length }, "demo account seeded");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

main()
  .catch((err) => {
    logger.error({ err }, "demo seed failed");
    process.exitCode = 1;
  })
  .finally(() => pool.end());
