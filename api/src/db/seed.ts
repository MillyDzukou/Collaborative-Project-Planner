import { pool } from "./pool.js";

async function seed() {
  const { rows: [user] } = await pool.query<{ id: number }>(
    `INSERT INTO users (email, password_hash, name)
     VALUES ('demo@example.com', 'not-a-real-hash', 'Demo User')
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
  );
  if (!user) {
    throw new Error("seed: failed to insert or find demo user");
  }

  const { rows: [project] } = await pool.query<{ id: number }>(
    `INSERT INTO projects (name, description, created_by)
     VALUES ('Sample Project', 'Seeded demo project', $1)
     RETURNING id`,
    [user.id],
  );
  if (!project) {
    throw new Error("seed: failed to insert demo project");
  }

  await pool.query(
    `INSERT INTO project_members (project_id, user_id, role)
     VALUES ($1, $2, 'owner')
     ON CONFLICT DO NOTHING`,
    [project.id, user.id],
  );

  console.log(`Seeded user ${user.id} and project ${project.id}`);
  await pool.end();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
