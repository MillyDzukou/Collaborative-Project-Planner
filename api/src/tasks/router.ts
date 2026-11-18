import { Router, type NextFunction, type Request, type Response } from "express";
import { requireAuth } from "../auth/index.js";
import { requireProjectRole } from "../projects/middleware.js";
import { errorBody, HttpError } from "./http-error.js";
import {
  parseCreateTaskInput,
  parseDependsOnTaskId,
  parseIntParam,
  parseUpdateTaskInput,
} from "./validation.js";
import {
  addDependency,
  createTask,
  deleteTask,
  getTaskById,
  listDependenciesForProject,
  listTasksForProject,
  projectExists,
  removeDependency,
  updateTask,
} from "./service.js";

export const tasksRouter = Router();

function asyncHandler(
  handler: (req: Request, res: Response) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
  };
}

async function resolveProjectIdParam(req: Request): Promise<number> {
  return parseIntParam(req.params.id ?? "", "project id");
}

/**
 * For task-scoped routes (`/tasks/:id`, `/tasks/:id/dependencies[...]`) the
 * URL has no project id — it's derived from the task itself. Throws 404 if
 * the task doesn't exist at all (before any membership/role check runs).
 */
async function resolveProjectIdFromTaskParam(req: Request): Promise<number> {
  const taskId = parseIntParam(req.params.id ?? "", "task id");
  const task = await getTaskById(taskId);
  if (!task) {
    throw new HttpError(404, "task_not_found", `task ${taskId} not found`);
  }
  return task.projectId;
}

tasksRouter.get(
  "/projects/:id/tasks",
  requireAuth,
  requireProjectRole("read", resolveProjectIdParam),
  asyncHandler(async (req, res) => {
    const projectId = parseIntParam(req.params.id ?? "", "project id");
    if (!(await projectExists(projectId))) {
      throw new HttpError(404, "project_not_found", `project ${projectId} not found`);
    }
    const tasks = await listTasksForProject(projectId);
    res.status(200).json({ tasks });
  }),
);

tasksRouter.get(
  "/projects/:id/dependencies",
  requireAuth,
  requireProjectRole("read", resolveProjectIdParam),
  asyncHandler(async (req, res) => {
    const dependencies = await listDependenciesForProject(req.projectId!);
    res.status(200).json({ dependencies });
  }),
);

tasksRouter.post(
  "/projects/:id/tasks",
  requireAuth,
  requireProjectRole("write", resolveProjectIdParam),
  asyncHandler(async (req, res) => {
    const projectId = parseIntParam(req.params.id ?? "", "project id");
    if (!(await projectExists(projectId))) {
      throw new HttpError(404, "project_not_found", `project ${projectId} not found`);
    }
    const input = parseCreateTaskInput(req.body);
    const task = await createTask(projectId, input);
    res.status(201).json({ task });
  }),
);

tasksRouter.patch(
  "/tasks/:id",
  requireAuth,
  requireProjectRole("write", resolveProjectIdFromTaskParam),
  asyncHandler(async (req, res) => {
    const taskId = parseIntParam(req.params.id ?? "", "task id");
    const patch = parseUpdateTaskInput(req.body);
    const task = await updateTask(taskId, patch);
    if (!task) {
      throw new HttpError(404, "task_not_found", `task ${taskId} not found`);
    }
    res.status(200).json({ task });
  }),
);

tasksRouter.delete(
  "/tasks/:id",
  requireAuth,
  requireProjectRole("write", resolveProjectIdFromTaskParam),
  asyncHandler(async (req, res) => {
    const taskId = parseIntParam(req.params.id ?? "", "task id");
    const deleted = await deleteTask(taskId);
    if (!deleted) {
      throw new HttpError(404, "task_not_found", `task ${taskId} not found`);
    }
    res.status(204).send();
  }),
);

tasksRouter.post(
  "/tasks/:id/dependencies",
  requireAuth,
  requireProjectRole("write", resolveProjectIdFromTaskParam),
  asyncHandler(async (req, res) => {
    const taskId = parseIntParam(req.params.id ?? "", "task id");
    const dependsOnTaskId = parseDependsOnTaskId(req.body);
    await addDependency(taskId, dependsOnTaskId);
    res.status(201).json({ taskId, dependsOnTaskId });
  }),
);

tasksRouter.delete(
  "/tasks/:id/dependencies/:dependsOnTaskId",
  requireAuth,
  requireProjectRole("write", resolveProjectIdFromTaskParam),
  asyncHandler(async (req, res) => {
    const taskId = parseIntParam(req.params.id ?? "", "task id");
    const dependsOnTaskId = parseIntParam(
      req.params.dependsOnTaskId ?? "",
      "depends on task id",
    );
    const removed = await removeDependency(taskId, dependsOnTaskId);
    if (!removed) {
      throw new HttpError(
        404,
        "dependency_not_found",
        `dependency from ${taskId} to ${dependsOnTaskId} not found`,
      );
    }
    res.status(204).send();
  }),
);

tasksRouter.get(
  "/tasks/:id",
  requireAuth,
  requireProjectRole("read", resolveProjectIdFromTaskParam),
  asyncHandler(async (req, res) => {
    const taskId = parseIntParam(req.params.id ?? "", "task id");
    const task = await getTaskById(taskId);
    if (!task) {
      throw new HttpError(404, "task_not_found", `task ${taskId} not found`);
    }
    res.status(200).json({ task });
  }),
);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
tasksRouter.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) {
    res.status(err.status).json(errorBody(err.code, err.message));
    return;
  }
  console.error(err);
  res.status(500).json(errorBody("internal_error", "an unexpected error occurred"));
});
