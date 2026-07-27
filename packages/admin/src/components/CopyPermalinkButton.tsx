import { useState, type MouseEvent } from "react";

interface CopyPermalinkButtonProps {
  url: string;
}

export default function CopyPermalinkButton({ url }: CopyPermalinkButtonProps) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  const handleCopy = async (e: MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(url);
      setStatus("copied");
      window.setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("failed");
      window.setTimeout(() => setStatus("idle"), 2000);
    }
  };

  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm"
      onClick={(e) => void handleCopy(e)}
      title="Copy admin permalink"
    >
      {status === "copied"
        ? "Copied"
        : status === "failed"
          ? "Copy failed"
          : "Copy link"}
    </button>
  );
}
