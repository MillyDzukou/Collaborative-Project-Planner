import type { NextFunction, Request, Response } from "express";
// `./types.d.ts` augments Express's `Request` type via declaration merging.
// It only needs to be part of the TS program (see tsconfig `include`), not
// imported anywhere, since `declare global` applies program-wide.
import { AUTH_COOKIE_NAME, verifyAuthToken } from "./jwt.js";
import { unauthenticatedError } from "./errors.js";

/**
 * Reads the auth cookie, verifies the JWT, and attaches `{ id, email }` to
 * `req.user`. Responds 401 (using the shared error shape) if the token is
 * missing or invalid.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.[AUTH_COOKIE_NAME];
  if (typeof token !== "string" || token.length === 0) {
    res.status(401).json(unauthenticatedError().toResponseBody());
    return;
  }

  try {
    req.user = verifyAuthToken(token);
    next();
  } catch {
    res.status(401).json(unauthenticatedError().toResponseBody());
  }
}
