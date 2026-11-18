import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { HttpError } from "./http-error.js";
import type { Pagination } from "../http/pagination.js";
import type { CreateTaskInput, UpdateTaskInput } from "./validation.js";
import { type DependencyEdgeRow, type TaskRow, toTask, type Task } from "./types.js";

export async function projectExists(projectId: number): Promise<boolean> {
  const { rowCount } = await pool.query("SELECT 1 FROM projects WHERE id = $1", [projectId]);
  return (rowCount ?? 0) > 0;
}

export async function listTasksForProject(
  projectId: number,
  { limit, offset }: Pagination,
): Promise<{ items: Task[]; total: number }> {
  const [{ rows }, count] = await Promise.all([
    pool.query<TaskRow>("SELECT * FROM tasks WHERE project_id = $1 ORDER BY id ASC LIMIT $2 OFFSET $3", [projectId, limit, offset]),
    pool.query<{ n: string }>("SELECT count(*) AS n FROM tasks WHERE project_id = $1", [projectId]),
  ]);
  return { items: rows.map(toTask), total: Number(count.rows[0]?.n ?? 0) };
}

export async function listDependenciesForProject(
  projectId: number,
): Promise<{ taskId: number; dependsOnTaskId: number }[]> {
  const { rows } = await pool.query<DependencyEdgeRow>(
    `SELECT td.task_id, td.depends_on_task_id
       FROM task_dependencies td
       JOIN tasks t ON t.id = td.task_id
      WHERE t.project_id = $1
      ORDER BY td.task_id, td.depends_on_task_id`,
    [projectId],
  );
  return rows.map((r) => ({ taskId: r.task_id, dependsOnTaskId: r.depends_on_task_id }));
}

export async function createTask(projectId: number, input: CreateTaskInput): Promise<Task> {
  const { rows } = await pool.query<TaskRow>(
    `INSERT INTO tasks (project_id, name, duration_weeks, status, assignee_id, cost)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [projectId, input.name, input.durationWeeks, input.status, input.assigneeId, input.cost],
  );
  const row = rows[0];
  if (!row) {
    throw new Error("insert did not return a row");
  }
  return toTask(row);
}

export async function getTaskById(taskId: number): Promise<Task | null> {
  const { rows } = await pool.query<TaskRow>("SELECT * FROM tasks WHERE id = $1", [taskId]);
  const row = rows[0];
  return row ? toTask(row) : null;
}

export async function updateTask(taskId: number, patch: UpdateTaskInput): Promise<Task | null> {
  const columns: string[] = [];
  const values: unknown[] = [];
  let index = 1;

  if (patch.name !== undefined) {
    columns.push(`name = $${index++}`);
    values.push(patch.name);
  }
  if (patch.durationWeeks !== undefined) {
    columns.push(`duration_weeks = $${index++}`);
    values.push(patch.durationWeeks);
  }
  if (patch.status !== undefined) {
    columns.push(`status = $${index++}`);
    values.push(patch.status);
  }
  if (patch.assigneeId !== undefined) {
    columns.push(`assignee_id = $${index++}`);
    values.push(patch.assigneeId);
  }
  if (patch.cost !== undefined) {
    columns.push(`cost = $${index++}`);
    values.push(patch.cost);
  }

  columns.push("version = version + 1", "updated_at = now()");

  // Optimistic concurrency: a single atomic compare-and-set. If another
  // writer got in first the version no longer matches and zero rows update,
  // so concurrent edits can never silently overwrite each other.
  values.push(taskId, patch.version);
  const { rows } = await pool.query<TaskRow>(
    `UPDATE tasks SET ${columns.join(", ")}
      WHERE id = $${index++} AND version = $${index}
      RETURNING *`,
    values,
  );
  const row = rows[0];
  if (row) {
    return toTask(row);
  }

  // Zero rows: either the task is gone (404) or the version was stale (409).
  const current = await getTaskById(taskId);
  if (!current) {
    return null;
  }
  throw new HttpError(
    409,
    "version_conflict",
    `task was changed by someone else (you had version ${patch.version}, current is ${current.version})`,
    { current },
  );
}

export async function deleteTask(taskId: number): Promise<boolean> {
  const { rowCount } = await pool.query("DELETE FROM tasks WHERE id = $1", [taskId]);
  return (rowCount ?? 0) > 0;
}

/**
 * Detects whether adding an edge `fromTaskId -> toTaskId` (fromTaskId depends on
 * toTaskId) would create a cycle, given the existing dependency edges within a
 * single project. Runs a DFS starting at `toTaskId` following existing
 * "depends on" edges; if `fromTaskId` is reachable, then `toTaskId` already
 * (transitively) depends on `fromTaskId`, so adding the new edge would close a
 * loop.
 */
function wouldCreateCycle(
  edges: DependencyEdgeRow[],
  fromTaskId: number,
  toTaskId: number,
): boolean {
  const adjacency = new Map<number, number[]>();
  for (const edge of edges) {
    const list = adjacency.get(edge.task_id) ?? [];
    list.push(edge.depends_on_task_id);
    adjacency.set(edge.task_id, list);
  }

  const visited = new Set<number>();
  const stack = [toTaskId];

  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) break;
    if (current === fromTaskId) {
      return true;
    }
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);
    for (const next of adjacency.get(current) ?? []) {
      stack.push(next);
    }
  }

  return false;
}

export async function addDependency(taskId: number, dependsOnTaskId: number): Promise<void> {
  if (taskId === dependsOnTaskId) {
    throw new HttpError(422, "self_dependency", "a task cannot depend on itself");
  }

  const client: PoolClient = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: taskRows } = await client.query<TaskRow>(
      "SELECT * FROM tasks WHERE id = ANY($1::int[]) FOR UPDATE",
      [[taskId, dependsOnTaskId]],
    );

    const task = taskRows.find((row) => row.id === taskId);
    const dependsOnTask = taskRows.find((row) => row.id === dependsOnTaskId);

    if (!task) {
      throw new HttpError(404, "task_not_found", `task ${taskId} not found`);
    }
    if (!dependsOnTask) {
      throw new HttpError(404, "task_not_found", `task ${dependsOnTaskId} not found`);
    }
    if (task.project_id !== dependsOnTask.project_id) {
      throw new HttpError(
        422,
        "cross_project_dependency",
        "tasks must belong to the same project to have a dependency",
      );
    }

    const { rows: edges } = await client.query<DependencyEdgeRow>(
      `SELECT task_id, depends_on_task_id
       FROM task_dependencies
       WHERE task_id IN (SELECT id FROM tasks WHERE project_id = $1)`,
      [task.project_id],
    );

    if (wouldCreateCycle(edges, taskId, dependsOnTaskId)) {
      throw new HttpError(
        422,
        "dependency_cycle",
        "this dependency would create a cycle in the project's task graph",
      );
    }

    await client.query(
      `INSERT INTO task_dependencies (task_id, depends_on_task_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [taskId, dependsOnTaskId],
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function removeDependency(taskId: number, dependsOnTaskId: number): Promise<boolean> {
  const { rowCount } = await pool.query(
    "DELETE FROM task_dependencies WHERE task_id = $1 AND depends_on_task_id = $2",
    [taskId, dependsOnTaskId],
  );
  return (rowCount ?? 0) > 0;
}
