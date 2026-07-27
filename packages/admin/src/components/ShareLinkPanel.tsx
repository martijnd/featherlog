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
    <div className="u-relative">
      <button
        type="button"
        className="btn btn-primary btn-sm"
        onClick={(e) => {
          e.stopPropagation();
          void handleOpen();
        }}
      >
        Share
      </button>

      {open && (
        <div className="popover" onClick={(e) => e.stopPropagation()}>
          <div className="popover-header">
            <strong style={{ fontSize: "13px" }}>Public share link</strong>
            <button
              type="button"
              className="btn-icon"
              onClick={() => setOpen(false)}
              aria-label="Close"
            >
              ×
            </button>
          </div>

          {loading && !share && (
            <div className="u-text-sm u-text-muted">Creating link…</div>
          )}

          {error && (
            <div className="alert alert-error" style={{ marginBottom: "0.5rem" }}>
              {error}
            </div>
          )}

          {revoked && !share && (
            <div className="u-text-sm u-text-muted u-mb-md">
              Link revoked. Create a new one to share again.
            </div>
          )}

          {share && (
            <>
              <input
                className="input input-mono"
                readOnly
                value={shareUrl}
                onFocus={(e) => e.currentTarget.select()}
                style={{ marginBottom: "0.5rem" }}
              />
              <div className="u-text-sm u-text-muted u-mb-md">
                Expires {formatExpiry(share.expires_at)}
              </div>
              <div className="u-flex u-gap-sm">
                <button
                  type="button"
                  className="btn btn-success"
                  style={{ flex: 1 }}
                  onClick={() => void handleCopy()}
                  disabled={loading}
                >
                  {copied ? "Copied" : "Copy"}
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  style={{ flex: 1 }}
                  onClick={() => void handleRevoke()}
                  disabled={loading}
                >
                  Revoke
                </button>
              </div>
            </>
          )}

          {revoked && !share && (
            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={() => void handleOpen()}
              disabled={loading}
            >
              Create new link
            </button>
          )}
        </div>
      )}
    </div>
  );
}
