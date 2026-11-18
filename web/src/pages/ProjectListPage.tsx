import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useCreateProject, useProjects } from "../hooks/queries.js";

export default function ProjectListPage() {
  const projects = useProjects();
  const create = useCreateProject();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    create.mutate(
      { name, description: description || undefined },
      { onSuccess: () => { setName(""); setDescription(""); } },
    );
  }

  return (
    <section>
      <h2>Your projects</h2>
      <form onSubmit={submit} className="card row">
        <input placeholder="New project name" value={name} onChange={(e) => setName(e.target.value)} required aria-label="Project name" />
        <input placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} aria-label="Description" />
        <button disabled={create.isPending}>Create project</button>
      </form>
      {create.error && <p className="error" role="alert">{create.error.message}</p>}
      {projects.isLoading && <p>Loading projects…</p>}
      {projects.error && <p className="error" role="alert">Could not load projects: {projects.error.message}</p>}
      {projects.data?.length === 0 && <p className="muted">No projects yet — create your first one above.</p>}
      <ul className="list">
        {projects.data?.map((p) => (
          <li key={p.id} className="card">
            <Link to={`/projects/${p.id}`}><strong>{p.name}</strong></Link>
            {p.description && <p className="muted">{p.description}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
