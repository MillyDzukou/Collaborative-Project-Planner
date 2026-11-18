/**
 * Critical Path Method (CPM) scheduling.
 *
 * Pure function, no DB or HTTP imports — must be fully unit-testable in
 * isolation. See api/tests/scheduling/computeSchedule.test.ts.
 */

export interface TaskInput {
  id: number;
  durationWeeks: number;
}

export interface DependencyInput {
  taskId: number;
  dependsOnTaskId: number;
}

export interface TaskSchedule {
  id: number;
  earlyStart: number;
  earlyFinish: number;
  lateStart: number;
  lateFinish: number;
  float: number;
  critical: boolean;
}

export interface ScheduleResult {
  tasks: TaskSchedule[];
  projectDurationWeeks: number;
}

/**
 * Computes early/late start/finish, float, and critical-path flags for a
 * finish-to-start dependency graph using the Critical Path Method.
 *
 * Throws if a dependency references an unknown task id, or if the
 * dependency graph contains a cycle (this should already be rejected at
 * write time by the tasks API, but this function must never infinite-loop
 * or silently miscompute if it ever receives one).
 */
export function computeSchedule(
  tasks: TaskInput[],
  dependencies: DependencyInput[],
): ScheduleResult {
  const taskIds = new Set(tasks.map((t) => t.id));

  // predecessors[t] = tasks that must finish before t can start
  // successors[t]   = tasks that depend on t finishing
  const predecessors = new Map<number, number[]>();
  const successors = new Map<number, number[]>();
  for (const task of tasks) {
    predecessors.set(task.id, []);
    successors.set(task.id, []);
  }

  for (const dep of dependencies) {
    if (!taskIds.has(dep.taskId) || !taskIds.has(dep.dependsOnTaskId)) {
      throw new Error(
        `computeSchedule: dependency references an unknown task id (taskId=${dep.taskId}, dependsOnTaskId=${dep.dependsOnTaskId})`,
      );
    }
    predecessors.get(dep.taskId)!.push(dep.dependsOnTaskId);
    successors.get(dep.dependsOnTaskId)!.push(dep.taskId);
  }

  const order = topologicalSort(tasks, predecessors);

  const durationById = new Map(tasks.map((t) => [t.id, t.durationWeeks]));
  const earlyStart = new Map<number, number>();
  const earlyFinish = new Map<number, number>();

  // Forward pass, in topological order.
  for (const id of order) {
    const preds = predecessors.get(id)!;
    const es = preds.length === 0
      ? 0
      : Math.max(...preds.map((p) => earlyFinish.get(p)!));
    const ef = es + durationById.get(id)!;
    earlyStart.set(id, es);
    earlyFinish.set(id, ef);
  }

  const projectDurationWeeks = tasks.length === 0
    ? 0
    : Math.max(...tasks.map((t) => earlyFinish.get(t.id)!));

  const lateStart = new Map<number, number>();
  const lateFinish = new Map<number, number>();

  // Backward pass, in reverse topological order.
  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i]!;
    const succs = successors.get(id)!;
    const lf = succs.length === 0
      ? projectDurationWeeks
      : Math.min(...succs.map((s) => lateStart.get(s)!));
    const ls = lf - durationById.get(id)!;
    lateFinish.set(id, lf);
    lateStart.set(id, ls);
  }

  const result: TaskSchedule[] = tasks.map((task) => {
    const es = earlyStart.get(task.id)!;
    const ef = earlyFinish.get(task.id)!;
    const ls = lateStart.get(task.id)!;
    const lf = lateFinish.get(task.id)!;
    const float = ls - es;
    return {
      id: task.id,
      earlyStart: es,
      earlyFinish: ef,
      lateStart: ls,
      lateFinish: lf,
      float,
      critical: float === 0,
    };
  });

  return { tasks: result, projectDurationWeeks };
}

/**
 * Kahn's algorithm. Throws a specific error naming the remaining (cyclic)
 * task ids if a cycle prevents a full ordering from being produced.
 */
function topologicalSort(
  tasks: TaskInput[],
  predecessors: Map<number, number[]>,
): number[] {
  const inDegree = new Map<number, number>();
  for (const task of tasks) {
    inDegree.set(task.id, predecessors.get(task.id)!.length);
  }

  // successors derived from predecessors for traversal during the sort.
  const dependents = new Map<number, number[]>();
  for (const task of tasks) {
    dependents.set(task.id, []);
  }
  for (const task of tasks) {
    for (const predId of predecessors.get(task.id)!) {
      dependents.get(predId)!.push(task.id);
    }
  }

  const queue: number[] = tasks
    .filter((t) => inDegree.get(t.id) === 0)
    .map((t) => t.id);
  const order: number[] = [];

  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const depId of dependents.get(id)!) {
      const remaining = inDegree.get(depId)! - 1;
      inDegree.set(depId, remaining);
      if (remaining === 0) {
        queue.push(depId);
      }
    }
  }

  if (order.length !== tasks.length) {
    const remaining = tasks
      .map((t) => t.id)
      .filter((id) => !order.includes(id));
    throw new Error(
      `computeSchedule: dependency graph contains a cycle involving task id(s) ${remaining.join(", ")}`,
    );
  }

  return order;
}
