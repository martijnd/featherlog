import { useState } from "react";
import {
  apiClient,
  CreateShareRequest,
  CreateShareResponse,
} from "../api/client";

interface ShareLinkPanelProps {
  request: CreateShareRequest;
  /** Prefer a local/public origin for the copied URL (Vite admin vs API host). */
  buildPublicUrl?: (token: string) => string;
}

export default function ShareLinkPanel({
  request,
  buildPublicUrl,
}: ShareLinkPanelProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [share, setShare] = useState<CreateShareResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoked, setRevoked] = useState(false);

  const shareUrl = share
    ? buildPublicUrl?.(share.token) ??
      `${window.location.origin}/share/${share.token}`
    : "";

  const handleOpen = async () => {
    setOpen(true);
    setError(null);
    setCopied(false);
    setRevoked(false);

    if (share && !revoked) return;

    setLoading(true);
    try {
      const created = await apiClient.createShare(request);
      setShare(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create share link");
      setShare(null);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Failed to copy link");
    }
  };

  const handleRevoke = async () => {
    if (!share) return;
    setLoading(true);
    setError(null);
    try {
      await apiClient.revokeShare(share.token);
      setRevoked(true);
      setShare(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke share link");
    } finally {
      setLoading(false);
    }
  };

  const formatExpiry = (iso: string) =>
    new Date(iso).toLocaleString(undefined, {
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          void handleOpen();
        }}
        style={{
          padding: "0.4rem 0.85rem",
          backgroundColor: "#007bff",
          color: "white",
          border: "none",
          borderRadius: "4px",
          cursor: "pointer",
          fontSize: "0.875rem",
          fontWeight: 500,
        }}
      >
        Share
      </button>

      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            top: "calc(100% + 0.5rem)",
            right: 0,
            width: "min(360px, 90vw)",
            backgroundColor: "white",
            border: "1px solid #dee2e6",
            borderRadius: "8px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            padding: "1rem",
            zIndex: 2100,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "0.75rem",
            }}
          >
            <strong style={{ fontSize: "0.9rem", color: "#212529" }}>
              Public share link
            </strong>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{
                background: "none",
                border: "none",
                fontSize: "1.25rem",
                cursor: "pointer",
                color: "#6c757d",
                lineHeight: 1,
                padding: 0,
              }}
            >
              ×
            </button>
          </div>

          {loading && !share && (
            <div style={{ fontSize: "0.875rem", color: "#6c757d" }}>
              Creating link…
            </div>
          )}

          {error && (
            <div
              style={{
                fontSize: "0.875rem",
                color: "#dc3545",
                marginBottom: "0.5rem",
              }}
            >
              {error}
            </div>
          )}

          {revoked && !share && (
            <div
              style={{
                fontSize: "0.875rem",
                color: "#6c757d",
                marginBottom: "0.75rem",
              }}
            >
              Link revoked. Create a new one to share again.
            </div>
          )}

          {share && (
            <>
              <input
                readOnly
                value={shareUrl}
                onFocus={(e) => e.currentTarget.select()}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "0.5rem 0.6rem",
                  border: "1px solid #ced4da",
                  borderRadius: "4px",
                  fontSize: "0.8rem",
                  fontFamily: "monospace",
                  marginBottom: "0.5rem",
                }}
              />
              <div
                style={{
                  fontSize: "0.75rem",
                  color: "#6c757d",
                  marginBottom: "0.75rem",
                }}
              >
                Expires {formatExpiry(share.expires_at)}
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  onClick={() => void handleCopy()}
                  disabled={loading}
                  style={{
                    flex: 1,
                    padding: "0.45rem 0.75rem",
                    backgroundColor: "#28a745",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "0.85rem",
                  }}
                >
                  {copied ? "Copied" : "Copy"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleRevoke()}
                  disabled={loading}
                  style={{
                    flex: 1,
                    padding: "0.45rem 0.75rem",
                    backgroundColor: "#dc3545",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: loading ? "not-allowed" : "pointer",
                    fontSize: "0.85rem",
                  }}
                >
                  Revoke
                </button>
              </div>
            </>
          )}

          {revoked && !share && (
            <button
              type="button"
              onClick={() => void handleOpen()}
              disabled={loading}
              style={{
                width: "100%",
                padding: "0.45rem 0.75rem",
                backgroundColor: "#007bff",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "0.85rem",
              }}
            >
              Create new link
            </button>
          )}
        </div>
      )}
    </div>
  );
}
