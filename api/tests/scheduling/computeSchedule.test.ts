import { describe, expect, it } from "vitest";
import {
  computeSchedule,
  type DependencyInput,
  type TaskInput,
} from "../../src/scheduling/computeSchedule.js";

function findTask(result: ReturnType<typeof computeSchedule>, id: number) {
  const task = result.tasks.find((t) => t.id === id);
  if (!task) throw new Error(`expected task ${id} in result`);
  return task;
}

describe("computeSchedule", () => {
  it("1. simple 3-task chain A -> B -> C", () => {
    const tasks: TaskInput[] = [
      { id: 1, durationWeeks: 2 }, // A
      { id: 2, durationWeeks: 3 }, // B
      { id: 3, durationWeeks: 1 }, // C
    ];
    const dependencies: DependencyInput[] = [
      { taskId: 2, dependsOnTaskId: 1 }, // B depends on A
      { taskId: 3, dependsOnTaskId: 2 }, // C depends on B
    ];

    const result = computeSchedule(tasks, dependencies);

    const a = findTask(result, 1);
    const b = findTask(result, 2);
    const c = findTask(result, 3);

    expect(a).toMatchObject({
      earlyStart: 0,
      earlyFinish: 2,
      lateStart: 0,
      lateFinish: 2,
      float: 0,
      critical: true,
    });
    expect(b).toMatchObject({
      earlyStart: 2,
      earlyFinish: 5,
      lateStart: 2,
      lateFinish: 5,
      float: 0,
      critical: true,
    });
    expect(c).toMatchObject({
      earlyStart: 5,
      earlyFinish: 6,
      lateStart: 5,
      lateFinish: 6,
      float: 0,
      critical: true,
    });

    expect(result.projectDurationWeeks).toBe(6); // sum of durations: 2 + 3 + 1
    expect(result.tasks.every((t) => t.critical)).toBe(true);
  });

  it("2. two parallel branches of different lengths feeding into one final task", () => {
    // Branch 1: A (short, 2 weeks) -> F
    // Branch 2: B1 -> B2 (long, 1 + 4 weeks) -> F
    const tasks: TaskInput[] = [
      { id: 1, durationWeeks: 2 }, // A
      { id: 2, durationWeeks: 1 }, // B1
      { id: 3, durationWeeks: 4 }, // B2
      { id: 4, durationWeeks: 1 }, // F (final)
    ];
    const dependencies: DependencyInput[] = [
      { taskId: 3, dependsOnTaskId: 2 }, // B2 depends on B1
      { taskId: 4, dependsOnTaskId: 1 }, // F depends on A
      { taskId: 4, dependsOnTaskId: 3 }, // F depends on B2
    ];

    const result = computeSchedule(tasks, dependencies);

    const a = findTask(result, 1);
    const b1 = findTask(result, 2);
    const b2 = findTask(result, 3);
    const f = findTask(result, 4);

    expect(result.projectDurationWeeks).toBe(6); // B1 + B2 + F = 1 + 4 + 1

    // Shorter branch has positive float.
    expect(a.float).toBeGreaterThan(0);
    expect(a.critical).toBe(false);

    // Longer branch and the final task are all critical.
    expect(b1.float).toBe(0);
    expect(b1.critical).toBe(true);
    expect(b2.float).toBe(0);
    expect(b2.critical).toBe(true);
    expect(f.float).toBe(0);
    expect(f.critical).toBe(true);
  });

  it("3. diamond A -> B, A -> C, B -> D, C -> D with asymmetric B/C durations", () => {
    const tasks: TaskInput[] = [
      { id: 1, durationWeeks: 2 }, // A
      { id: 2, durationWeeks: 5 }, // B (long)
      { id: 3, durationWeeks: 3 }, // C (short)
      { id: 4, durationWeeks: 2 }, // D
    ];
    const dependencies: DependencyInput[] = [
      { taskId: 2, dependsOnTaskId: 1 }, // B depends on A
      { taskId: 3, dependsOnTaskId: 1 }, // C depends on A
      { taskId: 4, dependsOnTaskId: 2 }, // D depends on B
      { taskId: 4, dependsOnTaskId: 3 }, // D depends on C
    ];

    const result = computeSchedule(tasks, dependencies);

    const b = findTask(result, 2);
    const c = findTask(result, 3);
    const d = findTask(result, 4);

    // Longer of B/C (B) is critical with float 0.
    expect(b.float).toBe(0);
    expect(b.critical).toBe(true);

    // Shorter of B/C (C) has float > 0.
    expect(c.float).toBeGreaterThan(0);
    expect(c.critical).toBe(false);

    // D's early start equals the max of B and C's early finish.
    expect(d.earlyStart).toBe(Math.max(b.earlyFinish, c.earlyFinish));
  });

  it("4. synthetic 9-task graph with branching and merging", () => {
    // 1 -> 2 -> 4 -> 7 -> 9
    // 1 -> 3 -> 5 -> 8 -> 9
    //      2,3 -> 6 -> 7
    const tasks: TaskInput[] = [
      { id: 1, durationWeeks: 2 },
      { id: 2, durationWeeks: 3 },
      { id: 3, durationWeeks: 1 },
      { id: 4, durationWeeks: 4 },
      { id: 5, durationWeeks: 2 },
      { id: 6, durationWeeks: 3 },
      { id: 7, durationWeeks: 2 },
      { id: 8, durationWeeks: 5 },
      { id: 9, durationWeeks: 1 },
    ];
    const dependencies: DependencyInput[] = [
      { taskId: 2, dependsOnTaskId: 1 },
      { taskId: 3, dependsOnTaskId: 1 },
      { taskId: 4, dependsOnTaskId: 2 },
      { taskId: 5, dependsOnTaskId: 3 },
      { taskId: 6, dependsOnTaskId: 2 },
      { taskId: 6, dependsOnTaskId: 3 },
      { taskId: 7, dependsOnTaskId: 4 },
      { taskId: 7, dependsOnTaskId: 6 },
      { taskId: 8, dependsOnTaskId: 5 },
      { taskId: 9, dependsOnTaskId: 7 },
      { taskId: 9, dependsOnTaskId: 8 },
    ];

    const result = computeSchedule(tasks, dependencies);
    expect(result.projectDurationWeeks).toBe(12);

    const expected: Record<number, Partial<ReturnType<typeof findTask>>> = {
      1: { earlyStart: 0, earlyFinish: 2, lateStart: 0, lateFinish: 2, float: 0, critical: true },
      2: { earlyStart: 2, earlyFinish: 5, lateStart: 2, lateFinish: 5, float: 0, critical: true },
      3: { earlyStart: 2, earlyFinish: 3, lateStart: 3, lateFinish: 4, float: 1, critical: false },
      4: { earlyStart: 5, earlyFinish: 9, lateStart: 5, lateFinish: 9, float: 0, critical: true },
      5: { earlyStart: 3, earlyFinish: 5, lateStart: 4, lateFinish: 6, float: 1, critical: false },
      6: { earlyStart: 5, earlyFinish: 8, lateStart: 6, lateFinish: 9, float: 1, critical: false },
      7: { earlyStart: 9, earlyFinish: 11, lateStart: 9, lateFinish: 11, float: 0, critical: true },
      8: { earlyStart: 5, earlyFinish: 10, lateStart: 6, lateFinish: 11, float: 1, critical: false },
      9: { earlyStart: 11, earlyFinish: 12, lateStart: 11, lateFinish: 12, float: 0, critical: true },
    };

    for (const [idStr, expectedTask] of Object.entries(expected)) {
      const id = Number(idStr);
      expect(findTask(result, id)).toMatchObject(expectedTask);
    }

    // Critical path 1 -> 2 -> 4 -> 7 -> 9 sums to the project duration.
    const criticalSum = [1, 2, 4, 7, 9].reduce(
      (sum, id) => sum + tasks.find((t) => t.id === id)!.durationWeeks,
      0,
    );
    expect(criticalSum).toBe(result.projectDurationWeeks);
  });

  it("throws a clear error on a cyclic dependency graph instead of looping or miscomputing", () => {
    const tasks: TaskInput[] = [
      { id: 1, durationWeeks: 1 },
      { id: 2, durationWeeks: 1 },
      { id: 3, durationWeeks: 1 },
    ];
    const dependencies: DependencyInput[] = [
      { taskId: 2, dependsOnTaskId: 1 },
      { taskId: 3, dependsOnTaskId: 2 },
      { taskId: 1, dependsOnTaskId: 3 }, // closes the cycle
    ];

    expect(() => computeSchedule(tasks, dependencies)).toThrow(/cycle/i);
  });

  it("handles an empty task list", () => {
    const result = computeSchedule([], []);
    expect(result.tasks).toEqual([]);
    expect(result.projectDurationWeeks).toBe(0);
  });
});
