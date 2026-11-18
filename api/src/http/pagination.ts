import { HttpError } from "../tasks/http-error.js";

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;

export interface Pagination {
  limit: number;
  offset: number;
}

function parseNonNegativeInt(raw: unknown, name: string, fallback: number): number {
  if (raw === undefined) return fallback;
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) {
    throw new HttpError(400, "invalid_request", `${name} must be a non-negative integer`);
  }
  return Number(raw);
}

/** Parses `?limit=&offset=`; limit defaults to 50 and is capped at 200. */
export function parsePagination(query: Record<string, unknown>): Pagination {
  const limit = parseNonNegativeInt(query.limit, "limit", DEFAULT_LIMIT);
  if (limit < 1 || limit > MAX_LIMIT) {
    throw new HttpError(400, "invalid_request", `limit must be between 1 and ${MAX_LIMIT}`);
  }
  return { limit, offset: parseNonNegativeInt(query.offset, "offset", 0) };
}

export interface Page {
  limit: number;
  offset: number;
  total: number;
}
