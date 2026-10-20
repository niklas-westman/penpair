import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport, StreamableHTTPError } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { redactEndpoint, type Endpoint } from "./endpoint.js";
import { PenpairError, type PenpairErrorCode } from "./errors.js";

export interface ToolOutcome {
  text: string;
  isError: boolean;
}

/** The only Penpot surface penpair needs: one tool call at a time on an already connected editor. */
export interface PenpotToolClient {
  callTool(name: string, args: Record<string, unknown>): Promise<ToolOutcome>;
  /** The names of the tools the server offers. A hosted Penpot may offer fewer than a local one. */
  listTools?(): Promise<string[]>;
  close(): Promise<void>;
}

/** Penpot's proxy refuses request bodies of about 110 KB; snippets stay under this. */
export const maxSnippetBytes = 90 * 1024;

export async function connect(endpoint: Endpoint): Promise<PenpotToolClient> {
  const client = new Client({ name: "penpair", version: "0" });
  const transport = new StreamableHTTPClientTransport(new URL(endpoint.url));
  try {
    await client.connect(transport);
  } catch (error) {
    throw transportFailure(error, endpoint);
  }
  return {
    async callTool(name, args) {
      try {
        const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 120_000 });
        const content = Array.isArray(result.content) ? result.content : [];
        const text = content
          .flatMap((item: unknown) =>
            typeof item === "object" && item !== null && "type" in item && item.type === "text" && "text" in item
              ? [String(item.text)]
              : [],
          )
          .join("\n");
        return { text, isError: result.isError === true };
      } catch (error) {
        throw transportFailure(error, endpoint);
      }
    },
    async listTools() {
      try {
        return (await client.listTools()).tools.map((tool) => tool.name);
      } catch (error) {
        throw transportFailure(error, endpoint);
      }
    },
    async close() {
      await client.close().catch(() => undefined);
    },
  };
}

function transportFailure(error: unknown, endpoint: Endpoint): PenpairError {
  const raw = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const message = redactEndpoint(raw, endpoint);
  if (error instanceof StreamableHTTPError && (error.code === 401 || error.code === 403))
    return new PenpairError("auth-rejected", message);
  const code = classifyFailure(message);
  return new PenpairError(code === "tool-failed" ? "mcp-unavailable" : code, message);
}

/** Maps Penpot MCP failure text to a distinct code so each failure gets its own remedy. */
export function classifyFailure(text: string): PenpairErrorCode {
  if (/suspended|no heartbeat/i.test(text)) return "plugin-suspended";
  if (/not connected|no (?:penpot )?plugin|no client|plugin (?:is )?(?:not|disconnected)|connect the plugin/i.test(text))
    return "plugin-disconnected";
  if (/401|403|unauthori[sz]ed|forbidden|invalid (?:user)?token/i.test(text)) return "auth-rejected";
  if (/ECONNREFUSED|ENOTFOUND|fetch failed|EHOSTUNREACH|socket hang up|ECONNRESET|timed? ?out/i.test(text))
    return "mcp-unavailable";
  return "tool-failed";
}

export interface ExecuteOptions {
  /** How many times to wait and retry a suspended tab. */
  retries?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  onWait?: (message: string) => void;
  /** Removes secrets from text that ends up in an error. */
  redact?: (text: string) => string;
}

export interface ExecuteResult {
  /** What the snippet returned, parsed when it was JSON. */
  result: unknown;
  /** What the snippet printed. */
  log: string;
}

const defaultSleep = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds));

function unpack(text: string): ExecuteResult | undefined {
  let envelope: unknown;
  try {
    envelope = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (typeof envelope !== "object" || envelope === null || !("result" in envelope)) return undefined;
  const log = "log" in envelope && typeof envelope.log === "string" ? envelope.log : "";
  const raw = envelope.result;
  if (typeof raw !== "string") return { result: raw, log };
  try {
    return { result: JSON.parse(raw) as unknown, log };
  } catch {
    return { result: raw, log };
  }
}

/**
 * Runs a snippet inside the connected Penpot editor. A suspended tab is waited out and retried, because the snippet may
 * already have run; the caller reads the page before repeating a write.
 */
export async function executeCode(
  client: PenpotToolClient,
  code: string,
  { retries = 6, sleep = defaultSleep, onWait, redact = (text) => text }: ExecuteOptions = {},
): Promise<ExecuteResult> {
  if (Buffer.byteLength(code, "utf8") > maxSnippetBytes)
    throw new PenpairError("snippet-too-large", `The snippet is ${Buffer.byteLength(code, "utf8")} bytes`);
  for (let attempt = 0; ; attempt++) {
    let outcome: ToolOutcome;
    try {
      outcome = await client.callTool("execute_code", { code });
    } catch (error) {
      if (error instanceof PenpairError && error.code === "plugin-suspended" && attempt < retries) {
        onWait?.(`Penpot tab is suspended; bring it to the foreground (retry ${attempt + 1}/${retries})`);
        await sleep(5_000 * (attempt + 1));
        continue;
      }
      throw error;
    }
    const unpacked = unpack(outcome.text);
    const failed = outcome.isError || (!unpacked && /^Tool execution failed:/i.test(outcome.text.trim()));
    if (!failed && unpacked) return unpacked;
    const code_ = classifyFailure(outcome.text);
    if (code_ === "plugin-suspended" && attempt < retries) {
      onWait?.(`Penpot tab is suspended; bring it to the foreground (retry ${attempt + 1}/${retries})`);
      await sleep(5_000 * (attempt + 1));
      continue;
    }
    throw new PenpairError(code_, redact(outcome.text).slice(0, 500));
  }
}
