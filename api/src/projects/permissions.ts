/**
 * Single source of truth for the project permission model. Every route that
 * touches a project (directly, or indirectly via a task/schedule that
 * belongs to one) must go through `canPerform` — never rely on the UI
 * hiding a button.
 */
export type ProjectRole = "owner" | "editor" | "viewer";

export type ProjectAction = "read" | "write" | "manage_members" | "manage_project";

export function canPerform(role: ProjectRole | null, action: ProjectAction): boolean {
  if (role === null) {
    return false;
  }

  switch (action) {
    case "read":
      return role === "owner" || role === "editor" || role === "viewer";
    case "write":
      // Owner-or-editor mutating access: managing tasks/dependencies AND
      // editing a project's own name/description both live here, since both
      // are "any non-viewer member can change this" actions.
      return role === "owner" || role === "editor";
    case "manage_members":
    case "manage_project":
      return role === "owner";
    default:
      return false;
  }
}

export function isProjectRole(value: unknown): value is ProjectRole {
  return value === "owner" || value === "editor" || value === "viewer";
}
