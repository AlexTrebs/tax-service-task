import { describe, expect, it } from "bun:test";
import { loadEnv } from "../../src/config/env";

describe("loadEnv", () => {
  it("applies defaults when nothing is set", () => {
    expect(loadEnv({})).toEqual({
      port: 3000,
      dbPath: "data/tax.db",
      logLevel: "info",
      shutdownDelayMs: 0,
      shutdownTimeoutMs: 10_000
    });
  });

  it("coerces numeric strings", () => {
    const env = loadEnv({ PORT: "8080", SHUTDOWN_TIMEOUT_MS: "500", LOG_LEVEL: "debug" });
    expect(env).toMatchObject({ port: 8080, shutdownTimeoutMs: 500, logLevel: "debug" });
  });

  it.each([
    ["non-numeric PORT", { PORT: "abc" }],
    ["out of range PORT", { PORT: "70000" }],
    ["unknown LOG_LEVEL", { LOG_LEVEL: "verbose" }],
    ["zero SHUTDOWN_TIMEOUT_MS", { SHUTDOWN_TIMEOUT_MS: "0" }],
    ["negative SHUTDOWN_DELAY_MS", { SHUTDOWN_DELAY_MS: "-1" }]
  ])("throws on %s", (_name, env) => {
    expect(() => loadEnv(env)).toThrow("Invalid environment configuration");
  });
});
