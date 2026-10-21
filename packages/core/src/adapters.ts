import type { BuildKit } from "./kit.js";
import { resolveProjectInput } from "./project-input.js";
import type { CommandOutput } from "./command-result.js";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { PenpotToolClient } from "./client.js";
import { readProjectConfig, type ProjectConfig } from "./instance/config.js";

/**
 * An adapter is a package that teaches penpair about one library or tool (a component library's tokens, a checker) by adding
 * commands. A project lists the adapters it uses under `adapters` in penpair.config.json; the core loads them by name from the
 * project and knows nothing about any of them. An adapter keeps its own settings in its own block of the same file.
 */
export interface AdapterContext {
  output?: CommandOutput;
  /** Removes this connection's credentials before recovery evidence is persisted or reported. */
  redact?(text: string): string;
  /** The project's folder. */
  root: string;
  /** The project's validated configuration. */
  config: ProjectConfig;
  /** The whole penpair.config.json as written, for the adapter's own block. */
  rawConfig: Record<string, unknown>;
  log(message: string): void;
  /**
   * Connects to the project's Penpot and runs `work` with the connection, closing it afterwards. The endpoint must belong to this
   * project's Penpot, as for every command. Not called by commands that work offline.
   */
  withPenpot<T>(work: (client: PenpotToolClient) => Promise<T>): Promise<T>;
}

export interface AdapterCommand {
  /** The word after `penpair`, for example `hello`. It must not be a command the core already has. */
  name: string;
  /** One line for `penpair --help`. */
  summary: string;
  /** Lines of usage for `penpair --help`. */
  usage: string[];
  /** Runs with the arguments after the command's name; returns the exit code. The adapter parses its own flags. */
  run(context: AdapterContext, args: string[]): Promise<number>;
}

export interface Adapter {
  name: string;
  commands: AdapterCommand[];
  /** Explicit opt-in plugin-source includes. Built-in commands do not load these unless requested. */
  kits?: BuildKit[];
}

/** Declares an adapter. Returns the definition unchanged, so a module can `export default defineAdapter({...})` with types checked. */
export const defineAdapter = <T extends Adapter>(adapter: T): T => adapter;

/** The commands of the core itself; an adapter cannot take one of these names. */
export const reservedCommands = [
  "snapshot", "approve", "mcp", "spec", "inspect", "probe", "pages", "tree", "audit", "tokens", "export", "shots", "archive", "snippets", "run", "run-file", "kit", "recipes", "skills", "init", "setup", "connect",
  "up", "down", "status", "doctor", "backup", "restore", "baselines", "config", "runs", "onboard", "help",
] as const;

export interface LoadedAdapters {
  adapters: Adapter[];
  problems: string[];
}

export type AdapterImporter = (specifier: string, root: string) => Promise<unknown>;

/** Resolves an adapter the way the project would: a relative path from the project's folder, or a package installed in the project. */
export const importFromProject: AdapterImporter = async (specifier, root) => {
  let file: string;
  if (specifier.startsWith(".") || path.isAbsolute(specifier)) file = await resolveProjectInput(root, specifier);
  else {
    if (!/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+(?:\/[a-z0-9._-]+)*$/i.test(specifier) || specifier.split("/").includes("..")) throw new Error("Adapter must name an installed package or a relative project module");
    try {
      file = createRequire(path.join(root, "package.json")).resolve(specifier);
    } catch {
      const error = Object.assign(new Error(`${specifier} is not installed in this project`), { code: "ERR_MODULE_NOT_FOUND" });
      throw error;
    }
  }
  return import(pathToFileURL(file).href);
};

export async function loadAdapters(root: string, specifiers: string[] | undefined, importer: AdapterImporter = importFromProject): Promise<LoadedAdapters> {
  const adapters: Adapter[] = [];
  const problems: string[] = [];
  const taken = new Map<string, string>();
  for (const specifier of specifiers ?? []) {
    let loaded: { default?: Adapter };
    try {
      loaded = (await importer(specifier, root)) as { default?: Adapter };
    } catch (error) {
      const code = (error as { code?: string }).code;
      problems.push(
        code === "ERR_MODULE_NOT_FOUND" || code === "MODULE_NOT_FOUND"
          ? `adapter ${specifier} is not installed in this project. Install it (for example \`npm i -D ${specifier}\`).`
          : `adapter ${specifier} could not be loaded: ${String((error as Error).message).split("\n")[0]}`,
      );
      continue;
    }
    const adapter = loaded.default;
    if (!adapter || typeof adapter.name !== "string" || !Array.isArray(adapter.commands)) {
      problems.push(`adapter ${specifier} does not export a default adapter (use \`export default defineAdapter({...})\`)`);
      continue;
    }
    for (const command of adapter.commands) {
      if ((reservedCommands as readonly string[]).includes(command.name)) problems.push(`adapter ${specifier}: the command "${command.name}" is one the core already has`);
      else if (taken.has(command.name)) problems.push(`adapter ${specifier}: the command "${command.name}" is already provided by ${taken.get(command.name)}`);
      else taken.set(command.name, adapter.name);
    }
    adapters.push({ ...adapter, commands: adapter.commands.filter((c) => taken.get(c.name) === adapter.name) });
  }
  return { adapters, problems };
}

/** The whole penpair.config.json as written (an adapter's own settings live in it). Empty when there is no file. */
export async function readRawConfig(root: string): Promise<Record<string, unknown>> {
  return await readProjectConfig(root) ?? {};
}


