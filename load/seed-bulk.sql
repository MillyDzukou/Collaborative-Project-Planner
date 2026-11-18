-- Bulk data for load testing / EXPLAIN ANALYZE. Run ONLY against the load-test database:
--   docker exec -i planner-load-postgres-1 psql -U planner -d planner < load/seed-bulk.sql
--
-- 50,000 users, 50,000 projects (each owned by one user), ~150,000 extra memberships
-- (every user also belongs to 3 other projects), 20 tasks per project (1M tasks) and ~900k
-- dependencies forming acyclic chains/branches. Password hashes are fake (these users can't log in).
BEGIN;

INSERT INTO users (email, password_hash, name)
SELECT 'bulk-' || g || '@example.com', 'not-a-real-hash', 'Bulk ' || g
FROM generate_series(1, 50000) g;

-- bulk users are the LAST 50,000 user ids; map generate_series index -> user id
WITH u AS (
  SELECT id, row_number() OVER (ORDER BY id) AS rn FROM users WHERE email LIKE 'bulk-%'
)
INSERT INTO projects (name, description, created_by)
SELECT 'Bulk project ' || rn, 'seeded', id FROM u;

INSERT INTO project_members (project_id, user_id, role)
SELECT p.id, p.created_by, 'owner' FROM projects p WHERE p.name LIKE 'Bulk project %';

-- each bulk user is also an editor/viewer on 3 other bulk projects (deterministic offsets, no self-membership)
WITH bp AS (
  SELECT id, created_by, row_number() OVER (ORDER BY id) AS rn FROM projects WHERE name LIKE 'Bulk project %'
)
INSERT INTO project_members (project_id, user_id, role)
SELECT other.id, me.created_by, (CASE WHEN k = 1 THEN 'editor' ELSE 'viewer' END)::project_role
FROM bp me
CROSS JOIN generate_series(1, 3) k
JOIN bp other ON other.rn = ((me.rn - 1 + k * 7919) % 50000) + 1
ON CONFLICT DO NOTHING;

INSERT INTO tasks (project_id, name, duration_weeks, status)
SELECT p.id, 'Task ' || t, 1 + (t % 5), 'pending'
FROM projects p CROSS JOIN generate_series(1, 20) t
WHERE p.name LIKE 'Bulk project %';

-- dependencies: within each project, task n depends on n-1 (n % 3 <> 0) and n-2 (n % 4 = 0)
WITH ranked AS (
  SELECT id, project_id, row_number() OVER (PARTITION BY project_id ORDER BY id) AS n
  FROM tasks WHERE project_id IN (SELECT id FROM projects WHERE name LIKE 'Bulk project %')
)
INSERT INTO task_dependencies (task_id, depends_on_task_id)
SELECT a.id, b.id FROM ranked a JOIN ranked b
  ON a.project_id = b.project_id
 AND ((a.n % 3 <> 0 AND b.n = a.n - 1) OR (a.n % 4 = 0 AND a.n >= 3 AND b.n = a.n - 2))
ON CONFLICT DO NOTHING;

COMMIT;
ANALYZE;
