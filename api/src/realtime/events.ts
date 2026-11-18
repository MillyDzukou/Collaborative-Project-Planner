import { redis } from "../db/redis.js";
import { logger } from "../logger.js";

export interface ProjectEvent {
  type: string;
  projectId: number;
  payload: unknown;
  version?: number;
}

export function projectChannel(projectId: number): string {
  return `project:${projectId}`;
}

/**
 * Publishes a change to every API instance (including this one) via Redis.
 * Each instance forwards it to its own connected WebSocket clients. Failures
 * are logged, never thrown: a realtime hiccup must not fail a write that
 * already committed.
 */
export async function publishProjectEvent(event: ProjectEvent): Promise<void> {
  try {
    await redis.publish(projectChannel(event.projectId), JSON.stringify(event));
  } catch (err) {
    logger.error({ err }, "failed to publish project event");
  }
}
