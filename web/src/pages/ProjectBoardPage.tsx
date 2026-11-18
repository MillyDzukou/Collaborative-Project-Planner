import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import Gantt from "../components/Gantt.js";
import TaskTable from "../components/TaskTable.js";
import { useDependencies, useInvite, useMe, useMembers, useProject, useSchedule, useTasks } from "../hooks/queries.js";

function Invite({ projectId }: { projectId: number }) {
  const invite = useInvite(projectId);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  function submit(e: FormEvent) {
    e.preventDefault();
    invite.mutate({ email, role }, { onSuccess: () => setEmail("") });
  }
  return (
    <form onSubmit={submit} className="row">
      <input type="email" placeholder="Teammate email" value={email} onChange={(e) => setEmail(e.target.value)} required aria-label="Invite email" />
      <select value={role} onChange={(e) => setRole(e.target.value as "editor" | "viewer")} aria-label="Role">
        <option value="editor">editor</option>
        <option value="viewer">viewer</option>
      </select>
      <button disabled={invite.isPending}>Invite</button>
      {invite.error && <span className="error" role="alert">{invite.error.message}</span>}
    </form>
  );
}

export default function ProjectBoardPage() {
  const id = Number(useParams().id);
  const me = useMe().data;
  const project = useProject(id);
  const members = useMembers(id);
  const tasks = useTasks(id);
  const deps = useDependencies(id);
  const schedule = useSchedule(id);

  if (project.isLoading) return <p>Loading project…</p>;
  if (project.error || !project.data) {
    return (
      <section>
        <p className="error" role="alert">Project not found or you don't have access.</p>
        <Link to="/">← Back to projects</Link>
      </section>
    );
  }

  const role = members.data?.find((m) => m.userId === me?.id)?.role;
  const canWrite = role === "owner" || role === "editor";

  return (
    <section>
      <Link to="/">← Projects</Link>
      <h2>{project.data.name}</h2>
      {project.data.description && <p className="muted">{project.data.description}</p>}
      <p className="muted">
        Your role: <strong>{role ?? "…"}</strong>
        {role === "viewer" && " (read-only)"}
        {" · "}Members: {members.data?.map((m) => `${m.name} (${m.role})`).join(", ")}
      </p>
      {role === "owner" && <Invite projectId={id} />}

      <div className="summary card">
        {schedule.isLoading ? "Computing schedule…" : schedule.error ? <span className="error">Schedule unavailable: {schedule.error.message}</span> : (
          <>Project duration: <strong>{schedule.data?.projectDurationWeeks ?? 0} weeks</strong> · Critical tasks: <strong>{schedule.data?.tasks.filter((t) => t.critical).length ?? 0}</strong></>
        )}
      </div>

      <h3>Tasks</h3>
      {tasks.isLoading && <p>Loading tasks…</p>}
      {tasks.error && <p className="error" role="alert">Could not load tasks: {tasks.error.message}</p>}
      {tasks.data && <TaskTable projectId={id} tasks={tasks.data} deps={deps.data ?? []} schedule={schedule.data} canWrite={canWrite} />}

      {tasks.data && tasks.data.length > 0 && schedule.data && (
        <>
          <h3>Schedule</h3>
          <Gantt tasks={tasks.data} schedule={schedule.data} />
        </>
      )}
    </section>
  );
}
