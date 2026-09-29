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
        "project-id": "test-project",
      });

      expect(logger).toBeInstanceOf(Logger);
    });

    it("should throw error if project-id is missing", () => {
      expect(() => {
        new Logger({
          "project-id": "",
        } as any);
      }).toThrow("Logger requires a project-id option");
    });

    it("should throw error if options is null", () => {
      expect(() => {
        new Logger(null as any);
      }).toThrow("Logger requires a project-id option");
    });

    it("should use development endpoint by default", () => {
      const logger = new Logger({
        "project-id": "test-project",
      });

      // Access private endpoint via any to test
      expect((logger as any).endpoint).toBe("http://localhost:5000/api/logs");
    });

    it("should use production endpoint when NODE_ENV is production", () => {
      process.env.NODE_ENV = "production";
      const logger = new Logger({
        "project-id": "test-project",
      });

      expect((logger as any).endpoint).toBe(
        "https://featherlog.x4d.nl/api/logs",
      );
    });

    it("should use FEATHERLOG_ENDPOINT env var if set", () => {
      process.env.FEATHERLOG_ENDPOINT = "https://custom-endpoint.com/api/logs";
      const logger = new Logger({
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
        "project-id": "test-project",
      });

      await logger.error("Test error message");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:5000/api/logs",
        expect.objectContaining({
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        })
      );

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[1].headers).not.toHaveProperty("X-Secret");
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
      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const logger = new Logger({
        "project-id": "test-project",
      });

      const result = await logger.error("Test error");

      expect(result).toEqual({ ok: false, error: "Network error" });
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "Featherlog: Error sending log: Network error"
      );
      consoleWarnSpy.mockRestore();
    });

    it("should return ok:false on non-ok response", async () => {
      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      });

      const logger = new Logger({
        "project-id": "test-project",
      });

      const result = await logger.error("Test error");

      expect(result).toEqual({
        ok: false,
        status: 403,
        error: "Failed to send log. Status: 403",
      });
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "Featherlog: Failed to send log. Status: 403"
      );
      consoleWarnSpy.mockRestore();
    });

    it("should not throw error on failure", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const logger = new Logger({
        "project-id": "test-project",
      });

      await expect(logger.error("Test error")).resolves.not.toThrow();
    });

    it("should return ok:true on success", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
      });

      const logger = new Logger({
        "project-id": "test-project",
      });

      const result = await logger.error("Test error");
      expect(result).toEqual({ ok: true, status: 201 });
    });
  });

  describe("warn", () => {
    it("should send warning log to server", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
      });

      const logger = new Logger({
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
      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const logger = new Logger({
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
      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const logger = new Logger({
        "project-id": "test-project",
      });

      await logger.info("Test info");

      expect(consoleWarnSpy).toHaveBeenCalled();
      consoleWarnSpy.mockRestore();
    });
  });

  describe("capture", () => {
    it("should send error name and stack for Error instances", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
      });

      const logger = new Logger({
        "project-id": "test-project",
      });

      const error = new TypeError("Cannot read property");
      await logger.capture(error);

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body).toMatchObject({
        "project-id": "test-project",
        level: "error",
        message: "Cannot read property",
        error: {
          name: "TypeError",
        },
      });
      expect(body.error.stack).toContain("TypeError");
    });

    it("should capture string errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
      });

      const logger = new Logger({
        "project-id": "test-project",
      });

      await logger.capture("plain string failure");

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body).toMatchObject({
        level: "error",
        message: "plain string failure",
        error: { name: "Error" },
      });
    });

    it("should merge extra metadata with captured error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
      });

      const logger = new Logger({
        "project-id": "test-project",
      });

      await logger.capture(new Error("boom"), { userId: 42, demo: true });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.userId).toBe(42);
      expect(body.demo).toBe(true);
      expect(body.error.name).toBe("Error");
      expect(body.error.stack).toBeDefined();
    });

    it("should silently fail on network error", async () => {
      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const logger = new Logger({
        "project-id": "test-project",
      });

      await expect(logger.capture(new Error("boom"))).resolves.not.toThrow();
      expect(consoleWarnSpy).toHaveBeenCalled();
      consoleWarnSpy.mockRestore();
    });
  });

  describe("context and service defaults", () => {
    it("should merge service/version/environment and setContext into payloads", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 201 });

      const logger = new Logger({
        "project-id": "test-project",
        service: "checkout-service",
        version: "2.4.1",
        environment: "production",
      });
      logger.setContext({ region: "us-east-1" });

      await logger.info("hello", { request_id: "req_1" });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body).toMatchObject({
        service: "checkout-service",
        version: "2.4.1",
        environment: "production",
        region: "us-east-1",
        request_id: "req_1",
      });
    });

    it("should clear context", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 201 });

      const logger = new Logger({ "project-id": "test-project" });
      logger.setContext({ region: "us-east-1" });
      logger.clearContext();
      await logger.info("hello");

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.region).toBeUndefined();
    });
  });

  describe("tail sampling", () => {
    it("should always keep error-level events even at sampleRate 0", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 201 });

      const logger = new Logger({
        "project-id": "test-project",
        sampleRate: 0,
      });

      await logger.error("boom");
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("should drop info events when sampleRate is 0", async () => {
      const logger = new Logger({
        "project-id": "test-project",
        sampleRate: 0,
      });

      const result = await logger.info("ok");
      expect(mockFetch).not.toHaveBeenCalled();
      expect(result).toEqual({ ok: true, sampled: true });
    });

    it("should always keep slow events", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 201 });

      const logger = new Logger({
        "project-id": "test-project",
        sampleRate: 0,
        slowThresholdMs: 100,
      });

      await logger.info("slow", { duration_ms: 250 });
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("should always keep VIP users", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 201 });

      const logger = new Logger({
        "project-id": "test-project",
        sampleRate: 0,
        alwaysKeepUserIds: ["vip_1"],
      });

      await logger.info("ok", { user: { id: "vip_1" } });
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("createEvent / WideEvent", () => {
    it("should emit one wide event with accumulated context", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 201 });

      const logger = new Logger({
        "project-id": "test-project",
        service: "checkout-service",
      });

      const event = logger.createEvent({
        request_id: "req_abc",
        method: "POST",
        path: "/api/checkout",
      });
      event.set({ user: { id: "user_1", subscription: "premium" } });
      event.set("status_code", 500);
      event.setError(new TypeError("payment failed"));
      await event.emit();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.level).toBe("error");
      expect(body.message).toBe("/api/checkout");
      expect(body.service).toBe("checkout-service");
      expect(body.request_id).toBe("req_abc");
      expect(body.user).toEqual({ id: "user_1", subscription: "premium" });
      expect(body.status_code).toBe(500);
      expect(body.outcome).toBe("error");
      expect(body.error.name).toBe("TypeError");
      expect(body.error.stack).toBeDefined();
      expect(typeof body.duration_ms).toBe("number");
    });

    it("should not emit twice", async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 201 });

      const logger = new Logger({ "project-id": "test-project" });
      const event = logger.createEvent({ path: "/x" });
      const first = await event.emit("done", "info");
      const second = await event.emit("done again", "info");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(first.ok).toBe(true);
      expect(second).toEqual({ ok: false, error: "Event already emitted" });
    });
  });

  describe("timestamp generation", () => {
    it("should include ISO timestamp in log", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
      });

      const logger = new Logger({
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
    it("should not include secret header in requests", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 201,
      });

      const logger = new Logger({
        "project-id": "my-project",
      });

      await logger.error("error");
      await logger.warn("warn");
      await logger.info("info");

      expect(mockFetch).toHaveBeenCalledTimes(3);
      mockFetch.mock.calls.forEach((call) => {
        expect(call[1].headers).not.toHaveProperty("X-Secret");
      });
    });

    it("should use correct project-id in all requests", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 201,
      });

      const logger = new Logger({
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
