import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { API_URL } from "../api/client.js";

export type SocketStatus = "connecting" | "live" | "offline";

/**
 * Keeps a WebSocket open to the project's room and refetches the project's
 * queries whenever a teammate changes something. Reconnects with backoff and
 * refetches on reconnect so nothing missed while offline is lost.
 */
export function useProjectSocket(projectId: number): SocketStatus {
  const qc = useQueryClient();
  const [status, setStatus] = useState<SocketStatus>("connecting");

  useEffect(() => {
    let ws: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let closed = false;

    const refresh = () => {
      for (const k of ["tasks", "deps", "schedule", "members", "project"]) {
        void qc.invalidateQueries({ queryKey: [k, projectId] });
      }
    };

    const connect = () => {
      setStatus("connecting");
      ws = new WebSocket(`${API_URL.replace(/^http/, "ws")}/ws?projectId=${projectId}`);
      ws.onopen = () => {
        if (attempt > 0) refresh();
        attempt = 0;
        setStatus("live");
      };
      ws.onmessage = (e) => {
        const msg = JSON.parse(String(e.data)) as { type: string };
        if (msg.type !== "connected") refresh();
      };
      ws.onclose = () => {
        if (closed) return;
        setStatus("offline");
        timer = setTimeout(connect, Math.min(1000 * 2 ** attempt++, 15000));
      };
    };

    connect();
    return () => {
      closed = true;
      clearTimeout(timer);
      ws?.close();
    };
  }, [projectId, qc]);

  return status;
}
