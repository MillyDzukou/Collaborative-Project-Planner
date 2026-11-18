const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export default function App() {
  return (
    <main style={{ fontFamily: "sans-serif", padding: "2rem" }}>
      <h1>Collaborative Project Planner</h1>
      <p>Scaffolding only — build out pages, auth and the project board next.</p>
      <p>
        API base URL: <code>{API_URL}</code>
      </p>
    </main>
  );
}
