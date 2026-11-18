import { Router, type Request } from "express";
import { pool } from "../db/pool.js";
import { requireAuth } from "../auth/index.js";
import { requireProjectRole } from "../projects/middleware.js";
import { HttpError } from "../tasks/http-error.js";
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

async function resolveProjectIdParam(req: Request): Promise<number> {
  const projectId = Number(req.params.id);
  if (!Number.isInteger(projectId)) {
    throw new HttpError(400, "invalid_request", "project id must be an integer");
  }
  return projectId;
}

scheduleRouter.get(
  "/projects/:id/schedule",
  requireAuth,
  requireProjectRole("read", resolveProjectIdParam),
  async (req, res, next) => {
    // `requireProjectRole` already validated and resolved this; `req.projectId`
    // is set once it ran successfully.
    const projectId = req.projectId!;

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
      next(err);
    }
  },
);
