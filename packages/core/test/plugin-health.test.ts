import { describe, expect, it } from "vitest";
import { pluginHealthFromError, responsivePluginHealth } from "../src/plugin-health.js";

describe("plugin health evidence", () => {
  it.each([
    [
      "no heartbeat for 36 s",
      36000,
    ],
    [
      "The plugin tab appears to be suspended (no heartbeat for 898s)",
      898000,
    ],
    [
      "no heartbeat for 167 seconds",
      167000,
    ],
    [
      "no heartbeat for 283000ms",
      283000,
    ],
    [
      "no heartbeat for 762 milliseconds",
      762,
    ],
    [
      "no heartbeat for 1.5s",
      1500,
    ],
    [
      "no heartbeat for 0.5ms",
      0.5,
    ],
    [
      "no heartbeat for 0s",
      0,
    ],
  ])("extracts upstream heartbeat age from %s", (message, heartbeatAgeMs) => {
    expect(pluginHealthFromError(new Error(message))).toEqual({
      state: "suspended",
      heartbeatAgeMs,
      heartbeatSource: "upstream-error",
      keepAlive: {
        method: "unknown",
        verified: false,
      },
    });
  });

  it.each([
    "no heartbeat for -36s",
    "no heartbeat for +36s",
    "no heartbeat for NaNs",
    "no heartbeat for Infinitys",
    "no heartbeat for 1e3s",
    "no heartbeat for 1.2.3s",
    "no heartbeat for 9007199254740991s",
    "no heartbeat for 36 minutes",
    "no heartbeat for 36",
    "suspended after execution",
  ])("does not invent an age from %s", (message) => {
    expect(pluginHealthFromError(message)).toMatchObject({
      state: "suspended",
      heartbeatAgeMs: null,
      heartbeatSource: "unavailable",
    });
  });

  it("uses an explicit suspension classification without inferring a heartbeat age", () => {
    expect(
      pluginHealthFromError({
        code: "plugin-suspended",
      }),
    ).toMatchObject({
      state: "suspended",
      heartbeatAgeMs: null,
    });
  });

  it.each([
    new Error("MCP request timeout"),
    new Error("disconnected"),
    undefined,
    {},
  ])("does not label a generic failure as suspension: %s", (error) => {
    expect(pluginHealthFromError(error)).toMatchObject({
      state: "unknown",
      heartbeatAgeMs: null,
      heartbeatSource: "unavailable",
    });
  });

  it("bounds parsing and retains no raw error text or credentials", () => {
    const error = new Error(
      `https://example.test/mcp?userToken=PRIVATE ${"x".repeat(8192)} no heartbeat for 36s`,
    );
    const result = pluginHealthFromError(error);
    expect(result.state).toBe("unknown");
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
  });

  it("does not equate successful fresh execution with a heartbeat age of zero", () => {
    expect(responsivePluginHealth()).toEqual({
      state: "responsive",
      heartbeatAgeMs: null,
      heartbeatSource: "unavailable",
      keepAlive: {
        method: "unknown",
        verified: false,
      },
    });
  });
});
