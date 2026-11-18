import { BrowserRouter, Link, Navigate, Route, Routes } from "react-router-dom";
import AuthPage from "./pages/AuthPage.js";
import ProjectBoardPage from "./pages/ProjectBoardPage.js";
import ProjectListPage from "./pages/ProjectListPage.js";
import { useAuth, useMe } from "./hooks/queries.js";

export default function App() {
  const me = useMe();
  const { logout } = useAuth();

  if (me.isLoading) return <p className="center">Loading…</p>;
  if (me.error) return <p className="error center" role="alert">Cannot reach the API: {me.error.message}</p>;
  if (!me.data) return <AuthPage />;

  return (
    <BrowserRouter>
      <header className="topbar">
        <Link to="/"><strong>Planner</strong></Link>
        <span>
          {me.data.name}{" "}
          <button className="link" onClick={() => logout.mutate()}>Log out</button>
        </span>
      </header>
      <main className="page">
        <Routes>
          <Route path="/" element={<ProjectListPage />} />
          <Route path="/projects/:id" element={<ProjectBoardPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
