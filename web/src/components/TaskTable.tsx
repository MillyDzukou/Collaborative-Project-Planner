import { useState, type FormEvent } from "react";
import { ApiError, type Dependency, type Schedule, type Task } from "../api/client.js";
import { usePlanMutations } from "../hooks/queries.js";

type Patch = { name?: string; duration_weeks?: number; status?: string };
interface Conflict { attempted: Patch; current: Task }

function describe(p: Patch): string {
  return Object.entries(p).map(([k, v]) => `${k.replace("_", " ")} → ${v}`).join(", ");
}

const STATUSES = ["pending", "in_progress", "done"];

function EditableCell({ value, type, disabled, onSave }: { value: string | number; type: "text" | "number"; disabled: boolean; onSave: (v: string) => void }) {
  const [draft, setDraft] = useState(String(value));
  const [editing, setEditing] = useState(false);
  if (disabled) return <>{value}</>;
  const commit = () => {
    setEditing(false);
    if (draft !== String(value) && draft.trim() !== "") onSave(draft);
    else setDraft(String(value));
  };
  return editing ? (
    <input
      autoFocus
      type={type}
      min={type === "number" ? 1 : undefined}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(String(value)); setEditing(false); } }}
    />
  ) : (
    <button className="cell" onClick={() => { setDraft(String(value)); setEditing(true); }} title="Click to edit">{value}</button>
  );
}

export default function TaskTable({ projectId, tasks, deps, schedule, canWrite }: { projectId: number; tasks: Task[]; deps: Dependency[]; schedule?: Schedule; canWrite: boolean }) {
  const m = usePlanMutations(projectId);
  const [name, setName] = useState("");
  const [weeks, setWeeks] = useState("1");
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const sched = new Map(schedule?.tasks.map((s) => [s.id, s]));
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const update = (t: Task, patch: Patch) =>
    m.updateTask.mutate({ id: t.id, version: t.version, ...patch }, {
      onError: (err) => {
        if (err instanceof ApiError && err.status === 409) {
          const current = (err.details as { current?: Task } | undefined)?.current;
          if (current) setConflict({ attempted: patch, current });
        }
      },
      onSuccess: () => setConflict(null),
    });
  const apiError = m.addTask.error ?? m.updateTask.error ?? m.deleteTask.error ?? m.addDep.error ?? m.removeDep.error;
  const error = apiError instanceof ApiError && apiError.status === 409 && conflict ? null : apiError;

  function add(e: FormEvent) {
    e.preventDefault();
    m.addTask.mutate({ name, duration_weeks: Number(weeks) }, { onSuccess: () => { setName(""); setWeeks("1"); } });
  }

  return (
    <div>
      {conflict && (
        <div className="conflict card" role="alert">
          <strong>"{conflict.current.name}" was changed by someone else.</strong>
          <p className="muted">
            Your edit ({describe(conflict.attempted)}) was not saved. The latest version is now shown below.
          </p>
          <div className="row">
            <button onClick={() => update(conflict.current, conflict.attempted)} disabled={m.updateTask.isPending}>
              Reapply my change
            </button>
            <button className="link" onClick={() => { setConflict(null); m.updateTask.reset(); }}>
              Keep their version
            </button>
          </div>
        </div>
      )}
      {error && <p className="error" role="alert">{error.message}</p>}
      {tasks.length === 0 && <p className="muted">No tasks yet.{canWrite ? " Add the first one below." : ""}</p>}
      {tasks.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Task</th><th>Weeks</th><th>Status</th><th>Depends on</th><th>Start</th><th>Float</th>{canWrite && <th />}</tr>
            </thead>
            <tbody>
              {tasks.map((t) => {
                const s = sched.get(t.id);
                const mine = deps.filter((d) => d.taskId === t.id);
                const options = tasks.filter((o) => o.id !== t.id && !mine.some((d) => d.dependsOnTaskId === o.id));
                return (
                  <tr key={t.id} className={s?.critical ? "critical-row" : undefined}>
                    <td><EditableCell value={t.name} type="text" disabled={!canWrite} onSave={(v) => update(t, { name: v })} /></td>
                    <td><EditableCell value={t.durationWeeks} type="number" disabled={!canWrite} onSave={(v) => update(t, { duration_weeks: Number(v) })} /></td>
                    <td>
                      {canWrite ? (
                        <select value={t.status} onChange={(e) => update(t, { status: e.target.value })} aria-label={`Status of ${t.name}`}>
                          {[...new Set([...STATUSES, t.status])].map((x) => <option key={x}>{x}</option>)}
                        </select>
                      ) : t.status}
                    </td>
                    <td>
                      {mine.map((d) => (
                        <span key={d.dependsOnTaskId} className="chip">
                          {byId.get(d.dependsOnTaskId)?.name}
                          {canWrite && <button aria-label="Remove dependency" onClick={() => m.removeDep.mutate({ taskId: t.id, dependsOnTaskId: d.dependsOnTaskId })}>×</button>}
                        </span>
                      ))}
                      {canWrite && options.length > 0 && (
                        <select value="" aria-label={`Add dependency for ${t.name}`} onChange={(e) => e.target.value && m.addDep.mutate({ taskId: t.id, dependsOnTaskId: Number(e.target.value) })}>
                          <option value="">+ add…</option>
                          {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </select>
                      )}
                    </td>
                    <td>{s?.earlyStart ?? "–"}</td>
                    <td>{s ? (s.critical ? "critical" : s.float) : "–"}</td>
                    {canWrite && <td><button className="danger" onClick={() => { if (confirm(`Delete "${t.name}"?`)) m.deleteTask.mutate(t.id); }}>Delete</button></td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {canWrite && (
        <form onSubmit={add} className="card row">
          <input placeholder="Task name" value={name} onChange={(e) => setName(e.target.value)} required aria-label="Task name" />
          <input type="number" min={1} step={1} value={weeks} onChange={(e) => setWeeks(e.target.value)} required aria-label="Duration in weeks" style={{ maxWidth: 100 }} />
          <button disabled={m.addTask.isPending}>Add task</button>
        </form>
      )}
    </div>
  );
}
