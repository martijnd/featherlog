import { EventEmitter } from "events";

// Log entry format for SSE (matches frontend format)
export interface SSELogEntry {
  id: number;
  "project-id": string;
  level: "error" | "warn" | "info";
  message: string;
  timestamp: string | Date;
  metadata: Record<string, any>;
  fingerprint?: string | null;
  /** True when ingest auto-reopened a previously resolved issue */
  reopened?: boolean;
}

// Singleton event emitter for broadcasting new logs
class LogBroadcaster extends EventEmitter {
  private static instance: LogBroadcaster;

  private constructor() {
    super();
  }

  static getInstance(): LogBroadcaster {
    if (!LogBroadcaster.instance) {
      LogBroadcaster.instance = new LogBroadcaster();
    }
    return LogBroadcaster.instance;
  }

  // Broadcast a new log to all connected clients
  broadcastLog(log: SSELogEntry) {
    this.emit("new-log", log);
  }
}

export const logBroadcaster = LogBroadcaster.getInstance();

