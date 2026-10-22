import { randomUUID } from "node:crypto";
import { commandSignal, withCommandSignal } from "../command-result.js";
import { redactEndpoint } from "../endpoint.js";
import { isExternal, type ExternalConfig, type InstanceConfig, type ProjectConfig } from "./config.js";

/** What Penpot itself, the connection and the checks need, whichever way Penpot is run. Nothing here knows about Docker. */
export class LifecycleError extends Error {}

export interface Check {
  check: string;
  ok: boolean;
  detail: string;
}

export const frontendUrl = (config: InstanceConfig): string => `http://127.0.0.1:${config.ports.frontend}`;

export interface DoctorCheck extends Check {
  warning?: boolean;
  layer?: "origin" | "transport" | "execution" | "file-pin";
  observedAt?: string;
  durationMs?: number;
  evidence?: { challenge?: string; pageId?: string; apiVersion?: string; heartbeat?: "unknown" };
  remedy?: string;
  file?: { expected: ProjectConfig["file"] | null; actual: { id?: string; name: string }; ok: boolean };
}

export function fileIdentityCheck(config: ProjectConfig, actual: { file: string; fileId?: string }): DoctorCheck {
  const ok = !config.file || config.file.id === actual.fileId;
  return { check: "file identity", ok, layer: "file-pin", observedAt: new Date().toISOString(),
    detail: config.file ? `expected ${config.file.name ?? config.file.id} (${config.file.id}); connected ${actual.file} (${actual.fileId ?? "unknown id"})` : "No file ID pinned; run penpair connect --pin-file",
    ...(!ok ? { remedy: "Open the project's expected design file and reconnect its MCP plugin." } : {}),
    file: { expected: config.file ?? null, actual: { id: actual.fileId, name: actual.file }, ok },
  };
}

/**
 * A command that acts on a Penpot file must act on this project's instance. A key left in the agent's global configuration
 * (or any other key) can point at a different instance and silently drive the wrong file, so a mismatch is refused.
 */
export function assertEndpointIsInstance(endpoint: { source: string; origin: string }, config: ProjectConfig): void {
  if (isExternal(config)) {
    if (sameOrigin(endpoint.origin, config.profile.origin)) return;
    throw new LifecycleError(
      `The MCP endpoint (from ${endpoint.source}) points at ${endpoint.origin}, but this project uses ${config.profile.origin}. ` +
        "Put that Penpot's MCP URL (Account, Integrations, MCP Server) in this project's .env.local as PENPAIR_MCP_URL, or run again with --any-instance if the other one is what you mean.",
    );
  }
  if (endpointIsInstance(endpoint.origin, config)) return;
  throw new LifecycleError(
    `The MCP endpoint (from ${endpoint.source}) points at ${endpoint.origin}, but this project's instance is ${frontendUrl(config)}. ` +
      "Put this instance's MCP URL (Account, Integrations, MCP Server) in this project's .env.local as PENPAIR_MCP_URL, or run again with --any-instance if the other instance is what you mean.",
  );
}

const sameOrigin = (a: string, b: string): boolean => {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
};

export interface DoctorObservation { file: string; fileId?: string; pageId?: string; challenge?: string; apiVersion?: string }
export interface DoctorProbeRequest { challenge: string; signal: AbortSignal; timeoutMs: number; onTransport: () => void }
export interface DoctorOptions {
 timeoutMs?: number;
 mcp?: { origin: string; connect: (request?: DoctorProbeRequest) => Promise<DoctorObservation> };
}

