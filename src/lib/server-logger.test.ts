import { describe, test, expect, spyOn } from "bun:test";
import { logServerEvent } from "./server-logger";

describe("logServerEvent", () => {
  test("degraded severity calls console.warn with module info", () => {
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    logServerEvent({
      module: "test-module",
      operation: "test-op",
      severity: "degraded",
      message: "degraded failure",
    });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [label, payload] = warnSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(label).toBe("[ServerLog]");
    expect(payload.module).toBe("test-module");
    expect(payload.severity).toBe("degraded");
    warnSpy.mockRestore();
  });

  test("fatal severity calls console.error", () => {
    const errorSpy = spyOn(console, "error").mockImplementation(() => {});
    logServerEvent({
      module: "test-module",
      operation: "test-op",
      severity: "fatal",
      message: "fatal failure",
    });
    expect(errorSpy).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });

  test("Error object is normalized to message string", () => {
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    logServerEvent({
      module: "m",
      operation: "o",
      severity: "degraded",
      message: "msg",
      error: new Error("something went wrong"),
    });
    const [, payload] = warnSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(payload.error).toBe("something went wrong");
    warnSpy.mockRestore();
  });

  test("non-fatal failure does not throw", () => {
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    expect(() =>
      logServerEvent({ module: "m", operation: "o", severity: "degraded", message: "ok" })
    ).not.toThrow();
    warnSpy.mockRestore();
  });
});
