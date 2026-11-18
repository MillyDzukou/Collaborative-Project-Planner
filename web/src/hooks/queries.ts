import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, type Dependency, type Member, type Project, type Schedule, type Task, type User } from "../api/client.js";

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    retry: false,
    queryFn: async () => {
      try {
        return await api<User>("/auth/me");
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
  });
}

export function useAuth() {
  const qc = useQueryClient();
  const done = (u: User | null) => {
    qc.clear();
    qc.setQueryData(["me"], u);
  };
  return {
    login: useMutation({
      mutationFn: (b: { email: string; password: string }) => api<User>("/auth/login", { method: "POST", body: b }),
      onSuccess: done,
    }),
    register: useMutation({
      mutationFn: async (b: { email: string; password: string; name: string }) => {
        await api<User>("/auth/register", { method: "POST", body: b });
        return api<User>("/auth/login", { method: "POST", body: { email: b.email, password: b.password } });
      },
      onSuccess: done,
    }),
    logout: useMutation({ mutationFn: () => api("/auth/logout", { method: "POST" }), onSuccess: () => done(null) }),
  };
}

export function useProjects() {
  return useQuery({ queryKey: ["projects"], queryFn: async () => (await api<{ projects: Project[] }>("/projects")).projects });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: { name: string; description?: string }) => api<{ project: Project }>("/projects", { method: "POST", body: b }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
}

export function useProject(id: number) {
  return useQuery({ queryKey: ["project", id], retry: false, queryFn: async () => (await api<{ project: Project }>(`/projects/${id}`)).project });
}

export function useMembers(id: number) {
  return useQuery({ queryKey: ["members", id], queryFn: async () => (await api<{ members: Member[] }>(`/projects/${id}/members`)).members });
}

export function useInvite(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: { email: string; role: "editor" | "viewer" }) => api(`/projects/${id}/members`, { method: "POST", body: b }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members", id] }),
  });
}

export function useTasks(id: number) {
  return useQuery({ queryKey: ["tasks", id], queryFn: async () => (await api<{ tasks: Task[] }>(`/projects/${id}/tasks`)).tasks });
}

export function useDependencies(id: number) {
  return useQuery({ queryKey: ["deps", id], queryFn: async () => (await api<{ dependencies: Dependency[] }>(`/projects/${id}/dependencies`)).dependencies });
}

export function useSchedule(id: number) {
  return useQuery({ queryKey: ["schedule", id], queryFn: () => api<Schedule>(`/projects/${id}/schedule`) });
}

/** Mutations that change the plan; all refresh tasks, deps and schedule. */
export function usePlanMutations(projectId: number) {
  const qc = useQueryClient();
  const refresh = () => Promise.all(["tasks", "deps", "schedule"].map((k) => qc.invalidateQueries({ queryKey: [k, projectId] })));
  // onSettled (not onSuccess) so a 409 conflict also refetches the latest state.
  const opts = { onSettled: refresh };
  return {
    addTask: useMutation({
      mutationFn: (b: { name: string; duration_weeks: number }) => api(`/projects/${projectId}/tasks`, { method: "POST", body: b }),
      ...opts,
    }),
    updateTask: useMutation({
      // `version` is the version the user last saw; the server rejects with 409 if it moved on.
      mutationFn: ({ id, ...b }: { id: number; version: number; name?: string; duration_weeks?: number; status?: string }) =>
        api(`/tasks/${id}`, { method: "PATCH", body: b }),
      ...opts,
    }),
    deleteTask: useMutation({ mutationFn: (id: number) => api(`/tasks/${id}`, { method: "DELETE" }), ...opts }),
    addDep: useMutation({
      mutationFn: (b: { taskId: number; dependsOnTaskId: number }) =>
        api(`/tasks/${b.taskId}/dependencies`, { method: "POST", body: { dependsOnTaskId: b.dependsOnTaskId } }),
      ...opts,
    }),
    removeDep: useMutation({
      mutationFn: (b: { taskId: number; dependsOnTaskId: number }) =>
        api(`/tasks/${b.taskId}/dependencies/${b.dependsOnTaskId}`, { method: "DELETE" }),
      ...opts,
    }),
  };
}
