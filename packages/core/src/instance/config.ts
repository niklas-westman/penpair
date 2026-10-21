import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { validateBaselines, type BaselinesConfig } from "../baselines-config.js";

/** What a project keeps in `penpair.config.json`: no secrets, so it can be committed. */
export interface ProjectFile { id: string; name?: string }
export interface BackupReminder { noteFile: string; remindAfterDays: number }

export interface InstanceConfig {
  schemaVersion?: 1;
  file?: ProjectFile;
  backup?: BackupReminder;
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
  schemaVersion?: 1;
  file?: ProjectFile;
  backup?: BackupReminder;
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

export class ConfigError extends Error {
  constructor(message: string, readonly code: "missing" | "unreadable" | "invalid-json" | "invalid-config" = "invalid-config") {
    super(message);
  }
}

export function composeProjectOf(config: InstanceConfig): string {
  return config.composeProject ?? `penpair-${config.instance}`;
}

function validateSchemaVersion(value: unknown): void {
 if (value && typeof value === "object" && "schemaVersion" in value && value.schemaVersion !== 1) throw new ConfigError("Unsupported project config schemaVersion; legacy/unversioned and v1 are supported. Use the producer's documented migration for another major version.");
}
export function validateConfig(value: unknown): InstanceConfig {
  validateSchemaVersion(value);
  const fail = (message: string): never => {
    throw new ConfigError(`${configFileName}: ${message}`);
  };
  if (typeof value !== "object" || value === null || Array.isArray(value)) return fail("must be a JSON object");
  const v = value as Record<string, unknown>;
  validateFile(v.file);
  validateBackup(v.backup);
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
  validateSchemaVersion(value);
  const profile = typeof value === "object" && value !== null ? (value as { profile?: { type?: unknown } }).profile : undefined;
  if (profile === undefined) return validateConfig(value);
  if (typeof profile !== "object" || profile === null || Array.isArray(profile) || profile.type !== "external")
    throw new ConfigError(`${configFileName}: profile.type must be external; omit profile for an instance on this computer`);
  const v = value as Record<string, unknown>;
  validateFile(v.file);
  validateBackup(v.backup);
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

function validateFile(value: unknown): void {
  if (value === undefined) return;
  const file = value as ProjectFile;
  if (typeof file !== "object" || file === null || Array.isArray(file) || typeof file.id !== "string" || !file.id.trim() || (file.name !== undefined && typeof file.name !== "string"))
    throw new ConfigError(`${configFileName}: file must have a nonempty id and an optional name`);
}

function validateBackup(value: unknown): void {
  if (value === undefined) return;
  const backup = value as BackupReminder;
  if (!backup || typeof backup !== "object" || Array.isArray(backup) || typeof backup.noteFile !== "string" || !backup.noteFile || path.isAbsolute(backup.noteFile) || backup.noteFile.split(/[\\/]/).includes("..") || !Number.isSafeInteger(backup.remindAfterDays) || backup.remindAfterDays <= 0)
    throw new ConfigError(`${configFileName}: backup needs an in-project relative noteFile and positive integer remindAfterDays`);
}

/** The config of a project that runs its own Penpot; anything else cannot start, stop or back up containers. */
export function requireLocal(config: ProjectConfig): InstanceConfig {
  if (isExternal(config))
    throw new ConfigError(`This project uses a Penpot that someone else runs (${config.profile.origin}). \`up\`, \`down\`, \`status\`, \`backup\` and \`restore\` only apply to a Penpot that penpair starts for you; use Penpot's own version history and export for this one.`);
  return config;
}

/** Missing is optional; unreadable, malformed or invalid project files always stop the caller. */
export async function readProjectConfig(root: string): Promise<Record<string, unknown> | undefined> {
  let text: string;
  try {
    text = await readFile(path.join(root, configFileName), "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      try {
        await lstat(path.join(root, configFileName));
      } catch (statError) {
        if ((statError as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      }
    }
    throw new ConfigError(`Cannot read ${configFileName}${code ? ` (${code})` : ""}. Check that it is a readable file and fix its permissions.`, "unreadable");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ConfigError(`${configFileName} is not valid JSON. Fix its JSON syntax, then run \`penpair config check\`.`, "invalid-json");
  }
  validateProjectConfig(parsed);
  return parsed as Record<string, unknown>;
}

export async function loadOptionalConfig(root: string): Promise<ProjectConfig | undefined> {
  const raw = await readProjectConfig(root);
  return raw === undefined ? undefined : validateProjectConfig(raw);
}

export async function loadConfig(root: string): Promise<ProjectConfig> {
  const config = await loadOptionalConfig(root);
  if (config === undefined) throw new ConfigError(`No ${configFileName} here. Run \`penpair init\` first. For config-free inspection, use a read command with --standalone.`, "missing");
  return config;
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
