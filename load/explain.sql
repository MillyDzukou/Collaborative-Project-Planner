-- EXPLAIN ANALYZE for the queries behind the hot endpoints. Run against the load DB after seed-bulk.sql:
--   docker exec -i planner-load-postgres-1 psql -U planner -d planner < load/explain.sql
-- pick a real bulk user and a project they own
SELECT id AS u FROM users WHERE email = 'bulk-30000@example.com' \gset
SELECT id AS p FROM projects WHERE created_by = :u \gset
\echo '--- A: membership role lookup (every authenticated project request)'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) SELECT role FROM project_members WHERE project_id = :p AND user_id = :u;
\echo '--- B1: GET /projects list'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) SELECT p.* FROM projects p JOIN project_members pm ON pm.project_id = p.id WHERE pm.user_id = :u ORDER BY p.id ASC LIMIT 50 OFFSET 0;
\echo '--- B2: GET /projects count'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) SELECT count(*) AS n FROM project_members WHERE user_id = :u;
\echo '--- C: GET tasks page'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) SELECT * FROM tasks WHERE project_id = :p ORDER BY id ASC LIMIT 50 OFFSET 0;
\echo '--- D1: schedule tasks'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) SELECT id, duration_weeks FROM tasks WHERE project_id = :p;
\echo '--- D2: schedule dependencies'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) SELECT td.task_id, td.depends_on_task_id FROM task_dependencies td JOIN tasks t ON t.id = td.task_id WHERE t.project_id = :p;
\echo '--- F: login lookup'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) SELECT id, email, password_hash, name FROM users WHERE email = 'bulk-30000@example.com';