/** Readiness is a bounded fresh execution, separate from a reachable origin and connected transport. */
export async function doctorEditor(config: ProjectConfig, options: DoctorOptions): Promise<DoctorCheck[]> {
 if (!options.mcp) return [];
 const started = Date.now(), out: DoctorCheck[] = [], challenge = randomUUID();
 const timeoutMs = options.timeoutMs ?? 5000;
 let connected = false;
 const transport = (): void => { if (!connected) { connected = true; out.push({ check: "MCP transport", layer: "transport", ok: true, detail: "Connected to MCP transport", observedAt: new Date().toISOString(), durationMs: Date.now() - started }); } };
 try {
  const actual = await doctorDeadline(timeoutMs, signal => options.mcp!.connect({ challenge, signal, timeoutMs, onTransport: transport }));
  if (!connected) throw new Error("MCP transport readiness was not independently observed");
  if (actual.challenge !== challenge || !actual.fileId || !actual.pageId || !actual.file || actual.file === "?") throw new Error("Fresh execution challenge or file/page identity did not match; editor readiness is unproven");
  out.push({ check: "editor and plugin", layer: "execution", ok: true, detail: `Fresh read from file "${actual.file}"`, observedAt: new Date().toISOString(), durationMs: Date.now() - started, evidence: { challenge, pageId: actual.pageId, ...(actual.apiVersion ? { apiVersion: actual.apiVersion } : {}), heartbeat: "unknown" } });
  out.push(fileIdentityCheck(config, actual));
 } catch (error) {
  if (!connected) out.push({ check: "MCP transport", layer: "transport", ok: false, detail: "Transport connection not confirmed", observedAt: new Date().toISOString(), durationMs: Date.now() - started });
  out.push({ check: "editor and plugin", layer: "execution", ok: false, detail: redactEndpoint(error instanceof Error ? error.message : String(error)), observedAt: new Date().toISOString(), durationMs: Date.now() - started, remedy: "Open the intended file, connect the MCP plugin and keep the editor responsive; rerun doctor for a fresh read." });
 }
 return out;
}

async function doctorDeadline<T>(timeoutMs: number, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
 if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw new Error("Invalid doctor budget");
 const controller = new AbortController();
 const signal = AbortSignal.any([controller.signal, ...(commandSignal() ? [commandSignal()!] : [])]);
 let timer: ReturnType<typeof setTimeout> | undefined;
 const interrupted = new Promise<never>((_resolve, reject) => {
  const abort = () => reject(signal.reason);
  signal.addEventListener("abort", abort, { once: true });
  timer = setTimeout(() => controller.abort(new Error("Doctor deadline exceeded; no fresh editor execution was confirmed")), timeoutMs);
 });
 try { signal.throwIfAborted(); return await withCommandSignal(signal, () => Promise.race([work(signal), interrupted])); }
 finally { if (timer) clearTimeout(timer); }
}

/** Whether a configured MCP origin is this instance's frontend. */
export function endpointIsInstance(origin: string, config: InstanceConfig): boolean {
  try {
    const url = new URL(origin);
    return ["localhost", "127.0.0.1"].includes(url.hostname) && Number(url.port || (url.protocol === "https:" ? 443 : 80)) === config.ports.frontend;
  } catch {
    return false;
  }
}

/** The checks that make sense for a Penpot someone else runs: it answers, the key is for it, the editor and plugin are connected. */
export async function doctorExternal(config: ExternalConfig, options: DoctorOptions & { fetch?: typeof fetch } = {}): Promise<DoctorCheck[]> {
  const out: DoctorCheck[] = [];
  const add = (check: string, ok: boolean, detail: string, remedy?: string): void => void out.push({ check, ok, detail, ...(remedy && !ok ? { remedy } : {}) });
  const started = Date.now(), timeoutMs = options.timeoutMs ?? 5000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30000) throw new Error("doctor --timeout-ms must be an integer from 1000 to 30000");
  let reachable = false;
  try { reachable = (await doctorDeadline(timeoutMs, signal => (options.fetch ?? fetch)(config.profile.origin, { redirect: "manual", signal }))).status < 500; } catch { reachable = false; }
  add("penpot", reachable, reachable ? `${config.profile.origin} answers` : `${config.profile.origin} does not answer`, "Check the address and your network, then try again.");
  Object.assign(out[0]!, { layer: "origin", observedAt: new Date().toISOString(), durationMs: Date.now() - started });
  if (!options.mcp) return out;
  if (!sameOrigin(options.mcp.origin, config.profile.origin)) {
    add("editor and plugin", false, `the MCP endpoint points at ${options.mcp.origin}, which is not ${config.profile.origin}`, "Configure this project's intended Penpot endpoint.");
    return out;
  }
  const remaining = timeoutMs - (Date.now() - started);
  if (remaining <= 0) { add("editor and plugin", false, "Doctor deadline exhausted during origin check; execution unproven"); return out; }
  out.push(...await doctorEditor(config, { ...options, timeoutMs: remaining }));
  return out;
}
