export interface LoggerOptions {
  secret: string;
  "project-id": string;
}

export interface LogMetadata {
  [key: string]: any;
}

export class Logger {
  private secret: string;
  private projectId: string;
  private endpoint: string;

  constructor(options: LoggerOptions) {
    if (!options || !options.secret) {
      throw new Error("Logger requires a secret option");
    }
    if (!options["project-id"]) {
      throw new Error("Logger requires a project-id option");
    }

    this.secret = options.secret;
    this.projectId = options["project-id"];

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

  async error(message: string, metadata: LogMetadata = {}): Promise<void> {
    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Secret": this.secret,
        },
        body: JSON.stringify({
          "project-id": this.projectId,
          level: "error",
          message: message,
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

  async warn(message: string, metadata: LogMetadata = {}): Promise<void> {
    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Secret": this.secret,
        },
        body: JSON.stringify({
          "project-id": this.projectId,
          level: "warn",
          message: message,
          timestamp: new Date().toISOString(),
          ...metadata,
        }),
      });

      if (!response.ok) {
        console.warn(
          `Featherlog: Failed to send log. Status: ${response.status}`
        );
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.warn(`Featherlog: Error sending log: ${errorMessage}`);
    }
  }

  async info(message: string, metadata: LogMetadata = {}): Promise<void> {
    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Secret": this.secret,
        },
        body: JSON.stringify({
          "project-id": this.projectId,
          level: "info",
          message: message,
          timestamp: new Date().toISOString(),
          ...metadata,
        }),
      });

      if (!response.ok) {
        console.warn(
          `Featherlog: Failed to send log. Status: ${response.status}`
        );
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.warn(`Featherlog: Error sending log: ${errorMessage}`);
    }
  }
}
