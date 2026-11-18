import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { config } from "./config.js";
import { logger, httpLogger } from "./logger.js";
import { authRouter } from "./auth/index.js";
import { tasksRouter } from "./tasks/router.js";
import { scheduleRouter } from "./scheduling/schedule.routes.js";
import { projectsRouter } from "./projects/router.js";
import { attachRealtime } from "./realtime/ws.js";
import { errorHandler, notFoundHandler } from "./http/errorHandler.js";
import { createGlobalLimiter, createLoginLimiter, createRegisterLimiter } from "./http/rateLimit.js";
import { pool } from "./db/pool.js";
import { redis } from "./db/redis.js";

export interface AppOptions {
  /** Per-window request caps. `false` disables rate limiting entirely. */
  rateLimit?: false | { global?: number; login?: number; register?: number };
}

export function createApp(options: AppOptions = {}): express.Express {
  const app = express();
  app.disable("x-powered-by");
  if (config.trustProxy > 0) app.set("trust proxy", config.trustProxy);

  app.use(helmet());
  // CORS allow-list: only the configured web origin(s), with credentials for the auth cookie.
  app.use(cors({ origin: config.webOrigins, credentials: true }));
  app.use(httpLogger);

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  const limits = options.rateLimit;
  if (limits !== false) {
    app.use(createGlobalLimiter(limits?.global ?? config.globalRateLimit));
    app.use("/auth/login", createLoginLimiter(limits?.login));
    app.use("/auth/register", createRegisterLimiter(limits?.register ?? config.registerRateLimit));
  }

  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());

  app.use("/auth", authRouter);
  app.use(projectsRouter);
  app.use(tasksRouter);
  app.use(scheduleRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

// Rate limiting is off under the test runner (many tests log in repeatedly);
// the rate-limit tests build their own app with explicit caps.
export const app = createApp({ rateLimit: config.nodeEnv === "test" ? false : {} });

// Skip listening under the test runner so test files can import `app`
// (e.g. with supertest) without binding a real port.
if (config.nodeEnv !== "test") {
  const server = app.listen(config.port, () => {
    logger.info({ port: config.port }, "api listening");
  });
  const realtime = attachRealtime(server);

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "shutting down");

    // Hard stop if connections refuse to drain.
    const force = setTimeout(() => {
      logger.error("graceful shutdown timed out, forcing exit");
      process.exit(1);
    }, 10_000);
    force.unref();

    realtime.close();
    server.close(async () => {
      try {
        await pool.end();
        await redis.quit();
        logger.info("shutdown complete");
        process.exit(0);
      } catch (err) {
        logger.error({ err }, "error during shutdown");
        process.exit(1);
      }
    });
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}
