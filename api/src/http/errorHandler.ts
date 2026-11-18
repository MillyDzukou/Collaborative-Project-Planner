import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { AuthError } from "../auth/errors.js";
import { errorBody, HttpError } from "../tasks/http-error.js";

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json(errorBody("not_found", "route not found"));
}

/**
 * The single place every error ends up. All responses use
 * `{ error: { code, message } }` and 5xx never leaks internals to the client.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) return;

  if (err instanceof HttpError) {
    res.status(err.status).json(errorBody(err.code, err.message, err.details));
    return;
  }
  if (err instanceof AuthError) {
    res.status(err.status).json(err.toResponseBody());
    return;
  }
  if (err instanceof z.ZodError) {
    res.status(400).json(errorBody("invalid_request", err.issues[0]?.message ?? "Invalid input."));
    return;
  }

  // body-parser errors carry a `type` and an HTTP status.
  const parseErr = err as { type?: string; status?: number } | null;
  if (parseErr?.type === "entity.parse.failed") {
    res.status(400).json(errorBody("invalid_json", "request body is not valid JSON"));
    return;
  }
  if (parseErr?.type === "entity.too.large") {
    res.status(413).json(errorBody("payload_too_large", "request body is too large"));
    return;
  }

  req.log?.error({ err }, "unhandled error");
  res.status(500).json(errorBody("internal_error", "an unexpected error occurred"));
}
