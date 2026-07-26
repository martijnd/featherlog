import { useState, type MouseEvent } from "react";

interface CopyPermalinkButtonProps {
  url: string;
}

export default function CopyPermalinkButton({ url }: CopyPermalinkButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <button
      type="button"
      onClick={(e) => void handleCopy(e)}
      title="Copy admin permalink"
      style={{
        padding: "0.4rem 0.85rem",
        backgroundColor: "#6c757d",
        color: "white",
        border: "none",
        borderRadius: "4px",
        cursor: "pointer",
        fontSize: "0.875rem",
        fontWeight: 500,
      }}
    >
      {copied ? "Copied" : "Copy link"}
    </button>
  );
}
