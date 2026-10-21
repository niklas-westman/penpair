import { Buffer } from "node:buffer";
import { executeCode, maxSnippetBytes, UncertainExecutionError, type ExecuteOptions, type PenpotToolClient } from "./client.js";
import { PenpairError } from "./errors.js";

/** Plugin source ready to send, with the parameters already injected. */
export interface Snippet {
  effect?: ExecuteOptions["effect"];
  name: string;
  code: string;
}

/**
 * Wraps snippet body text for the Penpot editor: the parameters arrive as `CFG`, and any error comes back as
 * `{ ok: false, message }` instead of an exception. The body returns a plain object; `ok: true` is expected.
 */
export function wrap(body: string, params: unknown = {}): string {
  return `const CFG = ${JSON.stringify(params)};\ntry {\n${body}\n} catch (error) { return { ok: false, message: String(error && error.message || error) }; }`;
}

/** Plugin code for snippets that work on one page: they say so instead of acting on whatever page is open. */
export const requirePage = `if (CFG.page && penpot.currentFile?.pages?.filter((p) => p.name === CFG.page).length > 1) return { ok:false, message:"page name is ambiguous; rename pages before selecting by name" };
if (CFG.page && penpot.currentPage.name !== CFG.page) return { ok: false, wrongPage: true, current: penpot.currentPage.name, message: "the editor shows " + penpot.currentPage.name + ", not " + CFG.page };`;

export function snippet(name: string, body: string, params: unknown = {}, effect: ExecuteOptions["effect"] = "unknown"): Snippet {
  const code = wrap(body, params);
  if (Buffer.byteLength(code, "utf8") > maxSnippetBytes)
    throw new PenpairError("snippet-too-large", `Snippet ${name} is ${Buffer.byteLength(code, "utf8")} bytes`);
  return { name, code, effect };
}

/** Whether the plugin source is valid JavaScript for an async function. Catches typos without a Penpot connection. */
export function compiles(code: string): string | undefined {
  try {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (...args: string[]) => unknown;
    new AsyncFunction("penpot", code);
    return undefined;
  } catch (error) {
    return String((error as Error).message);
  }
}

export interface SnippetResult {
  ok?: boolean;
  wrongPage?: boolean;
  message?: string;
  [key: string]: unknown;
}

/** Runs a snippet and returns its result record. A snippet that reports `ok: false` throws, except a wrong page, which the caller handles. */
export async function runSnippet(client: PenpotToolClient, s: Snippet, options?: ExecuteOptions): Promise<SnippetResult> {
  const { result, runId, metrics } = await executeCode(client, s.code, { effect: s.effect, ...options });
  const record: SnippetResult = typeof result === "object" && result !== null && !Array.isArray(result) ? (result as SnippetResult) : { value: result };
  if (record.ok === false && !record.wrongPage) {
    if ((options?.effect ?? s.effect) !== "read") throw new UncertainExecutionError(runId, `${s.name}: ${record.message ?? "failed"}`);
    throw new PenpairError("tool-failed", `${s.name}: ${record.message ?? "failed"}`);
  }
  return { ...record, execution: { runId, outcome: "ran", metrics } };
}
