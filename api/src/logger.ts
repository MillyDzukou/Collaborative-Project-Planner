import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { pino } from "pino";
import { pinoHttp } from "pino-http";
import { config } from "./config.js";

export const logger = pino({
  level: config.logLevel,
  // Never log credentials.
  redact: ["req.headers.cookie", "req.headers.authorization", "res.headers['set-cookie']"],
});

/** Per-request structured logging; every log line carries the request id, which is also echoed as `X-Request-Id`. */
export const httpLogger = pinoHttp({
  logger,
  genReqId: (req: IncomingMessage, res: ServerResponse) => {
    const incoming = req.headers["x-request-id"];
    // Accept a caller-supplied id only if it is short and harmless.
    const id = typeof incoming === "string" && /^[\w.-]{1,64}$/.test(incoming) ? incoming : randomUUID();
    res.setHeader("X-Request-Id", id);
    return id;
  },
  customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info"),
});
