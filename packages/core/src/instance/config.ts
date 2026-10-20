import { readFile } from "node:fs/promises";
import path from "node:path";
import { validateBaselines, type BaselinesConfig } from "../baselines-config.js";

/** What a project keeps in `penpair.config.json`: no secrets, so it can be committed. */
export interface InstanceConfig {
  /** Short name; it becomes part of the compose project, so containers and volumes of two instances never collide. */
  instance: string;
  /** Pinned Penpot image version. Run the smoke test before changing it. */
  penpotVersion: string;
  ports: { frontend: number; mail: number };
  /** Directory for the generated compose file, the secrets and the backups. Keep it out of git. */
  directory: string;
  /** Overrides the compose project name, to adopt volumes created earlier under another name. */
  composeProject?: string;
  /** Files or folders (relative to the project) with the project's own snippets: modules that `export default defineSnippet({...})`. */
  snippets?: string[];
  /** Frames of a page to export as approved reference images for a check (see `penpair baselines`). */
  baselines?: BaselinesConfig;
  /** Packages (or relative paths) that add commands for a library or tool; each keeps its own settings in its own block of this file. */
  adapters?: string[];
}

/** A project that uses a Penpot someone else runs (a team server or the hosted service): no Docker here, only the connection. */
export interface ExternalConfig {
  instance: string;
  profile: { type: "external"; origin: string };
  snippets?: string[];
  baselines?: BaselinesConfig;
  adapters?: string[];
}

export type ProjectConfig = InstanceConfig | ExternalConfig;

export const isExternal = (config: ProjectConfig): config is ExternalConfig => "profile" in config && (config as ExternalConfig).profile?.type === "external";

export const configFileName = "penpair.config.json";
export const testedPenpotVersion = "2.18.3";

export class ConfigError extends Error {}

export function composeProjectOf(config: InstanceConfig): string {
  return config.composeProject ?? `penpair-${config.instance}`;
}

export function validateConfig(value: unknown): InstanceConfig {
  const fail = (message: string): never => {
    throw new ConfigError(`${configFileName}: ${message}`);
  };
  if (typeof value !== "object" || value === null) return fail("must be a JSON object");
  const v = value as Record<string, unknown>;
  if (typeof v.instance !== "string" || !/^[a-z][a-z0-9-]{0,30}$/.test(v.instance))
    fail("instance must be lowercase letters, digits and hyphens, starting with a letter (at most 31 characters)");
  if (typeof v.penpotVersion !== "string" || !/^\d+\.\d+(\.\d+)?$/.test(v.penpotVersion)) fail("penpotVersion must look like 2.18.3");
  const ports = v.ports as Record<string, unknown> | undefined;
  for (const key of ["frontend", "mail"] as const) {
    const port = ports?.[key];
    if (typeof port !== "number" || !Number.isInteger(port) || port < 1024 || port > 65535) fail(`ports.${key} must be a port number from 1024 to 65535`);
  }
  if (ports!.frontend === ports!.mail) fail("ports.frontend and ports.mail must differ");
  if (typeof v.directory !== "string" || v.directory.length === 0 || path.isAbsolute(v.directory)) fail("directory must be a relative path");
  if (v.composeProject !== undefined && (typeof v.composeProject !== "string" || !/^[a-z0-9][a-z0-9_-]*$/.test(v.composeProject))) fail("composeProject must be a valid compose project name");
  if (v.snippets !== undefined) {
    const ok = Array.isArray(v.snippets) && v.snippets.every((entry) => typeof entry === "string" && entry.length > 0 && !path.isAbsolute(entry) && !entry.split(/[\\/]/).includes(".."));
    if (!ok) fail("snippets must be a list of relative paths that stay inside the project");
  }
  if (v.baselines !== undefined) validateBaselines(v.baselines, fail);
  if (v.adapters !== undefined && !(Array.isArray(v.adapters) && v.adapters.every((e) => typeof e === "string" && e.length > 0))) fail("adapters must be a list of package names or relative paths");
  return v as unknown as InstanceConfig;
}

const instanceNamePattern = /^[a-z][a-z0-9-]{0,30}$/;

/** Accepts either kind of project config: a local Docker instance or an external Penpot. */
export function validateProjectConfig(value: unknown): ProjectConfig {
  const profile = typeof value === "object" && value !== null ? (value as { profile?: { type?: unknown } }).profile : undefined;
  if (profile?.type !== "external") return validateConfig(value);
  const v = value as Record<string, unknown>;
  const fail = (message: string): never => {
    throw new ConfigError(`${configFileName}: ${message}`);
  };
  if (typeof v.instance !== "string" || !instanceNamePattern.test(v.instance)) fail("instance must be lowercase letters, digits and hyphens, starting with a letter");
  const origin = (v.profile as { origin?: unknown }).origin;
  let parsed: URL | undefined;
  try {
    parsed = typeof origin === "string" ? new URL(origin) : undefined;
  } catch {
    parsed = undefined;
  }
  if (!parsed || !["http:", "https:"].includes(parsed.protocol) || parsed.origin !== origin) fail("profile.origin must be an http or https origin such as https://design.penpot.app (no path)");
  if (v.snippets !== undefined && !(Array.isArray(v.snippets) && v.snippets.every((entry) => typeof entry === "string" && entry.length > 0 && !path.isAbsolute(entry) && !entry.split(/[\\/]/).includes("..")))) fail("snippets must be a list of relative paths that stay inside the project");
  if (v.baselines !== undefined) validateBaselines(v.baselines, fail);
  if (v.adapters !== undefined && !(Array.isArray(v.adapters) && v.adapters.every((e) => typeof e === "string" && e.length > 0))) fail("adapters must be a list of package names or relative paths");
  return v as unknown as ExternalConfig;
}

/** The config of a project that runs its own Penpot; anything else cannot start, stop or back up containers. */
export function requireLocal(config: ProjectConfig): InstanceConfig {
  if (isExternal(config))
    throw new ConfigError(`This project uses a Penpot that someone else runs (${config.profile.origin}). \`up\`, \`down\`, \`status\`, \`backup\` and \`restore\` only apply to a Penpot that penpair starts for you; use Penpot's own version history and export for this one.`);
  return config;
}

export async function loadConfig(root: string): Promise<ProjectConfig> {
  let text: string;
  try {
    text = await readFile(path.join(root, configFileName), "utf8");
  } catch {
    throw new ConfigError(`No ${configFileName} here. Run \`penpair init\` first.`);
  }
  try {
    return validateProjectConfig(JSON.parse(text));
  } catch (error) {
    if (error instanceof ConfigError) throw error;
    throw new ConfigError(`${configFileName} is not valid JSON`);
  }
}

export const instancePaths = (root: string, config: InstanceConfig) => {
  const directory = path.join(root, config.directory);
  return {
    directory,
    compose: path.join(directory, "docker-compose.yaml"),
    env: path.join(directory, ".env"),
    backups: path.join(directory, "backups"),
  };
};
