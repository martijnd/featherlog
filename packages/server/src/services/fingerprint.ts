import { createHash } from "crypto";

/**
 * Normalize a stack trace so the same logical error groups across builds/paths.
 * - Keep the top frames (most relevant)
 * - Drop line/column numbers
 * - Strip absolute path prefixes / query strings / webpack noise
 */
export function normalizeStack(stack: string, maxFrames = 5): string {
  if (!stack) return "";

  const frames = stack
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/^Error\b/.test(line))
    .slice(0, maxFrames)
    .map((line) => {
      let normalized = line
        // strip query/hash from paths
        .replace(/(\.[a-zA-Z0-9]+)(\?[^:)\s]*)?/g, "$1")
        // strip :line:col
        .replace(/:\d+:\d+/g, "")
        // strip lone :line
        .replace(/:\d+(?=\))/g, "");

      // Prefer path after common source roots
      const srcMatch = normalized.match(
        /(?:^|\s|\()(?:.*?[/\\])?(src|app|packages)[/\\]([^)\s]+)/i
      );
      if (srcMatch) {
        return `at ${srcMatch[1]}/${srcMatch[2]}`.replace(/\\/g, "/");
      }

      // Fall back to basename of last path-like segment
      const pathMatch = normalized.match(
        /(?:[/\\]|^)([^/\\]+\.[a-zA-Z0-9]+)\)?$/
      );
      if (pathMatch) {
        return `at ${pathMatch[1]}`;
      }

      return normalized;
    });

  return frames.join("\n");
}

/**
 * Compute a stable fingerprint for issue grouping.
 * Returns null when there is no error structure to fingerprint.
 */
export function computeFingerprint(
  message: string,
  metadata: Record<string, any>
): string | null {
  const errorInfo =
    metadata.error && typeof metadata.error === "object"
      ? metadata.error
      : null;

  const name: string | null =
    (errorInfo && typeof errorInfo.name === "string" && errorInfo.name) ||
    (typeof metadata.name === "string" ? metadata.name : null);

  const stack: string | null =
    (errorInfo && typeof errorInfo.stack === "string" && errorInfo.stack) ||
    (typeof metadata.stack === "string" ? metadata.stack : null);

  // Only fingerprint structured error captures (or explicit stack metadata)
  if (!errorInfo && !stack) {
    return null;
  }

  const normalizedStack = normalizeStack(stack || "");
  const input = `${name || "Error"}\n${message}\n${normalizedStack}`;

  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}
