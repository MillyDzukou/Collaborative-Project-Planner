import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { config } from "./config.js";
import { authRouter } from "./auth/index.js";
import { tasksRouter } from "./tasks/router.js";
import { scheduleRouter } from "./scheduling/schedule.routes.js";
import { projectsRouter } from "./projects/router.js";

export const app = express();

app.use(cors({ origin: config.webOrigin, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/auth", authRouter);
app.use(projectsRouter);
app.use(tasksRouter);
app.use(scheduleRouter);

// Skip listening under the test runner so test files can import `app`
// (e.g. with supertest) without binding a real port.
if (process.env.NODE_ENV !== "test") {
  app.listen(config.port, () => {
    console.log(`api listening on :${config.port}`);
  });
}
