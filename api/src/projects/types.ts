import type { ProjectRole } from "./permissions.js";

export interface ProjectRow {
  id: number;
  name: string;
  description: string | null;
  created_by: number;
  created_at: Date;
}

export interface Project {
  id: number;
  name: string;
  description: string | null;
  createdBy: number;
  createdAt: Date;
}

export function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export interface MemberRow {
  project_id: number;
  user_id: number;
  role: ProjectRole;
  email: string;
  name: string;
}

export interface Member {
  projectId: number;
  userId: number;
  role: ProjectRole;
  email: string;
  name: string;
}

export function toMember(row: MemberRow): Member {
  return {
    projectId: row.project_id,
    userId: row.user_id,
    role: row.role,
    email: row.email,
    name: row.name,
  };
}
