import type { ProjectRole } from "./permissions.js";

declare global {
  namespace Express {
    interface Request {
      /** Set by `requireProjectRole` once the caller's membership is resolved. */
      projectId?: number;
      projectRole?: ProjectRole;
    }
  }
}

export {};
