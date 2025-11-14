import { useState } from "react";
import { Logger } from "featherlog";

// Initialize logger - replace with your actual project-id
const logger = new Logger({
  "project-id": import.meta.env.VITE_FEATHERLOG_PROJECT_ID || "demo-app",
});

function App() {
  const [lastError, setLastError] = useState<string | null>(null);
  const [logStatus, setLogStatus] = useState<string>("");

  const triggerError = async () => {
    try {
      setLogStatus("Triggering error...");
      setLastError(null);

      // Force an error
      throw new Error("This is a demo error from the Featherlog demo app!");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      setLastError(errorMessage);

      try {
        // Log the error using featherlog
        await logger.error(errorMessage, {
          userAgent: navigator.userAgent,
          url: window.location.href,
          timestamp: new Date().toISOString(),
          demo: true,
        });
        setLogStatus("✓ Error logged successfully!");
      } catch (logError) {
        setLogStatus(
          `✗ Failed to log: ${
            logError instanceof Error ? logError.message : "Unknown error"
          }`
        );
      }
    }
  };

  const triggerWarning = async () => {
    try {
      setLogStatus("Triggering warning...");
      setLastError(null);

      await logger.warn("This is a demo warning message", {
        userAgent: navigator.userAgent,
        url: window.location.href,
        timestamp: new Date().toISOString(),
        demo: true,
      });
      setLogStatus("✓ Warning logged successfully!");
    } catch (logError) {
      setLogStatus(
        `✗ Failed to log: ${
          logError instanceof Error ? logError.message : "Unknown error"
        }`
      );
    }
  };

  const triggerInfo = async () => {
    try {
      setLogStatus("Triggering info log...");
      setLastError(null);

      await logger.info("This is a demo info message", {
        userAgent: navigator.userAgent,
        url: window.location.href,
        timestamp: new Date().toISOString(),
        demo: true,
      });
      setLogStatus("✓ Info logged successfully!");
    } catch (logError) {
      setLogStatus(
        `✗ Failed to log: ${
          logError instanceof Error ? logError.message : "Unknown error"
        }`
      );
    }
  };

  const triggerAsyncError = async () => {
    try {
      setLogStatus("Triggering async error...");
      setLastError(null);

      // Simulate an async operation that fails
      await new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error("Async operation failed after 1 second"));
        }, 1000);
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      setLastError(errorMessage);

      try {
        await logger.error(errorMessage, {
          type: "async",
          duration: "1000ms",
          userAgent: navigator.userAgent,
          url: window.location.href,
          timestamp: new Date().toISOString(),
          demo: true,
        });
        setLogStatus("✓ Async error logged successfully!");
      } catch (logError) {
        setLogStatus(
          `✗ Failed to log: ${
            logError instanceof Error ? logError.message : "Unknown error"
          }`
        );
      }
    }
  };

  return (
    <div
      style={{
        backgroundColor: "white",
        borderRadius: "16px",
        padding: "3rem",
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
        maxWidth: "600px",
        width: "90%",
      }}
    >
      <h1
        style={{
          marginBottom: "1rem",
          color: "#333",
          fontSize: "2rem",
        }}
      >
        🪶 Featherlog Demo
      </h1>
      <p
        style={{
          marginBottom: "2rem",
          color: "#666",
          fontSize: "1rem",
        }}
      >
        Click the buttons below to generate different types of logs. Check the
        admin panel to view them!
      </p>

      {lastError && (
        <div
          style={{
            marginBottom: "1.5rem",
            padding: "1rem",
            backgroundColor: "#fee",
            border: "1px solid #fcc",
            borderRadius: "8px",
            color: "#c33",
          }}
        >
          <strong>Error:</strong> {lastError}
        </div>
      )}

      {logStatus && (
        <div
          style={{
            marginBottom: "1.5rem",
            padding: "1rem",
            backgroundColor: logStatus.startsWith("✓") ? "#efe" : "#fee",
            border: `1px solid ${logStatus.startsWith("✓") ? "#cfc" : "#fcc"}`,
            borderRadius: "8px",
            color: logStatus.startsWith("✓") ? "#3c3" : "#c33",
          }}
        >
          {logStatus}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: "1rem",
          marginBottom: "1rem",
        }}
      >
        <button
          onClick={triggerError}
          style={{
            padding: "1rem",
            backgroundColor: "#dc3545",
            color: "white",
            border: "none",
            borderRadius: "8px",
            fontSize: "1rem",
            cursor: "pointer",
            fontWeight: "500",
            transition: "transform 0.2s, box-shadow 0.2s",
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = "translateY(-2px)";
            e.currentTarget.style.boxShadow =
              "0 4px 12px rgba(220, 53, 69, 0.4)";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "none";
          }}
        >
          🚨 Trigger Error
        </button>

        <button
          onClick={triggerWarning}
          style={{
            padding: "1rem",
            backgroundColor: "#ffc107",
            color: "#333",
            border: "none",
            borderRadius: "8px",
            fontSize: "1rem",
            cursor: "pointer",
            fontWeight: "500",
            transition: "transform 0.2s, box-shadow 0.2s",
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = "translateY(-2px)";
            e.currentTarget.style.boxShadow =
              "0 4px 12px rgba(255, 193, 7, 0.4)";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "none";
          }}
        >
          ⚠️ Trigger Warning
        </button>

        <button
          onClick={triggerInfo}
          style={{
            padding: "1rem",
            backgroundColor: "#17a2b8",
            color: "white",
            border: "none",
            borderRadius: "8px",
            fontSize: "1rem",
            cursor: "pointer",
            fontWeight: "500",
            transition: "transform 0.2s, box-shadow 0.2s",
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = "translateY(-2px)";
            e.currentTarget.style.boxShadow =
              "0 4px 12px rgba(23, 162, 184, 0.4)";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "none";
          }}
        >
          ℹ️ Trigger Info
        </button>

        <button
          onClick={triggerAsyncError}
          style={{
            padding: "1rem",
            backgroundColor: "#6f42c1",
            color: "white",
            border: "none",
            borderRadius: "8px",
            fontSize: "1rem",
            cursor: "pointer",
            fontWeight: "500",
            transition: "transform 0.2s, box-shadow 0.2s",
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = "translateY(-2px)";
            e.currentTarget.style.boxShadow =
              "0 4px 12px rgba(111, 66, 193, 0.4)";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "none";
          }}
        >
          ⏱️ Async Error
        </button>
      </div>

      <div
        style={{
          marginTop: "2rem",
          padding: "1rem",
          backgroundColor: "#f8f9fa",
          borderRadius: "8px",
          fontSize: "0.875rem",
          color: "#666",
        }}
      >
        <strong>Configuration:</strong>
        <br />
        Project ID: {import.meta.env.VITE_FEATHERLOG_PROJECT_ID || "demo-app"}
        <br />
        Endpoint:{" "}
        {import.meta.env.VITE_FEATHERLOG_ENDPOINT ||
          "http://localhost:3000/api/logs"}
        <br />
        <br />
        <em>
          Set VITE_FEATHERLOG_SECRET, VITE_FEATHERLOG_PROJECT_ID, and
          VITE_FEATHERLOG_ENDPOINT in .env to customize. The endpoint should
          point to your Featherlog server API.
        </em>
      </div>
    </div>
  );
}

export default App;
