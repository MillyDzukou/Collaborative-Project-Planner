import { HttpError } from "../tasks/http-error.js";
import { isProjectRole, type ProjectRole } from "./permissions.js";

export interface CreateProjectInput {
  name: string;
  description: string | null;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string | null;
}

export interface InviteMemberInput {
  email: string;
  role: ProjectRole;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function badRequest(message: string): never {
  throw new HttpError(400, "invalid_request", message);
}

const MAX_NAME = 200;
const MAX_DESCRIPTION = 5000;
const MAX_EMAIL = 254;

function checkLength(value: string, max: number, field: string): void {
  if (value.length > max) badRequest(`${field} must be at most ${max} characters`);
}

export function parseCreateProjectInput(body: unknown): CreateProjectInput {
  if (!isRecord(body)) {
    badRequest("request body must be a JSON object");
  }

  const { name, description } = body;
  if (typeof name !== "string" || name.trim().length === 0) {
    badRequest("name is required and must be a non-empty string");
  }
  checkLength(name, MAX_NAME, "name");

  let resolvedDescription: string | null = null;
  if (description !== undefined && description !== null) {
    if (typeof description !== "string") {
      badRequest("description must be a string");
    }
    checkLength(description, MAX_DESCRIPTION, "description");
    resolvedDescription = description;
  }

  return { name, description: resolvedDescription };
}

export function parseUpdateProjectInput(body: unknown): UpdateProjectInput {
  if (!isRecord(body)) {
    badRequest("request body must be a JSON object");
  }

  const result: UpdateProjectInput = {};

  if ("name" in body) {
    const name = body.name;
    if (typeof name !== "string" || name.trim().length === 0) {
      badRequest("name must be a non-empty string");
    }
    checkLength(name, MAX_NAME, "name");
    result.name = name;
  }

  if ("description" in body) {
    const description = body.description;
    if (description !== null && typeof description !== "string") {
      badRequest("description must be a string or null");
    }
    if (typeof description === "string") checkLength(description, MAX_DESCRIPTION, "description");
    result.description = description as string | null;
  }

  if (Object.keys(result).length === 0) {
    badRequest("at least one field must be provided");
  }

  return result;
}

export function parseInviteMemberInput(body: unknown): InviteMemberInput {
  if (!isRecord(body)) {
    badRequest("request body must be a JSON object");
  }

  const { email, role } = body;
  if (typeof email !== "string" || email.trim().length === 0) {
    badRequest("email is required and must be a non-empty string");
  }
  checkLength(email, MAX_EMAIL, "email");
  if (!isProjectRole(role)) {
    badRequest("role is required and must be one of owner, editor, viewer");
  }

  return { email, role };
}

export function parseRoleInput(body: unknown): ProjectRole {
  if (!isRecord(body)) {
    badRequest("request body must be a JSON object");
  }

  const { role } = body;
  if (!isProjectRole(role)) {
    badRequest("role is required and must be one of owner, editor, viewer");
  }

  return role;
}
