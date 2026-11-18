import { Router } from "express";
import { pool } from "../db/pool.js";
import { computeSchedule } from "./computeSchedule.js";
import type { DependencyInput, TaskInput } from "./computeSchedule.js";

export const scheduleRouter = Router();

interface TaskRow {
  id: number;
  duration_weeks: number;
}

interface DependencyRow {
  task_id: number;
  depends_on_task_id: number;
}

scheduleRouter.get("/projects/:id/schedule", async (req, res) => {
  // TODO(step 5): enforce membership check here
  const projectId = Number(req.params.id);
  if (!Number.isInteger(projectId)) {
    res.status(400).json({ error: "invalid project id" });
    return;
  }

  try {
    const [tasksResult, dependenciesResult] = await Promise.all([
      pool.query<TaskRow>(
        "SELECT id, duration_weeks FROM tasks WHERE project_id = $1",
        [projectId],
      ),
      pool.query<DependencyRow>(
        `SELECT td.task_id, td.depends_on_task_id
           FROM task_dependencies td
           JOIN tasks t ON t.id = td.task_id
          WHERE t.project_id = $1`,
        [projectId],
      ),
    ]);

    const tasks: TaskInput[] = tasksResult.rows.map((row) => ({
      id: row.id,
      durationWeeks: row.duration_weeks,
    }));
    const dependencies: DependencyInput[] = dependenciesResult.rows.map(
      (row) => ({
        taskId: row.task_id,
        dependsOnTaskId: row.depends_on_task_id,
      }),
    );

    const schedule = computeSchedule(tasks, dependencies);
    res.status(200).json(schedule);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    res.status(500).json({ error: message });
  }
});
