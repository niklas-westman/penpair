import { commandSignal, commandSleep } from "./command-result.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { randomUUID } from "node:crypto";
import { StreamableHTTPClientTransport, StreamableHTTPError } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { redactEndpoint, type Endpoint } from "./endpoint.js";
import { PenpairError, type PenpairErrorCode } from "./errors.js";

export interface ToolOutcome {
  text: string;
  structuredContent?: unknown;
  isError: boolean;
}

/** The only Penpot surface penpair needs: one tool call at a time on an already connected editor. */
export interface ToolCallOptions { timeoutMs?: number }
export interface PenpotToolClient {
  callTool(name: string, args: Record<string, unknown>, options?: ToolCallOptions): Promise<ToolOutcome>;
  /** The names of the tools the server offers. A hosted Penpot may offer fewer than a local one. */
  listTools?(): Promise<string[]>;
  close(): Promise<void>;
}

/** Penpot's proxy refuses request bodies of about 110 KB; snippets stay under this. */
export const maxSnippetBytes = 90 * 1024;

export async function connect(endpoint: Endpoint): Promise<PenpotToolClient> {
  commandSignal()?.throwIfAborted();
  const client = new Client({ name: "penpair", version: "0" });
  const transport = new StreamableHTTPClientTransport(new URL(endpoint.url));
  try {
    await client.connect(transport, { signal: commandSignal(), timeout: 120_000 });
  } catch (error) {
    throw transportFailure(error, endpoint);
  }
  return {
    async callTool(name, args, options) {
      try {
        const result = await client.callTool({ name, arguments: args }, undefined, { timeout: options?.timeoutMs ?? 120_000, signal: commandSignal() });
        const content = Array.isArray(result.content) ? result.content : [];
        const text = content
          .flatMap((item: unknown) =>
            typeof item === "object" && item !== null && "type" in item && item.type === "text" && "text" in item
              ? [String(item.text)]
              : [],
          )
          .join("\n");
        return { text, ...(result.structuredContent !== undefined ? { structuredContent: result.structuredContent } : {}), isError: result.isError === true };
      } catch (error) {
        throw transportFailure(error, endpoint);
      }
    },
    async listTools() {
      try {
        return (await client.listTools(undefined, { signal: commandSignal(), timeout: 120_000 })).tools.map((tool) => tool.name);
      } catch (error) {
        throw transportFailure(error, endpoint);
      }
    },
    async close() {
      await client.close().catch(() => undefined);
    },
  };
}

function transportFailure(error: unknown, endpoint: Endpoint): Error {
  if (commandSignal()?.aborted) return commandSignal()!.reason as Error;
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
  /** Per-request budget; adapters/guards must forward it. */
  timeoutMs?: number;
  /** Only known read-only executions may be retried. Unclassified source is treated as a possible write. */
  effect?: "read" | "write" | "unknown";
  /** How many times to wait and retry a suspended tab. */
  retries?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  onWait?: (message: string) => void;
  /** Removes secrets from text that ends up in an error. */
  redact?: (text: string) => string;
}

export interface ExecuteResult {
  runId: string;
  outcome: "ran";
  /** What the snippet returned, parsed when it was JSON. */
  result: unknown;
  /** What the snippet printed. */
  log: string;
}

const defaultSleep = commandSleep;

export function executionEnvelope(outcome: ToolOutcome): Pick<ExecuteResult, "result" | "log"> | undefined {
  let envelope: unknown = outcome.structuredContent;
  if (envelope === undefined) {
    try { envelope = JSON.parse(outcome.text); } catch { return undefined; }
  }
  if (typeof envelope !== "object" || envelope === null || Array.isArray(envelope) || !("result" in envelope) || "log" in envelope && typeof envelope.log !== "string") return undefined;
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
 * Retries only declared reads. A lost response to any possible write leaves an uncertain outcome requiring independent inspection.
 */
export async function executeCode(
  client: PenpotToolClient,
  code: string,
  { timeoutMs = 120_000, effect = "unknown", retries: requestedRetries = 6, sleep = defaultSleep, onWait, redact = (text) => text }: ExecuteOptions = {},
): Promise<ExecuteResult> {
  commandSignal()?.throwIfAborted();
  if (Buffer.byteLength(code, "utf8") > maxSnippetBytes)
    throw new PenpairError("snippet-too-large", `The snippet is ${Buffer.byteLength(code, "utf8")} bytes`);
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) throw new Error("Execution timeout must be from 1 to 120000 ms");
  const retries = effect === "read" ? requestedRetries : 0;
  const runId = randomUUID();
  const uncertain = (message: string): PenpairError => new UncertainExecutionError(runId, redact(message));
  for (let attempt = 0; ; attempt++) {
    let outcome: ToolOutcome;
    try {
      commandSignal()?.throwIfAborted();
      outcome = await client.callTool("execute_code", { code }, { timeoutMs });
      commandSignal()?.throwIfAborted();
    } catch (error) {
      if (error instanceof PenpairError && error.code === "plugin-suspended" && attempt < retries) {
        onWait?.(`Penpot tab is suspended; bring it to the foreground (retry ${attempt + 1}/${retries})`);
        await sleep(5_000 * (attempt + 1));
        continue;
      }
      if (effect !== "read" && (!(error instanceof PenpairError) || !["file-mismatch", "snippet-too-large", "auth-rejected"].includes(error.code)))
        throw uncertain(error instanceof Error ? error.message : String(error));
      throw error;
    }
    const unpacked = executionEnvelope(outcome);
    const failed = outcome.isError || (!unpacked && /^Tool execution failed:/i.test(outcome.text.trim()));
    if (!failed && unpacked) return { ...unpacked, runId, outcome: "ran" };
    const code_ = classifyFailure(outcome.text);
    if (code_ === "plugin-suspended" && attempt < retries) {
      onWait?.(`Penpot tab is suspended; bring it to the foreground (retry ${attempt + 1}/${retries})`);
      await sleep(5_000 * (attempt + 1));
      continue;
    }
    if (effect !== "read" && code_ !== "auth-rejected") throw uncertain(outcome.text.slice(0, 500));
    throw new PenpairError(code_, redact(outcome.text).slice(0, 500));
  }
}

export class UncertainExecutionError extends PenpairError {
  readonly outcome = "uncertain";
  constructor(readonly runId: string, message: string) {
    super("write-uncertain", `Run ${runId} has an uncertain outcome: ${message}`);
  }
}
