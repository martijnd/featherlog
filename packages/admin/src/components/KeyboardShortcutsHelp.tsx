import { useEffect, useId, useRef } from "react";

export interface ShortcutRow {
  keys: string[];
  description: string;
}

interface KeyboardShortcutsHelpProps {
  open: boolean;
  onClose: () => void;
  shortcuts: ShortcutRow[];
}

export default function KeyboardShortcutsHelp({
  open,
  onClose,
  shortcuts,
}: KeyboardShortcutsHelpProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    dialogRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "?") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="shortcuts-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className="shortcuts-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shortcuts-header">
          <h2 id={titleId} className="shortcuts-title">
            Keyboard shortcuts
          </h2>
          <button
            type="button"
            className="btn-icon"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <ul className="shortcuts-list">
          {shortcuts.map((row) => (
            <li key={row.description} className="shortcuts-row">
              <span className="shortcuts-keys">
                {row.keys.map((key) => (
                  <kbd key={key} className="kbd">
                    {key}
                  </kbd>
                ))}
              </span>
              <span className="shortcuts-desc">{row.description}</span>
            </li>
          ))}
        </ul>
        <p className="shortcuts-foot">
          Shortcuts are ignored while typing in inputs.
        </p>
      </div>
    </div>
  );
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return Boolean(target.closest("[contenteditable='true']"));
}
