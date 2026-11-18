import { rateLimit } from "express-rate-limit";
import { errorBody } from "../tasks/http-error.js";

function limiter(windowMs: number, limit: number, opts: { skipSuccessfulRequests?: boolean } = {}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skipSuccessfulRequests: opts.skipSuccessfulRequests ?? false,
    handler: (_req, res) => {
      res.status(429).json(errorBody("rate_limited", "Too many requests, please try again later."));
    },
  });
}

/** Factories (not singletons) so each app/test gets independent counters. */
export const createGlobalLimiter = (limit = 600) => limiter(60_000, limit);
/** Strict: only failed attempts count, so legitimate users aren't locked out but guessing is throttled. */
export const createLoginLimiter = (limit = 10) => limiter(15 * 60_000, limit, { skipSuccessfulRequests: true });
export const createRegisterLimiter = (limit = 10) => limiter(60 * 60_000, limit);
