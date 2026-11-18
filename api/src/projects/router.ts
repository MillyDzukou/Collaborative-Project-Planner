import { Router, type NextFunction, type Request, type Response } from "express";
import { requireAuth } from "../auth/index.js";
import { errorBody, HttpError } from "../tasks/http-error.js";
import { parseIntParam } from "../tasks/validation.js";
import { requireProjectRole } from "./middleware.js";
import {
  parseCreateProjectInput,
  parseInviteMemberInput,
  parseRoleInput,
  parseUpdateProjectInput,
} from "./validation.js";
import {
  addMember,
  createProject,
  deleteProject,
  getProjectById,
  listMembers,
  listProjectsForUser,
  removeMember,
  updateMemberRole,
  updateProject,
} from "./service.js";

export const projectsRouter = Router();

function asyncHandler(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
  };
}

async function resolveProjectIdParam(req: Request): Promise<number> {
  return parseIntParam(req.params.id ?? "", "project id");
}

projectsRouter.get(
  "/projects",
  requireAuth,
  asyncHandler(async (req, res) => {
    const projects = await listProjectsForUser(req.user!.id);
    res.status(200).json({ projects });
  }),
);

projectsRouter.post(
  "/projects",
  requireAuth,
  asyncHandler(async (req, res) => {
    const input = parseCreateProjectInput(req.body);
    const project = await createProject(req.user!.id, input);
    res.status(201).json({ project });
  }),
);

projectsRouter.get(
  "/projects/:id",
  requireAuth,
  requireProjectRole("read", resolveProjectIdParam),
  asyncHandler(async (req, res) => {
    const project = await getProjectById(req.projectId!);
    if (!project) {
      throw new HttpError(404, "project_not_found", `project ${req.projectId} not found`);
    }
    res.status(200).json({ project });
  }),
);

// Editing a project's own name/description is an editor-or-owner action,
// distinct from the owner-only `manage_project` action (reserved for
// destructive operations like delete below), so this uses the generic
// "write" action rather than `manage_project`.
projectsRouter.patch(
  "/projects/:id",
  requireAuth,
  requireProjectRole("write", resolveProjectIdParam),
  asyncHandler(async (req, res) => {
    const patch = parseUpdateProjectInput(req.body);
    const project = await updateProject(req.projectId!, patch);
    if (!project) {
      throw new HttpError(404, "project_not_found", `project ${req.projectId} not found`);
    }
    res.status(200).json({ project });
  }),
);

projectsRouter.delete(
  "/projects/:id",
  requireAuth,
  requireProjectRole("manage_project", resolveProjectIdParam),
  asyncHandler(async (req, res) => {
    const deleted = await deleteProject(req.projectId!);
    if (!deleted) {
      throw new HttpError(404, "project_not_found", `project ${req.projectId} not found`);
    }
    res.status(204).send();
  }),
);

projectsRouter.get(
  "/projects/:id/members",
  requireAuth,
  requireProjectRole("read", resolveProjectIdParam),
  asyncHandler(async (req, res) => {
    const members = await listMembers(req.projectId!);
    res.status(200).json({ members });
  }),
);

projectsRouter.post(
  "/projects/:id/members",
  requireAuth,
  requireProjectRole("manage_members", resolveProjectIdParam),
  asyncHandler(async (req, res) => {
    const input = parseInviteMemberInput(req.body);
    const member = await addMember(req.projectId!, input.email, input.role);
    res.status(201).json({ member });
  }),
);

projectsRouter.patch(
  "/projects/:id/members/:userId",
  requireAuth,
  requireProjectRole("manage_members", resolveProjectIdParam),
  asyncHandler(async (req, res) => {
    const targetUserId = parseIntParam(req.params.userId ?? "", "user id");
    const role = parseRoleInput(req.body);
    const member = await updateMemberRole(req.projectId!, targetUserId, role);
    if (!member) {
      throw new HttpError(404, "member_not_found", `user ${targetUserId} is not a member of this project`);
    }
    res.status(200).json({ member });
  }),
);

projectsRouter.delete(
  "/projects/:id/members/:userId",
  requireAuth,
  requireProjectRole("manage_members", resolveProjectIdParam),
  asyncHandler(async (req, res) => {
    const targetUserId = parseIntParam(req.params.userId ?? "", "user id");
    const result = await removeMember(req.projectId!, targetUserId);
    if (result === "not_found") {
      throw new HttpError(404, "member_not_found", `user ${targetUserId} is not a member of this project`);
    }
    res.status(204).send();
  }),
);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
projectsRouter.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) {
    res.status(err.status).json(errorBody(err.code, err.message));
    return;
  }
  console.error(err);
  res.status(500).json(errorBody("internal_error", "an unexpected error occurred"));
});
