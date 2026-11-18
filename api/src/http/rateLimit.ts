import { rateLimit } from "express-rate-limit";
import { errorBody } from "../tasks/http-error.js";

function limiter(
  windowMs: number,
  limit: number,
  opts: { skipSuccessfulRequests?: boolean; requestWasSuccessful?: (res: { statusCode: number }) => boolean } = {},
) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skipSuccessfulRequests: opts.skipSuccessfulRequests ?? false,
    ...(opts.requestWasSuccessful ? { requestWasSuccessful: (_req: unknown, res: { statusCode: number }) => opts.requestWasSuccessful!(res) } : {}),
    handler: (_req, res) => {
      res.status(429).json(errorBody("rate_limited", "Too many requests, please try again later."));
    },
  });
}

/** Factories (not singletons) so each app/test gets independent counters. */
export const createGlobalLimiter = (limit = 600) => limiter(60_000, limit);
/**
 * Strict: only real credential failures (401) stay counted. Everything else — successful logins,
 * validation errors, and the limiter's own 429s — is refunded when the response finishes. Without
 * the explicit predicate the default ("status < 400 is success") counted the 429s themselves as
 * failures, so a burst of concurrent legitimate logins locked the IP out for the whole window.
 * Requests are counted on arrival, so a flood of parallel guesses is still cut off immediately.
 */
export const createLoginLimiter = (limit = 10) =>
  limiter(15 * 60_000, limit, { skipSuccessfulRequests: true, requestWasSuccessful: (res) => res.statusCode !== 401 });
export const createRegisterLimiter = (limit = 10) => limiter(60 * 60_000, limit);
