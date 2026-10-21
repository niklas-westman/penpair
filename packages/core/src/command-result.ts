import { setTimeout as wait } from "node:timers/promises";
import { AsyncLocalStorage } from "node:async_hooks";
import { redactEndpoint } from "./endpoint.js";

export interface CommandFailure { code: string; message: string; remedy: string; runId?: string }
export interface CommandResult {
  schemaVersion: 1;
  redacted?: boolean;
  command: string;
  outcome: "success" | "drift" | "failed" | "incomplete" | "uncertain" | "cancelled" | "deadline";
  phase: string;
  exitCode: number;
  target: { fileId?: string; pageId?: string } | null;
  runId: string | null;
  data: unknown;
  messages: string[];
  warnings: string[];
  errors: CommandFailure[];
  completeness: { complete: boolean; reason?: string };
  timings: { startedAt: string; durationMs: number };
}
export interface CommandOutput { log(...values: unknown[]): void; error(...values: unknown[]): void; result(value: unknown): void }
interface Capture { redacted?: boolean; authoritative?: unknown; data: unknown[]; messages: string[]; warnings: string[]; errors: CommandFailure[]; redactors: ((value: string) => string)[]; signal?: AbortSignal }
const scope = new AsyncLocalStorage<Capture>();
const line = (values: unknown[]) => values.map((value) => typeof value === "string" ? value : JSON.stringify(value)).join(" ");
export const commandOutput: CommandOutput = {
  log(...values) {
    const current = scope.getStore();
    if (!current) { console.log(...values.map(value=>renderHuman(value))); return; }
    const message = line(values);
    try { current.data.push(JSON.parse(message)); } catch { current.messages.push(message); }
  },
  error(...values) { const current = scope.getStore(); if (current) {
    const message = current.redactors.reduce((text, redact) => redact(text), redactEndpoint(line(values)));
    if (message!==line(values)) current.redacted=true;
    current.warnings.push(message); console.error(message);
  } else console.error(...values.map(value=>renderHuman(value))); },
  result(value) { const current = scope.getStore(); if (current) current.authoritative = value; },
};
export function commandRedactor(redact: (value: string) => string): void { (scope.getStore()?.redactors ?? signals.getStore()?.redactors)?.push(redact); }
export function commandFailure(error: unknown): void {
  const current = scope.getStore(); if (!current) return;
  const value = error as { code?: unknown; outcome?: unknown; message?: unknown; remedy?: unknown; runId?: unknown };
  if (current.signal?.aborted && value?.code !== "write-uncertain" && value?.outcome !== "uncertain") {
    const reason = current.signal.reason as { code?: string } | undefined;
    current.errors.push({ code: reason?.code === "deadline" ? "deadline" : "cancelled", message: reason?.code === "deadline" ? "Command deadline exceeded" : "Command cancelled", remedy: "Inspect any recorded run and current state before starting again." });
    return;
  }
  current.errors.push({ code: typeof value?.code === "string" ? value.code : typeof value?.outcome === "string" ? value.outcome : "command-failed",
    message: error instanceof Error ? error.message : String(error), remedy: typeof value?.remedy === "string" ? value.remedy : "Inspect the command result and current project state before trying again.",
    ...(typeof value?.runId === "string" ? { runId: value.runId } : {}) });
}
const signals = new AsyncLocalStorage<{signal:AbortSignal;redactors:((text:string)=>string)[]}>();
function redactHuman(text:string):string { return (signals.getStore()?.redactors??[]).reduce((value,redact)=>redact(value),redactEndpoint(text)); }
function renderHuman(value:unknown):unknown {
  const clean=(entry:unknown):unknown=>typeof entry==="string"?redactHuman(entry):Array.isArray(entry)?entry.map(clean):entry&&typeof entry==="object"?Object.fromEntries(Object.entries(entry).map(([key,child])=>[redactHuman(key),clean(child)])):entry;
  if(typeof value!=="string")return clean(value);
  try{return JSON.stringify(clean(JSON.parse(value)),null,2);}catch{return redactHuman(value);}
}
export function withCommandSignal<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> { return signals.run({signal,redactors:[]}, work); }
const cleanupSignals = new AsyncLocalStorage<AbortSignal>();
/** Bounded explicit restoration work may finish after the main command is cancelled. */
export async function withCleanupDeadline<T>(work: () => Promise<T>, milliseconds = 10000): Promise<T> {
  if (!Number.isInteger(milliseconds) || milliseconds < 1 || milliseconds > 30000) throw new Error("Cleanup deadline must be from 1 to 30000 ms");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("Restoration deadline exceeded")), milliseconds);
  try { return await cleanupSignals.run(controller.signal, work); } finally { clearTimeout(timer); }
}
export function commandSignal(): AbortSignal | undefined { return cleanupSignals.getStore() ?? scope.getStore()?.signal ?? signals.getStore()?.signal; }
export async function commandSleep(milliseconds: number): Promise<void> {
  const signal = commandSignal();
  try { await wait(milliseconds, undefined, { signal }); } catch (error) { if (signal?.aborted) throw signal.reason; throw error; }
}
export class CommandInterruptedError extends Error {
  constructor(readonly code: "cancelled" | "deadline") { super(code === "deadline" ? "Command deadline exceeded" : "Command cancelled"); }
}

