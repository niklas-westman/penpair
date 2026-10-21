import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseClaudeServerUrl,
  parseCodexServerUrl,
  parseEnvFileValue,
  redactEndpoint,
  resolveEndpoint,
} from "../src/endpoint.js";

const url = "https://penpot.example.test/mcp/stream?userToken=secret-token";

async function home(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "penpair-endpoint-"));
}

describe("env file values", () => {
  it("reads quotes, export, comments and blank lines", () => {
    const text = `# Penpot\n\nOTHER=abc\nexport PENPAIR_MCP_URL="${url}" # mine\n`;
    expect(parseEnvFileValue(text, "PENPAIR_MCP_URL")).toBe(url);
    expect(parseEnvFileValue("PENPAIR_MCP_URL='x://y'", "PENPAIR_MCP_URL")).toBe("x://y");
    expect(parseEnvFileValue("PENPAIR_MCP_URL=http://a/b # note", "PENPAIR_MCP_URL")).toBe("http://a/b");
  });

  it("treats an empty or missing value as unset", () => {
    expect(parseEnvFileValue("PENPAIR_MCP_URL=\n", "PENPAIR_MCP_URL")).toBeUndefined();
    expect(parseEnvFileValue('PENPAIR_MCP_URL=""\n', "PENPAIR_MCP_URL")).toBeUndefined();
    expect(parseEnvFileValue("OTHER=1\n", "PENPAIR_MCP_URL")).toBeUndefined();
  });
});

describe("agent configuration", () => {
  it("reads the named server from the Codex table and the Claude Code user scope", () => {
    expect(parseCodexServerUrl('[mcp_servers.penpot]\nurl = "http://a/mcp"\n[mcp_servers.other]\nurl = "http://b"')).toBe("http://a/mcp");
    expect(parseCodexServerUrl('[mcp_servers.other]\nurl = "http://b"')).toBeUndefined();
    expect(parseClaudeServerUrl(JSON.stringify({ mcpServers: { penpot: { url: "http://c/mcp" } } }))).toBe("http://c/mcp");
    expect(parseClaudeServerUrl(JSON.stringify({ mcpServers: { penpot: { url: "http://c/mcp" } } }), "design")).toBeUndefined();
  });
});

describe("resolving the endpoint", () => {
  it("prefers the environment, then an env file, then the agent configurations, and never reports the URL", async () => {
    const dir = await home();
    const file = path.join(dir, ".env.local");
    await writeFile(file, `PENPAIR_MCP_URL=${url}\n`);
    await mkdir(path.join(dir, ".codex"));
    await writeFile(path.join(dir, ".codex/config.toml"), '[mcp_servers.penpot]\nurl = "http://codex:1/mcp"\n');

    const fromEnv = await resolveEndpoint({ environment: { PENPAIR_MCP_URL: "http://env:1/mcp" }, home: dir, envFiles: [file] });
    expect(fromEnv.description.source).toBe("env");
    const fromFile = await resolveEndpoint({ environment: {}, home: dir, envFiles: [file] });
    expect(fromFile.description).toEqual({ source: "env-file", origin: "https://penpot.example.test", pathname: "/mcp/stream" });
    expect(JSON.stringify(fromFile.description)).not.toContain("secret-token");
    const fromCodex = await resolveEndpoint({ environment: {}, home: dir, envFiles: [] });
    expect(fromCodex.description.source).toBe("codex-config");
  });

  it("lets a project add its own variable name", async () => {
    const dir = await home();
    const found = await resolveEndpoint({ environment: { MY_PENPOT: "http://mine:1/mcp" }, home: dir, variableNames: ["PENPAIR_MCP_URL", "MY_PENPOT"] });
    expect(found.description.origin).toBe("http://mine:1");
  });

  it("is isolated from the real working directory when given its own environment", async () => {
    await expect(resolveEndpoint({ environment: {}, home: await home() })).rejects.toMatchObject({ code: "endpoint-unconfigured" });
  });

  it("rejects an endpoint that is not an http or https URL", async () => {
    await expect(resolveEndpoint({ environment: { PENPAIR_MCP_URL: "ftp://x" }, home: await home() })).rejects.toMatchObject({ code: "endpoint-invalid" });
    await expect(resolveEndpoint({ environment: { PENPAIR_MCP_URL: "nonsense" }, home: await home() })).rejects.toMatchObject({ code: "endpoint-invalid" });
  });
});

describe("redaction", () => {
  it("removes the URL, its query and any userToken", async () => {
    const endpoint = await resolveEndpoint({ environment: { PENPAIR_MCP_URL: url }, home: await home() });
    const text = `failed at ${url} with userToken=abc123 and ?userToken=secret-token and bare key secret-token`;
    const clean = redactEndpoint(text, endpoint);
    expect(clean).not.toContain("secret-token");
    expect(clean).not.toContain("abc123");
  });
});
