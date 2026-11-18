import { HttpError } from "./http-error.js";

export interface CreateTaskInput {
  name: string;
  durationWeeks: number;
  status: string;
  assigneeId: number | null;
  cost: number | null;
}

export interface UpdateTaskInput {
  name?: string;
  durationWeeks?: number;
  status?: string;
  assigneeId?: number | null;
  cost?: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function badRequest(message: string): never {
  throw new HttpError(400, "invalid_request", message);
}

export function parseIntParam(raw: string, label: string): number {
  if (!/^-?\d+$/.test(raw)) {
    badRequest(`${label} must be an integer`);
  }
  return Number(raw);
}

export function parseCreateTaskInput(body: unknown): CreateTaskInput {
  if (!isRecord(body)) {
    badRequest("request body must be a JSON object");
  }

  const { name, duration_weeks: durationWeeks, status, assignee_id: assigneeId, cost } = body;

  if (typeof name !== "string" || name.trim().length === 0) {
    badRequest("name is required and must be a non-empty string");
  }

  if (typeof durationWeeks !== "number" || !Number.isInteger(durationWeeks) || durationWeeks <= 0) {
    badRequest("duration_weeks is required and must be an integer > 0");
  }

  let resolvedStatus = "pending";
  if (status !== undefined) {
    if (typeof status !== "string" || status.trim().length === 0) {
      badRequest("status must be a non-empty string");
    }
    resolvedStatus = status;
  }

  let resolvedAssigneeId: number | null = null;
  if (assigneeId !== undefined && assigneeId !== null) {
    if (typeof assigneeId !== "number" || !Number.isInteger(assigneeId)) {
      badRequest("assignee_id must be an integer");
    }
    resolvedAssigneeId = assigneeId;
  }

  let resolvedCost: number | null = null;
  if (cost !== undefined && cost !== null) {
    if (typeof cost !== "number" || !Number.isFinite(cost)) {
      badRequest("cost must be a number");
    }
    resolvedCost = cost;
  }

  return {
    name,
    durationWeeks,
    status: resolvedStatus,
    assigneeId: resolvedAssigneeId,
    cost: resolvedCost,
  };
}

export function parseUpdateTaskInput(body: unknown): UpdateTaskInput {
  if (!isRecord(body)) {
    badRequest("request body must be a JSON object");
  }

  const result: UpdateTaskInput = {};

  if ("name" in body) {
    const name = body.name;
    if (typeof name !== "string" || name.trim().length === 0) {
      badRequest("name must be a non-empty string");
    }
    result.name = name;
  }

  if ("duration_weeks" in body) {
    const durationWeeks = body.duration_weeks;
    if (typeof durationWeeks !== "number" || !Number.isInteger(durationWeeks) || durationWeeks <= 0) {
      badRequest("duration_weeks must be an integer > 0");
    }
    result.durationWeeks = durationWeeks;
  }

  if ("status" in body) {
    const status = body.status;
    if (typeof status !== "string" || status.trim().length === 0) {
      badRequest("status must be a non-empty string");
    }
    result.status = status;
  }

  if ("assignee_id" in body) {
    const assigneeId = body.assignee_id;
    if (assigneeId !== null && (typeof assigneeId !== "number" || !Number.isInteger(assigneeId))) {
      badRequest("assignee_id must be an integer or null");
    }
    result.assigneeId = assigneeId as number | null;
  }

  if ("cost" in body) {
    const cost = body.cost;
    if (cost !== null && (typeof cost !== "number" || !Number.isFinite(cost))) {
      badRequest("cost must be a number or null");
    }
    result.cost = cost as number | null;
  }

  if (Object.keys(result).length === 0) {
    badRequest("at least one field must be provided");
  }

  return result;
}

export function parseDependsOnTaskId(body: unknown): number {
  if (!isRecord(body)) {
    badRequest("request body must be a JSON object");
  }

  const dependsOnTaskId = body.dependsOnTaskId;
  if (typeof dependsOnTaskId !== "number" || !Number.isInteger(dependsOnTaskId)) {
    badRequest("dependsOnTaskId is required and must be an integer");
  }

  return dependsOnTaskId;
}
