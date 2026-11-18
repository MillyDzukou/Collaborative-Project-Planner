import type { NextFunction, Request, Response } from "express";
import { errorBody, HttpError } from "../tasks/http-error.js";
import { canPerform, type ProjectAction } from "./permissions.js";
import { getMemberRole } from "./service.js";

/**
 * Resolves the project id a request is scoped to. May throw an `HttpError`
 * (e.g. 404 if a path segment doesn't refer to a real task) before any
 * membership/role check runs.
 */
export type ResolveProjectId = (req: Request) => Promise<number>;

/**
 * Reusable Express middleware that enforces the project permission model.
 * Must run after `requireAuth` (relies on `req.user`).
 *
 * - No `project_members` row for the caller → 404. This is intentional: a
 *   non-member must not be able to distinguish "project doesn't exist"
 *   from "project exists but you can't see it".
 * - A row exists but `canPerform` says no → 403.
 */
export function requireProjectRole(action: ProjectAction, resolveProjectId: ResolveProjectId) {
  return (req: Request, res: Response, next: NextFunction): void => {
    (async () => {
      const projectId = await resolveProjectId(req);

      const userId = req.user?.id;
      if (userId === undefined) {
        throw new HttpError(401, "unauthenticated", "authentication required");
      }

      const role = await getMemberRole(projectId, userId);
      if (role === null) {
        throw new HttpError(404, "project_not_found", `project ${projectId} not found`);
      }

      if (!canPerform(role, action)) {
        throw new HttpError(403, "forbidden", `role '${role}' is not permitted to perform '${action}'`);
      }

      req.projectId = projectId;
      req.projectRole = role;
      next();
    })().catch((err: unknown) => {
      if (err instanceof HttpError) {
        res.status(err.status).json(errorBody(err.code, err.message));
        return;
      }
      next(err);
    });
  };
}
