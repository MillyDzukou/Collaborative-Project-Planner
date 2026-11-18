export interface TaskRow {
  id: number;
  project_id: number;
  name: string;
  duration_weeks: number;
  status: string;
  assignee_id: number | null;
  cost: string | null;
  version: number;
  updated_at: Date;
}

export interface Task {
  id: number;
  projectId: number;
  name: string;
  durationWeeks: number;
  status: string;
  assigneeId: number | null;
  cost: string | null;
  version: number;
  updatedAt: Date;
}

export function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    durationWeeks: row.duration_weeks,
    status: row.status,
    assigneeId: row.assignee_id,
    cost: row.cost,
    version: row.version,
    updatedAt: row.updated_at,
  };
}

export interface DependencyEdgeRow {
  task_id: number;
  depends_on_task_id: number;
}
