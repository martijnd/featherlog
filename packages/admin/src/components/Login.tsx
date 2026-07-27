import { useState } from "react";
import { apiClient } from "../api/client";

interface LoginProps {
  onLogin: () => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await apiClient.login(username, password);
      onLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <span className="app-brand-mark" aria-hidden>
            F
          </span>
          <h1>Featherlog</h1>
          <p>Sign in to your error tracking dashboard</p>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="login-field">
            <label className="form-label" htmlFor="username">
              Username
            </label>
            <input
              id="username"
              className="input"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="username"
            />
          </div>
          <div className="login-field">
            <label className="form-label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          {error && <div className="alert alert-error u-mb-md">{error}</div>}
          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={loading}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
          <div className="login-hint">
            Need an account? Create one via CLI:{" "}
            <code>
              docker compose exec server node dist/scripts/create-user.js
              &lt;username&gt; &lt;password&gt;
            </code>
          </div>
        </form>
      </div>
    </div>
  );
}
