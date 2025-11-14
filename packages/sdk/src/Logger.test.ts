import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { Logger } from "./Logger.js";

// Mock fetch globally
global.fetch = vi.fn();

describe("Logger", () => {
  const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset NODE_ENV
    delete process.env.NODE_ENV;
    delete process.env.FEATHERLOG_ENDPOINT;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  describe("constructor", () => {
    it("should create a Logger instance with valid options", () => {
      const logger = new Logger({
        secret: "test-secret",
        "project-id": "test-project",
      });

      expect(logger).toBeInstanceOf(Logger);
    });

    it("should throw error if secret is missing", () => {
      expect(() => {
        new Logger({
          secret: "",
          "project-id": "test-project",
        } as any);
      }).toThrow("Logger requires a secret option");
    });

    it("should throw error if project-id is missing", () => {
      expect(() => {
        new Logger({
          secret: "test-secret",
          "project-id": "",
        } as any);
      }).toThrow("Logger requires a project-id option");
    });

    it("should throw error if options is null", () => {
      expect(() => {
        new Logger(null as any);
      }).toThrow("Logger requires a secret option");
    });

    it("should use development endpoint by default", () => {
      const logger = new Logger({
        secret: "test-secret",
        "project-id": "test-project",
      });

      // Access private endpoint via any to test
      expect((logger as any).endpoint).toBe("http://localhost:3000/api/logs");
    });

    it("should use production endpoint when NODE_ENV is production", () => {
      process.env.NODE_ENV = "production";
      const logger = new Logger({
        secret: "test-secret",
        "project-id": "test-project",
      });

      expect((logger as any).endpoint).toBe(
        "https://featherlog.lekkerklooien.nl/api/logs"
      );
    });

    it("should use FEATHERLOG_ENDPOINT env var if set", () => {
      process.env.FEATHERLOG_ENDPOINT = "https://custom-endpoint.com/api/logs";
      const logger = new Logger({
        secret: "test-secret",
        "project-id": "test-project",
      });

      expect((logger as any).endpoint).toBe(
        "https://custom-endpoint.com/api/logs"
      );
    });
  });

  describe("error", () => {
    it("should send error log to server", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
      });

      const logger = new Logger({
        secret: "test-secret",
        "project-id": "test-project",
      });

      await logger.error("Test error message");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3000/api/logs",
        expect.objectContaining({
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Secret": "test-secret",
          },
        })
      );

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body).toMatchObject({
        "project-id": "test-project",
        level: "error",
        message: "Test error message",
      });
      expect(body.timestamp).toBeDefined();
    });

    it("should include metadata in error log", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
      });

      const logger = new Logger({
        secret: "test-secret",
        "project-id": "test-project",
      });

      await logger.error("Test error", { userId: 123, stack: "error stack" });

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body).toMatchObject({
        userId: 123,
        stack: "error stack",
      });
    });

    it("should silently fail on network error", async () => {
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const logger = new Logger({
        secret: "test-secret",
        "project-id": "test-project",
      });

      await logger.error("Test error");

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "Featherlog: Error sending log: Network error"
      );
      consoleWarnSpy.mockRestore();
    });

    it("should silently fail on non-ok response", async () => {
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const logger = new Logger({
        secret: "test-secret",
        "project-id": "test-project",
      });

      await logger.error("Test error");

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "Featherlog: Failed to send log. Status: 500"
      );
      consoleWarnSpy.mockRestore();
    });

    it("should not throw error on failure", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const logger = new Logger({
        secret: "test-secret",
        "project-id": "test-project",
      });

      await expect(logger.error("Test error")).resolves.not.toThrow();
    });
  });

  describe("warn", () => {
    it("should send warning log to server", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
      });

      const logger = new Logger({
        secret: "test-secret",
        "project-id": "test-project",
      });

      await logger.warn("Test warning");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body).toMatchObject({
        level: "warn",
        message: "Test warning",
      });
    });

    it("should include metadata in warning log", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
      });

      const logger = new Logger({
        secret: "test-secret",
        "project-id": "test-project",
      });

      await logger.warn("Test warning", { userId: 456 });

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body).toMatchObject({
        level: "warn",
        userId: 456,
      });
    });

    it("should silently fail on error", async () => {
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const logger = new Logger({
        secret: "test-secret",
        "project-id": "test-project",
      });

      await logger.warn("Test warning");

      expect(consoleWarnSpy).toHaveBeenCalled();
      consoleWarnSpy.mockRestore();
    });
  });

  describe("info", () => {
    it("should send info log to server", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
      });

      const logger = new Logger({
        secret: "test-secret",
        "project-id": "test-project",
      });

      await logger.info("Test info");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body).toMatchObject({
        level: "info",
        message: "Test info",
      });
    });

    it("should include metadata in info log", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
      });

      const logger = new Logger({
        secret: "test-secret",
        "project-id": "test-project",
      });

      await logger.info("Test info", { action: "login", userId: 789 });

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body).toMatchObject({
        level: "info",
        action: "login",
        userId: 789,
      });
    });

    it("should silently fail on error", async () => {
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const logger = new Logger({
        secret: "test-secret",
        "project-id": "test-project",
      });

      await logger.info("Test info");

      expect(consoleWarnSpy).toHaveBeenCalled();
      consoleWarnSpy.mockRestore();
    });
  });

  describe("timestamp generation", () => {
    it("should include ISO timestamp in log", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
      });

      const logger = new Logger({
        secret: "test-secret",
        "project-id": "test-project",
      });

      const beforeTime = Date.now();
      await logger.error("Test");
      const afterTime = Date.now();

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      const timestamp = new Date(body.timestamp).getTime();

      expect(timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(timestamp).toBeLessThanOrEqual(afterTime);
    });
  });

  describe("all log levels", () => {
    it("should use correct secret in all requests", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 201,
      });

      const logger = new Logger({
        secret: "my-secret-key",
        "project-id": "my-project",
      });

      await logger.error("error");
      await logger.warn("warn");
      await logger.info("info");

      expect(mockFetch).toHaveBeenCalledTimes(3);
      mockFetch.mock.calls.forEach((call) => {
        expect(call[1].headers["X-Secret"]).toBe("my-secret-key");
      });
    });

    it("should use correct project-id in all requests", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 201,
      });

      const logger = new Logger({
        secret: "secret",
        "project-id": "my-project-id",
      });

      await logger.error("error");
      await logger.warn("warn");
      await logger.info("info");

      expect(mockFetch).toHaveBeenCalledTimes(3);
      mockFetch.mock.calls.forEach((call) => {
        const body = JSON.parse(call[1].body);
        expect(body["project-id"]).toBe("my-project-id");
      });
    });
  });
});