/** Shared service boundary for CLI and future tool surfaces; no stdout or global console interception. */
export async function collectCommand(command: string, work: () => Promise<number>, options: { signal?: AbortSignal } = {}): Promise<CommandResult> {
  const started = Date.now();
  const capture: Capture = { data: [], messages: [], warnings: [], errors: [], redactors: [], signal: options.signal };
  let exitCode: number;
  try { exitCode = await scope.run(capture, async () => { options.signal?.throwIfAborted(); const code = await work(); options.signal?.throwIfAborted(); return code; }); }
  catch (error) { await scope.run(capture, async () => commandFailure(error)); exitCode = 1; }
  if (![0, 1, 2, 3, 4, 124, 130].includes(exitCode)) { capture.warnings.push("Unsupported extension exit code was normalized to failure"); exitCode = 1; }
  const data = capture.authoritative !== undefined ? capture.authoritative : capture.data.length === 1 ? capture.data[0] : capture.data.length ? capture.data : null;
  const record = data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : {};
  const errorCode = capture.errors[0]?.code;
  const incomplete = record.complete === false || record.truncated === true || errorCode === "incomplete-output";
  let outcome: CommandResult["outcome"] = exitCode === 0 ? "success" : exitCode === 2 ? "drift" : exitCode === 3 ? "incomplete" : exitCode === 4 ? "uncertain" : exitCode === 130 ? "cancelled" : exitCode === 124 ? "deadline" : "failed";
  if (errorCode === "write-uncertain" || errorCode === "uncertain") { outcome = "uncertain"; exitCode = 4; }
  else if (errorCode === "cancelled" || errorCode === "deadline") { outcome = errorCode; exitCode = errorCode === "cancelled" ? 130 : 124; }
  else if (incomplete) { outcome = "incomplete"; exitCode = 3; }
  if (exitCode !== 0 && !capture.errors.length && !["drift", "incomplete"].includes(outcome)) capture.errors.push({ code: "command-failed", message: "Command checks failed; inspect data and diagnostics.", remedy: "Resolve the reported checks before proceeding." });
  const identity = (record.capture ?? record.target ?? record) as { fileId?: unknown; pageId?: unknown; id?: unknown };
  const target = typeof identity.fileId === "string" ? { fileId: identity.fileId, ...(typeof identity.pageId === "string" ? { pageId: identity.pageId } : {}) } : null;
  const journal = record.journal as { runId?: unknown } | undefined;
  const sanitize = (value: unknown): unknown => {
    if (value === undefined || typeof value === "function" || typeof value === "symbol" || typeof value === "bigint" || typeof value === "number" && !Number.isFinite(value)) return null;
    if (typeof value === "string") return capture.redactors.reduce((text, redact) => redact(text), redactEndpoint(value));
    if (Array.isArray(value)) return value.map(sanitize);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, entry]) => [String(sanitize(key)), sanitize(entry)]));
    return value;
  };
  const raw={ schemaVersion: 1, command, outcome, phase: typeof record.phase === "string" ? record.phase : outcome === "uncertain" || outcome === "cancelled" || outcome === "deadline" ? "interrupted" : "finished", exitCode, target,
    runId: capture.errors.find((error) => error.runId)?.runId ?? (typeof journal?.runId === "string" ? journal.runId : null), data, messages: capture.messages, warnings: capture.warnings, errors: capture.errors,
    completeness: { complete: outcome === "success" || outcome === "drift", ...(incomplete ? { reason: "Output is truncated or required observations are missing" } : {}) }, timings: { startedAt: new Date(started).toISOString(), durationMs: Math.max(0, Date.now() - started) } };
  const result=sanitize(raw) as CommandResult;
  if (record.redacted===true || capture.redacted || JSON.stringify(result)!==JSON.stringify(raw)) {
    result.redacted=true;result.warnings.push("Sensitive or non-JSON output was redacted; hashes describe original evidence.");
    if (JSON.stringify(result.data)!==JSON.stringify(data)) {
      result.completeness={complete:false,reason:"Displayed data required redaction and is not lossless source evidence"};
      if(result.outcome==="success"||result.outcome==="drift"){result.outcome="incomplete";result.exitCode=3;}
    }
  }
  return result;
}

/** Outer transport contract. Command-specific data remains owned by the command service. */
export const commandResultSchema = {
  type: "object", additionalProperties: false,
  required: ["schemaVersion", "command", "outcome", "phase", "exitCode", "target", "runId", "data", "messages", "warnings", "errors", "completeness", "timings"],
  properties: {
    schemaVersion: { const: 1 }, redacted:{type:"boolean"}, command: { type: "string" },
    outcome: { enum: ["success", "drift", "failed", "incomplete", "uncertain", "cancelled", "deadline"] },
    phase: { type: "string" }, exitCode: { enum: [0, 1, 2, 3, 4, 124, 130] },
    target: { anyOf: [{ type: "null" }, { type: "object", properties: { fileId: { type: "string" }, pageId: { type: "string" } }, additionalProperties: false }] },
    runId: { type: ["string", "null"] }, data: {},
    messages: { type: "array", items: { type: "string" } }, warnings: { type: "array", items: { type: "string" } },
    errors: { type: "array", items: { type: "object", required: ["code", "message", "remedy"], properties: { code: { type: "string" }, message: { type: "string" }, remedy: { type: "string" }, runId: { type: "string" } }, additionalProperties: false } },
    completeness: { type: "object", required: ["complete"], properties: { complete: { type: "boolean" }, reason: { type: "string" } }, additionalProperties: false },
    timings: { type: "object", required: ["startedAt", "durationMs"], properties: { startedAt: { type: "string" }, durationMs: { type: "number", minimum: 0 } }, additionalProperties: false },
  },
} as const;
