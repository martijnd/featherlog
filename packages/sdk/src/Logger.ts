export interface LoggerOptions {
  "project-id": string;
  /** Service name attached to every event (e.g. "checkout-service") */
  service?: string;
  /** Deployed version / release (e.g. "2.4.1") */
  version?: string;
  /** Environment name (e.g. "production", "staging") */
  environment?: string;
  /**
   * Tail-sampling rate for non-critical events (0–1).
   * Errors, slow requests, and VIP users are always kept.
   * Default: 1 (keep everything).
   */
  sampleRate?: number;
  /** Always keep events with duration_ms above this threshold. Default: 2000 */
  slowThresholdMs?: number;
  /** Always keep events for these user ids (checked on user.id / user_id) */
  alwaysKeepUserIds?: string[];
}

export interface LogMetadata {
  [key: string]: any;
}

export interface CapturedError {
  name: string;
  message?: string;
  stack?: string;
  code?: string | number;
  retriable?: boolean;
  [key: string]: unknown;
}

export type LogLevel = "error" | "warn" | "info";

/** Outcome of a send attempt. Never throws — check `ok` instead. */
export interface SendResult {
  ok: boolean;
  /** HTTP status when a response was received */
  status?: number;
  /** Human-readable failure reason */
  error?: string;
  /** True when the event was dropped by client-side sampling */
  sampled?: boolean;
}

function extractError(error: unknown): { message: string; error: CapturedError } {
  if (error instanceof Error) {
    const captured: CapturedError = {
      name: error.name || "Error",
      message: error.message,
      stack: error.stack,
    };
    const withCode = error as Error & { code?: string | number; retriable?: boolean };
    if (withCode.code !== undefined) captured.code = withCode.code;
    if (withCode.retriable !== undefined) captured.retriable = withCode.retriable;
    return {
      message: error.message || error.name || "Error",
      error: captured,
    };
  }

  if (typeof error === "string") {
    return {
      message: error,
      error: { name: "Error", message: error },
    };
  }

  return {
    message: String(error),
    error: { name: "Error", message: String(error) },
  };
}

