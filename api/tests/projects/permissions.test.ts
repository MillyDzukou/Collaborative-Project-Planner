import { describe, expect, it } from "vitest";
import { canPerform, type ProjectAction, type ProjectRole } from "../../src/projects/permissions.js";

const roles: ProjectRole[] = ["owner", "editor", "viewer"];
const actions: ProjectAction[] = ["read", "manage_tasks", "manage_members", "manage_project"];

describe("canPerform", () => {
  it("null role (non-member) can never perform any action", () => {
    for (const action of actions) {
      expect(canPerform(null, action)).toBe(false);
    }
  });

  it("any role can read", () => {
    for (const role of roles) {
      expect(canPerform(role, "read")).toBe(true);
    }
  });

  it("owner and editor can manage_tasks, viewer cannot", () => {
    expect(canPerform("owner", "manage_tasks")).toBe(true);
    expect(canPerform("editor", "manage_tasks")).toBe(true);
    expect(canPerform("viewer", "manage_tasks")).toBe(false);
  });

  it("only owner can manage_members", () => {
    expect(canPerform("owner", "manage_members")).toBe(true);
    expect(canPerform("editor", "manage_members")).toBe(false);
    expect(canPerform("viewer", "manage_members")).toBe(false);
  });

  it("only owner can manage_project", () => {
    expect(canPerform("owner", "manage_project")).toBe(true);
    expect(canPerform("editor", "manage_project")).toBe(false);
    expect(canPerform("viewer", "manage_project")).toBe(false);
  });
});
