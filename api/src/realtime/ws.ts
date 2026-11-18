import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import { redis } from "../db/redis.js";
import { AUTH_COOKIE_NAME, verifyAuthToken } from "../auth/jwt.js";
import { getMemberRole } from "../projects/service.js";
import { config } from "../config.js";
import { projectChannel } from "./events.js";

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function reject(socket: Duplex, status: string): void {
  socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

/**
 * Attaches a WebSocket endpoint at `/ws?projectId=N` to the HTTP server.
 * Authenticated with the same cookie as REST; only project members may join
 * the project's room. Events arrive via Redis pub/sub so any API instance can
 * originate a change and every instance forwards it to its own clients.
 */
export function attachRealtime(server: Server): void {
  const wss = new WebSocketServer({ noServer: true });
  const rooms = new Map<number, Set<WebSocket>>();
  const subscriber = redis.duplicate();

  subscriber.on("message", (channel: string, message: string) => {
    const projectId = Number(channel.slice("project:".length));
    for (const client of rooms.get(projectId) ?? []) {
      if (client.readyState === WebSocket.OPEN) client.send(message);
    }
  });

  function join(projectId: number, ws: WebSocket): void {
    let room = rooms.get(projectId);
    if (!room) {
      room = new Set();
      rooms.set(projectId, room);
      void subscriber.subscribe(projectChannel(projectId));
    }
    room.add(ws);
    ws.on("close", () => {
      room.delete(ws);
      if (room.size === 0) {
        rooms.delete(projectId);
        void subscriber.unsubscribe(projectChannel(projectId));
      }
    });
  }

  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== "/ws") return reject(socket, "404 Not Found");

    // Cookies are sent automatically by browsers, so guard against cross-site
    // WebSocket hijacking by checking Origin against the allowed web origin.
    if (req.headers.origin !== config.webOrigin && req.headers.origin !== undefined) {
      return reject(socket, "403 Forbidden");
    }

    (async () => {
      const token = parseCookies(req.headers.cookie)[AUTH_COOKIE_NAME];
      if (!token) return reject(socket, "401 Unauthorized");
      let userId: number;
      try {
        userId = verifyAuthToken(token).id;
      } catch {
        return reject(socket, "401 Unauthorized");
      }

      const projectId = Number(url.searchParams.get("projectId"));
      if (!Number.isInteger(projectId)) return reject(socket, "400 Bad Request");
      // Non-members get 404, matching the REST API's no-existence-leak rule.
      if ((await getMemberRole(projectId, userId)) === null) return reject(socket, "404 Not Found");

      wss.handleUpgrade(req, socket, head, (ws) => {
        join(projectId, ws);
        ws.send(JSON.stringify({ type: "connected", projectId }));
      });
    })().catch(() => reject(socket, "500 Internal Server Error"));
  });
}
