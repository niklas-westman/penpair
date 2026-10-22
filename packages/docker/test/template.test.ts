import { describe, expect, it } from "vitest";
import { validateConfig } from "@penpair/core";
import { renderCompose } from "../src/template.js";

const good = {
  instance: "tradient",
  penpotVersion: "2.18.3",
  ports: {
    frontend: 9002,
    mail: 1082,
  },
  directory: ".penpair",
};

describe("compose template", () => {
  const text = renderCompose(validateConfig(good));

  it("uses the configured ports, bound to localhost only", () => {
    expect(text).toContain('"127.0.0.1:9002:8080"');
    expect(text).toContain('"127.0.0.1:1082:1080"');
    expect(text).toContain("PENPOT_PUBLIC_URI: http://localhost:9002");
    expect(text).not.toMatch(/- "\d+:\d+"/);
  });

  it("pins every Penpot image to the configured version and keeps the database and cache off the host", () => {
    for (const image of [
      "frontend",
      "backend",
      "admin-console",
      "mcp",
      "exporter",
    ]) {
      expect(text).toContain(`penpotapp/${image}:\${PENPOT_VERSION:-2.18.3}`);
    }
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