function deepMerge(
  target: LogMetadata,
  source: LogMetadata
): LogMetadata {
  const result: LogMetadata = { ...target };
  for (const [key, value] of Object.entries(source)) {
    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      typeof result[key] === "object" &&
      result[key] !== null &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(result[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function getUserId(metadata: LogMetadata): string | undefined {
  if (metadata.user && typeof metadata.user === "object" && metadata.user.id != null) {
    return String(metadata.user.id);
  }
  if (metadata.user_id != null) return String(metadata.user_id);
  if (metadata.userId != null) return String(metadata.userId);
  return undefined;
}

/**
 * Mutable wide event: accumulate request context, emit once at the end.
 * Prefer this over many sparse log lines for a single request.
 */
export class WideEvent {
  private logger: Logger;
  private fields: LogMetadata;
  private startedAt: number;
  private emitted = false;

  constructor(logger: Logger, initial: LogMetadata = {}) {
    this.logger = logger;
    this.fields = { ...initial };
    this.startedAt = Date.now();
  }

  /** Merge fields into the event (shallow for top-level keys; nested objects deep-merged). */
  set(fields: LogMetadata): this;
  set(key: string, value: unknown): this;
  set(keyOrFields: string | LogMetadata, value?: unknown): this {
    if (typeof keyOrFields === "string") {
      this.fields[keyOrFields] = value;
    } else {
      this.fields = deepMerge(this.fields, keyOrFields);
    }
    return this;
  }

  /** Attach a structured error (for fingerprinting + always-keep sampling). */
  setError(error: unknown): this {
    const extracted = extractError(error);
    this.fields.error = {
      ...(typeof this.fields.error === "object" && this.fields.error
        ? this.fields.error
        : {}),
      ...extracted.error,
    };
    if (!this.fields.outcome) {
      this.fields.outcome = "error";
    }
    return this;
  }

  /** Snapshot of current fields (does not include auto duration until emit). */
  toJSON(): LogMetadata {
    return { ...this.fields };
  }

  /**
   * Emit the wide event once. Defaults level from outcome/error;
   * message defaults to path, event name, or "request".
   */
  async emit(
    messageOrLevel?: string,
    maybeLevel?: LogLevel
  ): Promise<SendResult> {
    if (this.emitted) {
      return { ok: false, error: "Event already emitted" };
    }
    this.emitted = true;

    let message: string | undefined;
    let level: LogLevel | undefined;

    if (
      messageOrLevel === "error" ||
      messageOrLevel === "warn" ||
      messageOrLevel === "info"
    ) {
      level = messageOrLevel;
    } else if (messageOrLevel !== undefined) {
      message = messageOrLevel;
      level = maybeLevel;
    }

    if (this.fields.duration_ms == null) {
      this.fields.duration_ms = Date.now() - this.startedAt;
    }

    const hasError = !!this.fields.error;
    const outcome = this.fields.outcome;
    const status =
      typeof this.fields.status_code === "number"
        ? this.fields.status_code
        : undefined;

    if (!level) {
      if (
        hasError ||
        outcome === "error" ||
        (status !== undefined && status >= 500)
      ) {
        level = "error";
      } else if (
        outcome === "warn" ||
        (status !== undefined && status >= 400)
      ) {
        level = "warn";
      } else {
        level = "info";
      }
    }

    if (!message) {
      message =
        (typeof this.fields.message === "string" && this.fields.message) ||
        (typeof this.fields.event === "string" && this.fields.event) ||
        (typeof this.fields.path === "string" && this.fields.path) ||
        "request";
    }

    const { message: _drop, ...payload } = this.fields;
    return this.logger.sendLevel(level, message, payload);
  }
}

export class Logger {
  private projectId: string;
  private endpoint: string;
  private service?: string;
  private version?: string;
  private environment?: string;
  private sampleRate: number;
  private slowThresholdMs: number;
  private alwaysKeepUserIds: Set<string>;
  private context: LogMetadata = {};

  constructor(options: LoggerOptions) {
    if (!options || !options["project-id"]) {
      throw new Error("Logger requires a project-id option");
    }

    this.projectId = options["project-id"];
    this.service = options.service;
    this.version = options.version;
    this.environment = options.environment;
    this.sampleRate =
      options.sampleRate === undefined
        ? 1
        : Math.min(1, Math.max(0, options.sampleRate));
    this.slowThresholdMs = options.slowThresholdMs ?? 2000;
    this.alwaysKeepUserIds = new Set(
      (options.alwaysKeepUserIds || []).map(String)
    );

    const envEndpoint =
      typeof process !== "undefined" &&
      process.env &&
      process.env.FEATHERLOG_ENDPOINT;

    if (envEndpoint) {
      this.endpoint = envEndpoint;
      return;
    }

    const nodeEnv =
      (typeof process !== "undefined" && process.env && process.env.NODE_ENV) ||
      "development";

    if (nodeEnv === "production") {
      this.endpoint = "https://featherlog.x4d.nl/api/logs";
    } else {
      this.endpoint = "http://localhost:5000/api/logs";
    }
  }

  /** Merge persistent context into every subsequent log/event. */
  setContext(context: LogMetadata): void {
    this.context = deepMerge(this.context, context);
  }

  /** Replace or clear persistent context. */
  clearContext(): void {
    this.context = {};
  }

  getContext(): LogMetadata {
    return { ...this.context };
  }

  /**
   * Start a wide event (canonical log line). Enrich during the request, emit once.
   *
   * @example
   * const event = logger.createEvent({ request_id, method, path });
   * event.set({ user: { id: user.id, subscription: user.tier } });
   * // ... handle request ...
   * event.set({ status_code: 500, outcome: "error" }).setError(err);
   * await event.emit();
   */
  createEvent(initial: LogMetadata = {}): WideEvent {
    return new WideEvent(this, initial);
  }

  /** Whether this event should be kept under current tail-sampling rules. */
  shouldSample(level: LogLevel, metadata: LogMetadata): boolean {
    if (level === "error") return true;
    if (metadata.error) return true;
    if (metadata.outcome === "error") return true;

    const status =
      typeof metadata.status_code === "number" ? metadata.status_code : undefined;
    if (status !== undefined && status >= 500) return true;

    const duration =
      typeof metadata.duration_ms === "number" ? metadata.duration_ms : undefined;
    if (duration !== undefined && duration >= this.slowThresholdMs) return true;

    const userId = getUserId(metadata);
    if (userId && this.alwaysKeepUserIds.has(userId)) return true;

    if (this.sampleRate >= 1) return true;
    if (this.sampleRate <= 0) return false;
    return Math.random() < this.sampleRate;
  }

  private buildPayload(metadata: LogMetadata): LogMetadata {
    const base: LogMetadata = {};
    if (this.service) base.service = this.service;
    if (this.version) base.version = this.version;
    if (this.environment) base.environment = this.environment;

    return deepMerge(deepMerge(base, this.context), metadata);
  }

  /** @internal used by WideEvent; prefer public log methods */
  async sendLevel(
    level: LogLevel,
    message: string,
    metadata: LogMetadata = {}
  ): Promise<SendResult> {
    return this.send(level, message, metadata);
  }

  private async send(
    level: LogLevel,
    message: string,
    metadata: LogMetadata = {}
  ): Promise<SendResult> {
    const payload = this.buildPayload(metadata);

    if (!this.shouldSample(level, payload)) {
      return { ok: true, sampled: true };
    }

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
          ...payload,
        }),
      });

      if (!response.ok) {
        const error = `Failed to send log. Status: ${response.status}`;
        console.warn(`Featherlog: ${error}`);
        return { ok: false, status: response.status, error };
      }

      return { ok: true, status: response.status };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.warn(`Featherlog: Error sending log: ${errorMessage}`);
      return { ok: false, error: errorMessage };
    }
  }

  async error(
    message: string,
    metadata: LogMetadata = {}
  ): Promise<SendResult> {
    return this.send("error", message, metadata);
  }

  async warn(
    message: string,
    metadata: LogMetadata = {}
  ): Promise<SendResult> {
    return this.send("warn", message, metadata);
  }

  async info(
    message: string,
    metadata: LogMetadata = {}
  ): Promise<SendResult> {
    return this.send("info", message, metadata);
  }

  /**
   * Capture an Error (or unknown thrown value) with stack/type for issue fingerprinting.
   */
  async capture(
    error: unknown,
    metadata: LogMetadata = {}
  ): Promise<SendResult> {
    const extracted = extractError(error);
    return this.send("error", extracted.message, {
      ...metadata,
      error: extracted.error,
    });
  }
}
