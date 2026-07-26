import { useState } from "react";
import { Logger, type SendResult } from "featherlog";

// Initialize logger - replace with your actual project-id
const logger = new Logger({
  "project-id": import.meta.env.VITE_FEATHERLOG_PROJECT_ID || "demo-app",
  service: "demo-app",
  version: "2.2.0",
  environment: "development",
  // Tail sampling example: keep errors/slow always; sample 50% of happy-path info
  sampleRate: 0.5,
  slowThresholdMs: 500,
});

logger.setContext({
  region: "local",
  demo: true,
});

function App() {
  const [lastError, setLastError] = useState<string | null>(null);
  const [logStatus, setLogStatus] = useState<string>("");
  const [sendAlert, setSendAlert] = useState<string | null>(null);

  const handleSendResult = (result: SendResult, successMessage: string) => {
    if (!result.ok) {
      const detail =
        result.status != null
          ? `HTTP ${result.status}${result.error ? `: ${result.error}` : ""}`
          : result.error || "Log request failed";
      setSendAlert(detail);
      setLogStatus(`✗ ${detail}`);
      return false;
    }
    setSendAlert(null);
    if (result.sampled) {
      setLogStatus("○ Sampled out (not sent to server)");
      return true;
    }
    setLogStatus(successMessage);
    return true;
  };

  const triggerError = async () => {
    setLogStatus("Triggering error...");
    setLastError(null);
    setSendAlert(null);

    try {
      throw new Error("This is a demo error from the Featherlog demo app!");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      setLastError(errorMessage);

      const result = await logger.error(errorMessage, {
        userAgent: navigator.userAgent,
        url: window.location.href,
        timestamp: new Date().toISOString(),
        demo: true,
      });
      handleSendResult(result, "✓ Error logged successfully!");
    }
  };

  const triggerWarning = async () => {
    setLogStatus("Triggering warning...");
    setLastError(null);
    setSendAlert(null);

    const result = await logger.warn("This is a demo warning message", {
      userAgent: navigator.userAgent,
      url: window.location.href,
      timestamp: new Date().toISOString(),
      demo: true,
    });
    handleSendResult(result, "✓ Warning logged successfully!");
  };

  const triggerInfo = async () => {
    setLogStatus("Triggering info log...");
    setLastError(null);
    setSendAlert(null);

    const result = await logger.info("This is a demo info message", {
      userAgent: navigator.userAgent,
      url: window.location.href,
      timestamp: new Date().toISOString(),
      demo: true,
    });
    handleSendResult(result, "✓ Info logged successfully!");
  };

  const triggerAsyncError = async () => {
    setLogStatus("Triggering async error...");
    setLastError(null);
    setSendAlert(null);

    try {
      await new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error("Async operation failed after 1 second"));
        }, 1000);
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      setLastError(errorMessage);

      const result = await logger.error(errorMessage, {
        type: "async",
        duration: "1000ms",
        userAgent: navigator.userAgent,
        url: window.location.href,
        timestamp: new Date().toISOString(),
        demo: true,
      });
      handleSendResult(result, "✓ Async error logged successfully!");
    }
  };

  const demoMeta = () => ({
    userAgent: navigator.userAgent,
    url: window.location.href,
    demo: true,
  });

  const captureIssue = async (
    label: string,
    createError: () => Error | unknown
  ) => {
    setLogStatus(`Capturing: ${label}...`);
    setLastError(null);
    setSendAlert(null);

    try {
      throw createError();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      setLastError(errorMessage);

      const result = await logger.capture(error, demoMeta());
      handleSendResult(
        result,
        `✓ Captured “${label}”. Re-click to bump the count; other buttons create separate Issues.`
      );
    }
  };

  const captureTypeError = () =>
    captureIssue(
      "TypeError",
      () => new TypeError("Demo capture: cannot read property of undefined")
    );

  const captureReferenceError = () =>
    captureIssue(
      "ReferenceError",
      () => new ReferenceError("Demo capture: config is not defined")
    );

  const captureRangeError = () =>
    captureIssue(
      "RangeError",
      () => new RangeError("Demo capture: maximum call stack size exceeded")
    );

  const captureNetworkError = () =>
    captureIssue(
      "Network Error",
      () => new Error("Demo capture: Failed to fetch /api/checkout")
    );

  const captureValidationError = () => {
    class ValidationError extends Error {
      constructor(message: string) {
        super(message);
        this.name = "ValidationError";
      }
    }
    return captureIssue(
      "ValidationError",
      () => new ValidationError("Demo capture: email must be a valid address")
    );
  };

  const captureStringThrow = () =>
    captureIssue("String throw", () => "Demo capture: non-Error throw");

  const emitWideEventCheckoutFailure = async () => {
    setLogStatus("Emitting wide event (checkout failure)...");
    setLastError(null);
    setSendAlert(null);

    const requestId = `req_${Math.random().toString(36).slice(2, 10)}`;
    const event = logger.createEvent({
      request_id: requestId,
      method: "POST",
      path: "/api/checkout",
      user: {
        id: "user_456",
        subscription: "premium",
        account_age_days: 847,
      },
      cart: {
        id: "cart_xyz",
        item_count: 3,
        total_cents: 15999,
        coupon_applied: "SAVE20",
      },
      feature_flags: {
        new_checkout_flow: true,
        express_payment: false,
      },
    });

    await new Promise((r) => setTimeout(r, 120));
    event.set({
      payment: {
        method: "card",
        provider: "stripe",
        latency_ms: 1089,
        attempt: 3,
      },
      status_code: 500,
      outcome: "error",
    });
    event.setError(
      Object.assign(new Error("Card declined by issuer"), {
        name: "PaymentError",
        code: "card_declined",
        retriable: false,
      })
    );

    const result = await event.emit("checkout failed");
    setLastError("Card declined by issuer");
    handleSendResult(
      result,
      `✓ Wide event emitted (request_id=${requestId}). Filter by request_id or user.id=user_456 in admin.`
    );
  };

  const emitWideEventSuccess = async () => {
    setLogStatus("Emitting wide event (success, may be sampled)...");
    setLastError(null);
    setSendAlert(null);

    const requestId = `req_${Math.random().toString(36).slice(2, 10)}`;
    const event = logger.createEvent({
      request_id: requestId,
      method: "GET",
      path: "/api/health",
      user: { id: "user_789", subscription: "free" },
    });
    await new Promise((r) => setTimeout(r, 40));
    event.set({ status_code: 200, outcome: "success" });
    const result = await event.emit("health check");
    handleSendResult(
      result,
      `✓ Wide event attempted (request_id=${requestId}). Happy-path events are sampled at 50%.`
    );
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

      {sendAlert && (
        <div
          role="alert"
          style={{
            marginBottom: "1rem",
            padding: "0.75rem 1rem",
            backgroundColor: "#fff3cd",
            border: "1px solid #ffecb5",
            borderRadius: "8px",
            color: "#664d03",
            fontSize: "0.9rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "0.75rem",
          }}
        >
          <span>
            <strong>Log request failed.</strong> {sendAlert}
          </span>
          <button
            type="button"
            onClick={() => setSendAlert(null)}
            aria-label="Dismiss"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#664d03",
              fontSize: "1.1rem",
              lineHeight: 1,
              padding: 0,
            }}
          >
            ×
          </button>
        </div>
      )}

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

      <h2
        style={{
          margin: "1.5rem 0 0.5rem",
          fontSize: "1.1rem",
          color: "#333",
        }}
      >
        Wide events (one rich event per request)
      </h2>
      <p
        style={{
          marginBottom: "1rem",
          color: "#666",
          fontSize: "0.875rem",
        }}
      >
        Instead of many sparse log lines, emit one structured event with all
        context. Errors are always kept; successful events may be sampled.
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: "1rem",
          marginBottom: "1rem",
        }}
      >
        <button
          onClick={emitWideEventCheckoutFailure}
          style={{
            padding: "1rem",
            backgroundColor: "#0d6efd",
            color: "white",
            border: "none",
            borderRadius: "8px",
            fontSize: "0.95rem",
            cursor: "pointer",
            fontWeight: "500",
          }}
        >
          Checkout failure (always kept)
        </button>
        <button
          onClick={emitWideEventSuccess}
          style={{
            padding: "1rem",
            backgroundColor: "#198754",
            color: "white",
            border: "none",
            borderRadius: "8px",
            fontSize: "0.95rem",
            cursor: "pointer",
            fontWeight: "500",
          }}
        >
          Happy path (50% sample)
        </button>
      </div>

      <h2
        style={{
          margin: "1.5rem 0 0.5rem",
          fontSize: "1.1rem",
          color: "#333",
        }}
      >
        Issues (logger.capture)
      </h2>
      <p
        style={{
          marginBottom: "1rem",
          color: "#666",
          fontSize: "0.875rem",
        }}
      >
        Each button creates a different fingerprint. Click the same one again to
        increase its count in the admin Issues tab.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: "1rem",
          marginBottom: "1rem",
        }}
      >
        {(
          [
            {
              label: "TypeError",
              onClick: captureTypeError,
              color: "#e83e8c",
              shadow: "rgba(232, 62, 140, 0.4)",
            },
            {
              label: "ReferenceError",
              onClick: captureReferenceError,
              color: "#fd7e14",
              shadow: "rgba(253, 126, 20, 0.4)",
            },
            {
              label: "RangeError",
              onClick: captureRangeError,
              color: "#20c997",
              shadow: "rgba(32, 201, 151, 0.4)",
            },
            {
              label: "Network Error",
              onClick: captureNetworkError,
              color: "#6610f2",
              shadow: "rgba(102, 16, 242, 0.4)",
            },
            {
              label: "ValidationError",
              onClick: captureValidationError,
              color: "#d63384",
              shadow: "rgba(214, 51, 132, 0.4)",
            },
            {
              label: "String throw",
              onClick: captureStringThrow,
              color: "#495057",
              shadow: "rgba(73, 80, 87, 0.4)",
            },
          ] as const
        ).map((btn) => (
          <button
            key={btn.label}
            onClick={btn.onClick}
            style={{
              padding: "1rem",
              backgroundColor: btn.color,
              color: "white",
              border: "none",
              borderRadius: "8px",
              fontSize: "0.95rem",
              cursor: "pointer",
              fontWeight: "500",
              transition: "transform 0.2s, box-shadow 0.2s",
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = `0 4px 12px ${btn.shadow}`;
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            {btn.label}
          </button>
        ))}
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
