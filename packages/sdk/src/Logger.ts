export interface LoggerOptions {
  "project-id": string;
}

export interface LogMetadata {
  [key: string]: any;
}

export interface CapturedError {
  name: string;
  stack?: string;
}

function extractError(error: unknown): { message: string; error: CapturedError } {
  if (error instanceof Error) {
    return {
      message: error.message || error.name || "Error",
      error: {
        name: error.name || "Error",
        stack: error.stack,
      },
    };
  }

  if (typeof error === "string") {
    return {
      message: error,
      error: { name: "Error" },
    };
  }

  return {
    message: String(error),
    error: { name: "Error" },
  };
}

export class Logger {
  private projectId: string;
  private endpoint: string;

  constructor(options: LoggerOptions) {
    if (!options || !options["project-id"]) {
      throw new Error("Logger requires a project-id option");
    }

    this.projectId = options["project-id"];

    // Check for FEATHERLOG_ENDPOINT environment variable first
    const envEndpoint =
      typeof process !== "undefined" &&
      process.env &&
      process.env.FEATHERLOG_ENDPOINT;

    if (envEndpoint) {
      this.endpoint = envEndpoint;
      return;
    }

    // Detect if we're in production
    // In browser/Vite: process.env.NODE_ENV is replaced at build time
    // In Node.js: process.env.NODE_ENV is available at runtime
    // Default to development (localhost) unless explicitly production
    const nodeEnv =
      (typeof process !== "undefined" && process.env && process.env.NODE_ENV) ||
      "development";

    // In browser environments, if process.env is not available or NODE_ENV is not set,
    // we're likely in development. Only use production endpoint if explicitly "production"
    if (nodeEnv === "production") {
      // Production: default production endpoint
      this.endpoint = "https://featherlog.lekkerklooien.nl/api/logs";
    } else {
      // Development: default to localhost
      this.endpoint = "http://localhost:3000/api/logs";
    }
  }

  private async send(
    level: "error" | "warn" | "info",
    message: string,
    metadata: LogMetadata = {}
  ): Promise<void> {
    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          "project-id": this.projectId,
          level,
          message,
          timestamp: new Date().toISOString(),
          ...metadata,
        }),
      });

      if (!response.ok) {
        // Silently fail - we don't want logging errors to break the app
        console.warn(
          `Featherlog: Failed to send log. Status: ${response.status}`
        );
      }
    } catch (error) {
      // Silently fail - we don't want logging errors to break the app
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.warn(`Featherlog: Error sending log: ${errorMessage}`);
    }
  }

  async error(message: string, metadata: LogMetadata = {}): Promise<void> {
    await this.send("error", message, metadata);
  }

  async warn(message: string, metadata: LogMetadata = {}): Promise<void> {
    await this.send("warn", message, metadata);
  }

  async info(message: string, metadata: LogMetadata = {}): Promise<void> {
    await this.send("info", message, metadata);
  }

  /**
   * Capture an Error (or unknown thrown value) with stack/type for issue fingerprinting.
   */
  async capture(error: unknown, metadata: LogMetadata = {}): Promise<void> {
    const extracted = extractError(error);
    await this.send("error", extracted.message, {
      ...metadata,
      error: extracted.error,
    });
  }
}
