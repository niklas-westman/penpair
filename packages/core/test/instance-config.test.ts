import { describe, expect, it } from "vitest";
import { composeProjectOf, validateConfig, ConfigError } from "../src/instance/config.js";
import { renderCompose } from "../src/docker/template.js";

const good = { instance: "tradient", penpotVersion: "2.18.3", ports: { frontend: 9002, mail: 1082 }, directory: ".penpair" };

describe("instance config", () => {
  it("accepts a good config and derives the compose project", () => {
    const config = validateConfig(good);
    expect(composeProjectOf(config)).toBe("penpair-tradient");
    expect(composeProjectOf({ ...config, composeProject: "penpot" })).toBe("penpot");
  });

  it.each([
    [{ ...good, instance: "Trading Journal" }, /instance/],
    [{ ...good, penpotVersion: "latest" }, /penpotVersion/],
    [{ ...good, ports: { frontend: 80, mail: 1082 } }, /ports.frontend/],
    [{ ...good, ports: { frontend: 9002, mail: 9002 } }, /differ/],
    [{ ...good, directory: "/etc/penpair" }, /relative/],
    [{ ...good, composeProject: "Bad Name" }, /composeProject/],
  ])("rejects %j", (value, message) => {
    expect(() => validateConfig(value)).toThrow(ConfigError);
    expect(() => validateConfig(value)).toThrow(message);
  });
});

describe("compose template", () => {
  const text = renderCompose(validateConfig(good));

  it("uses the configured ports, bound to localhost only", () => {
    expect(text).toContain('"127.0.0.1:9002:8080"');
    expect(text).toContain('"127.0.0.1:1082:1080"');
    expect(text).toContain("PENPOT_PUBLIC_URI: http://localhost:9002");
    expect(text).not.toMatch(/- "\d+:\d+"/);
  });

  it("pins every Penpot image to the configured version and keeps the database and cache off the host", () => {
    for (const image of ["frontend", "backend", "admin-console", "mcp", "exporter"]) expect(text).toContain(`penpotapp/${image}:\${PENPOT_VERSION:-2.18.3}`);
    expect(text).not.toContain("5432:");
    expect(text).not.toContain("6379:");
  });

  it("takes its secrets from the env file, turns telemetry off and keeps the MCP server on", () => {
    expect(text).toContain("${PENPOT_SECRET_KEY:?");
    expect(text).toContain("${PENPOT_DATABASE_PASSWORD:?");
    expect(text).toContain('PENPOT_TELEMETRY_ENABLED: "false"');
    expect(text).toContain("enable-mcp");
  });

  it("names no project", () => {
    expect(text.toLowerCase()).not.toMatch(/sourcer|tradient|marwes/);
  });
});
