export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const hasBody = init.body !== undefined;
  const res = await fetch(`${API_URL}${path}`, {
    method: init.method ?? "GET",
    credentials: "include",
    headers: hasBody ? { "Content-Type": "application/json" } : undefined,
    body: hasBody ? JSON.stringify(init.body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = data?.error;
    const message = typeof e === "string" ? e : (e?.message ?? res.statusText);
    throw new ApiError(res.status, e?.code ?? "error", message, e?.details);
  }
  return data as T;
}

export type Role = "owner" | "editor" | "viewer";
export interface User { id: number; email: string; name: string }
export interface Project { id: number; name: string; description: string | null; createdBy: number }
export interface Member { projectId: number; userId: number; role: Role; email: string; name: string }
export interface Task { id: number; projectId: number; name: string; durationWeeks: number; status: string; version: number }
export interface Dependency { taskId: number; dependsOnTaskId: number }
export interface TaskSchedule { id: number; earlyStart: number; earlyFinish: number; lateStart: number; lateFinish: number; float: number; critical: boolean }
export interface Schedule { tasks: TaskSchedule[]; projectDurationWeeks: number }
