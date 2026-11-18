import { useState, type FormEvent } from "react";
import { useAuth } from "../hooks/queries.js";

export default function AuthPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { login, register } = useAuth();
  const m = mode === "login" ? login : register;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (mode === "login") login.mutate({ email, password });
    else register.mutate({ name, email, password });
  }

  return (
    <main className="auth">
      <h1>Collaborative Project Planner</h1>
      <form onSubmit={submit} className="card">
        <h2>{mode === "login" ? "Log in" : "Create account"}</h2>
        {mode === "register" && (
          <label>Name<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
        )}
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label>
          Password
          <input type="password" minLength={mode === "register" ? 10 : undefined} value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {mode === "register" && <small>At least 10 characters.</small>}
        {m.error && <p className="error" role="alert">{m.error.message}</p>}
        <button disabled={m.isPending}>{m.isPending ? "Please wait…" : mode === "login" ? "Log in" : "Register"}</button>
        <button type="button" className="link" onClick={() => { setMode(mode === "login" ? "register" : "login"); m.reset(); }}>
          {mode === "login" ? "Need an account? Register" : "Have an account? Log in"}
        </button>
      </form>
    </main>
  );
}
