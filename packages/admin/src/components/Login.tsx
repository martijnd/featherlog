import { useState } from "react";
import { apiClient } from "../api/client";
import { BrandMark, BrandWordmark } from "./Brand";
import SiteFooter from "./SiteFooter";
import ThemeToggle from "./ThemeToggle";

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
      <div className="login-page-topbar">
        <ThemeToggle />
      </div>
      <div className="login-page-main">
        <div className="login-card">
          <div className="login-brand">
            <BrandMark className="app-brand-mark login-mark" />
            <BrandWordmark showTag size="lg" />
            <p>Sign in to monitor errors, issues, and live events.</p>
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
                spellCheck={false}
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
              Need an account? From the repo root:{" "}
              <code>pnpm create-user &lt;username&gt; &lt;password&gt;</code>
            </div>
          </form>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
