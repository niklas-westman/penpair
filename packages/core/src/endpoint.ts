import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PenpairError } from "./errors.js";

export type EndpointSource = "env" | "env-file" | "codex-config" | "claude-config";

// What a report may say about the connection. The URL itself carries the user's MCP key and is never persisted.
export interface EndpointDescription {
  source: EndpointSource;
  origin: string;
  pathname: string;
}

export interface Endpoint {
  url: string;
  description: EndpointDescription;
}

export const defaultVariableNames = ["PENPAIR_MCP_URL"];

export interface ResolveOptions {
  /** Defaults to the process environment. */
  environment?: NodeJS.ProcessEnv;
  home?: string;
  /** Git-ignored env files to read after the environment. Defaults to `.env.local` in the working directory, and only for the real process environment. */
  envFiles?: string[];
  /** Names tried in order in the environment and in the env files. A project may add its own name here. */
  variableNames?: string[];
  /** The MCP server name looked up in the Codex and Claude Code configuration. */
  serverName?: string;
  /** Long-lived project tools may disable unrelated global client configuration fallback. */
  globalConfig?: boolean;
}

function describe(url: string, source: EndpointSource): Endpoint {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new PenpairError("endpoint-invalid", `The ${source} Penpot endpoint is not a valid URL`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
    throw new PenpairError("endpoint-invalid", `The ${source} Penpot endpoint must use http or https`);
  return { url, description: { source, origin: parsed.origin, pathname: parsed.pathname } };
}

async function readOptional(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, "utf8");
  } catch {
    // An unreadable file is treated as absent; the error would otherwise expose a local path layout.
    return undefined;
  }
}

/** Reads one `NAME=value` line from env-file text: optional `export`, optional quotes, `#` comments; an empty value counts as unset. */
export function parseEnvFileValue(text: string, name: string): string | undefined {
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match || match[1] !== name) continue;
    let value = (match[2] ?? "").trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.length > 1) {
      const end = value.indexOf(quote, 1);
      value = end === -1 ? value.slice(1) : value.slice(1, end);
    } else value = value.replace(/\s+#.*$/, "");
    return value.length > 0 ? value : undefined;
  }
  return undefined;
}

/** Reads `url` from the `[mcp_servers.<name>]` table only; no general TOML parsing is attempted. */
export function parseCodexServerUrl(toml: string, serverName = "penpot"): string | undefined {
  let inServer = false;
  const escaped = serverName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const header = new RegExp(`^\\[\\s*mcp_servers\\s*\\.\\s*(?:"${escaped}"|${escaped})\\s*\\]$`);
  for (const rawLine of toml.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith("[")) {
      inServer = header.test(line);
      continue;
    }
    if (!inServer) continue;
    const match = /^url\s*=\s*(?:"((?:[^"\\]|\\.)*)"|'([^']*)')\s*(?:#.*)?$/.exec(line);
    if (match) return (match[1] ?? match[2])?.replace(/\\(["\\])/g, "$1");
  }
  return undefined;
}

/** Reads the user-scope `mcpServers.<name>.url` entry written by `claude mcp add --scope user`. */
export function parseClaudeServerUrl(json: string, serverName = "penpot"): string | undefined {
  try {
    const value: unknown = JSON.parse(json);
    if (typeof value !== "object" || value === null || !("mcpServers" in value)) return undefined;
    const servers = value.mcpServers;
    if (typeof servers !== "object" || servers === null || !(serverName in servers)) return undefined;
    const server = (servers as Record<string, unknown>)[serverName];
    if (typeof server !== "object" || server === null || !("url" in server) || typeof server.url !== "string")
      return undefined;
    return server.url;
  } catch {
    return undefined;
  }
}

/**
 * Order: the process environment, then a git-ignored .env.local, then the agent configurations (read-only fallbacks), so the
 * CLI behaves the same whichever agent or person launches it. The env files are read only for the real process
 * environment, so a test that passes its own environment stays isolated.
 */
export async function resolveEndpoint(options: ResolveOptions = {}): Promise<Endpoint> {
  const environment = options.environment ?? process.env;
  const home = options.home ?? os.homedir();
  const names = options.variableNames ?? defaultVariableNames;
  const envFiles = options.envFiles ?? (environment === process.env ? [path.join(process.cwd(), ".env.local")] : []);
  const serverName = options.serverName ?? "penpot";

  for (const name of names) {
    const explicit = environment[name]?.trim();
    if (explicit) return describe(explicit, "env");
  }
  for (const file of envFiles) {
    const text = await readOptional(file);
    if (text === undefined) continue;
    for (const name of names) {
      const fromFile = parseEnvFileValue(text, name);
      if (fromFile) return describe(fromFile, "env-file");
    }
  }
  if (options.globalConfig === false) throw new PenpairError("endpoint-unconfigured", "No project Penpot endpoint in the environment or configured project env file; global client fallback is disabled");
  const codex = await readOptional(path.join(home, ".codex/config.toml"));
  const fromCodex = codex === undefined ? undefined : parseCodexServerUrl(codex, serverName);
  if (fromCodex) return describe(fromCodex, "codex-config");
  const claude = await readOptional(path.join(home, ".claude.json"));
  const fromClaude = claude === undefined ? undefined : parseClaudeServerUrl(claude, serverName);
  if (fromClaude) return describe(fromClaude, "claude-config");
  throw new PenpairError(
    "endpoint-unconfigured",
    `No Penpot MCP endpoint: ${names.join(" or ")} is unset (environment and .env.local) and no '${serverName}' MCP server is configured for Codex or Claude Code`,
  );
}

/** Removes the endpoint URL, its query string and any userToken parameter from text that may be persisted. */
export function redactEndpoint(text: string, endpoint?: Endpoint): string {
  let redacted = text;
  if (endpoint) {
    const parsed = new URL(endpoint.url);
    const key = parsed.searchParams.get("userToken") ?? "";
    for (const secret of [endpoint.url, parsed.search, parsed.search.slice(1), key, encodeURIComponent(key)].filter((value) => value.length > 1))
      redacted = redacted.split(secret).join("[redacted]");
  }
  return redacted.replace(/userToken=[^\s&"'<>]+/gi, "userToken=[redacted]");
}

/** Known endpoint redaction with optional boundary fragments for serialized inspection chunks. */
export function endpointRedactor(endpoint: Endpoint, fragments = false): (text: string) => string {
  const key = new URL(endpoint.url).searchParams.get("userToken") ?? "";
  const variants = [...new Set([key, encodeURIComponent(key), JSON.stringify(key).slice(1,-1)])].filter(value=>value.length>1);
  return (text) => {
    let clean=redactEndpoint(text,endpoint);
    if (fragments) for (const value of variants) {
      const minimum=Math.min(8,Math.ceil(value.length/2));
      for(let size=value.length-1;size>=minimum;size--){
        const prefix=value.slice(0,size),suffix=value.slice(-size);
        if(clean.endsWith(prefix))clean=clean.slice(0,-prefix.length)+"[redacted]";
        if(clean.startsWith(suffix))clean="[redacted]"+clean.slice(suffix.length);
      }
    }
    return clean;
  };
}
