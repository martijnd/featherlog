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
  const [isRegistering, setIsRegistering] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isRegistering) {
        await apiClient.register(username, password);
      } else {
        await apiClient.login(username, password);
      }
      onLogin();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : isRegistering
          ? "Registration failed"
          : "Login failed"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
        backgroundColor: "#f5f5f5",
      }}
    >
      <div
        style={{
          backgroundColor: "white",
          padding: "2rem",
          borderRadius: "8px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
          width: "100%",
          maxWidth: "400px",
        }}
      >
        <h1 style={{ marginBottom: "1.5rem", textAlign: "center" }}>
          Featherlog Admin
        </h1>
        <div
          style={{
            marginBottom: "1rem",
            display: "flex",
            gap: "0.5rem",
            borderBottom: "1px solid #eee",
            paddingBottom: "1rem",
          }}
        >
          <button
            type="button"
            onClick={() => setIsRegistering(false)}
            style={{
              flex: 1,
              padding: "0.5rem",
              backgroundColor: !isRegistering ? "#007bff" : "transparent",
              color: !isRegistering ? "white" : "#666",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontWeight: !isRegistering ? "600" : "400",
            }}
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => setIsRegistering(true)}
            style={{
              flex: 1,
              padding: "0.5rem",
              backgroundColor: isRegistering ? "#007bff" : "transparent",
              color: isRegistering ? "white" : "#666",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontWeight: isRegistering ? "600" : "400",
            }}
          >
            Register
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "1rem" }}>
            <label
              style={{
                display: "block",
                marginBottom: "0.5rem",
                fontWeight: "500",
              }}
            >
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              style={{
                width: "100%",
                padding: "0.75rem",
                border: "1px solid #ddd",
                borderRadius: "4px",
                fontSize: "1rem",
              }}
            />
          </div>
          <div style={{ marginBottom: "1rem" }}>
            <label
              style={{
                display: "block",
                marginBottom: "0.5rem",
                fontWeight: "500",
              }}
            >
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                width: "100%",
                padding: "0.75rem",
                border: "1px solid #ddd",
                borderRadius: "4px",
                fontSize: "1rem",
              }}
            />
          </div>
          {error && (
            <div
              style={{
                marginBottom: "1rem",
                padding: "0.75rem",
                backgroundColor: "#fee",
                color: "#c33",
                borderRadius: "4px",
              }}
            >
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "0.75rem",
              backgroundColor: "#007bff",
              color: "white",
              border: "none",
              borderRadius: "4px",
              fontSize: "1rem",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading
              ? isRegistering
                ? "Registering..."
                : "Logging in..."
              : isRegistering
              ? "Register"
              : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}
