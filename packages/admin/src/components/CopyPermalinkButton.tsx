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
      className="btn btn-secondary btn-sm"
      onClick={(e) => void handleCopy(e)}
      title="Copy admin permalink"
    >
      {copied ? "Copied" : "Copy link"}
    </button>
  );
}
