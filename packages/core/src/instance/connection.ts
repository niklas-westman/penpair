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
  remedy?: string;
  file?: { expected: ProjectConfig["file"] | null; actual: { id?: string; name: string }; ok: boolean };
}

export function fileIdentityCheck(config: ProjectConfig, actual: { file: string; fileId?: string }): DoctorCheck {
  const ok = !config.file || config.file.id === actual.fileId;
  return { check: "file identity", ok,
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

export interface DoctorOptions {
  /** Looks for the editor tab and the plugin through the MCP. `origin` is where the endpoint points, so a key for another instance is noticed. */
  mcp?: { origin: string; connect: () => Promise<{ file: string; fileId?: string }> };
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
  let reachable = false;
  try {
    reachable = (await (options.fetch ?? fetch)(config.profile.origin, { redirect: "manual" })).status < 500;
  } catch {
    reachable = false;
  }
  add("penpot", reachable, reachable ? `${config.profile.origin} answers` : `${config.profile.origin} does not answer`, "Check the address and your network, then try again.");
  if (!options.mcp) return out;
  if (!sameOrigin(options.mcp.origin, config.profile.origin)) {
    add("editor and plugin", false, `the MCP endpoint points at ${options.mcp.origin}, which is not ${config.profile.origin}`, "Put this Penpot's MCP URL (Account, Integrations, MCP Server) in this project's .env.local as PENPAIR_MCP_URL.");
    return out;
  }
  try {
    const actual = await options.mcp.connect();
    const { file } = actual;
    add("editor and plugin", true, `connected to file "${file}"`);
    if (config.file) out.push(fileIdentityCheck(config, actual));
  } catch (error) {
    add("editor and plugin", false, String((error as Error).message).split("\n")[0] ?? "not connected", "Open a file in Penpot, choose File, MCP Server, Connect, and keep the tab visible.");
  }
  return out;
}
