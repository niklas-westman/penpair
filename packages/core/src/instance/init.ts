import { createServer } from "node:net";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { configFileName, instancePaths, isExternal, loadConfig, testedPenpotVersion, validateConfig, validateProjectConfig, ConfigError, type InstanceConfig, type ProjectConfig } from "./config.js";
import { generateSecrets, renderEnv, writeSecretFile } from "../docker/secrets.js";
import { renderCompose } from "../docker/template.js";
import { ensureGitignoreEntry, ensureKeyFileIgnored } from "./gitignore.js";

export async function isPortFree(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, host);
  });
}

export async function firstFreePort(from: number, avoid: number[] = [], free: (port: number) => Promise<boolean> = isPortFree): Promise<number> {
  for (let port = from; port < from + 200; port++) if (!avoid.includes(port) && (await free(port))) return port;
  throw new Error(`no free port from ${from}`);
}

function defaultInstanceName(root: string): string {
  const name = path.basename(path.resolve(root)).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^[^a-z]+/, "").slice(0, 31);
  return name.length > 0 ? name : "design";
}

export interface InitOptions {
  instance?: string;
  port?: number;
  mailPort?: number;
  penpotVersion?: string;
  directory?: string;
  composeProject?: string;
  /** Use a Penpot someone else runs (a team server or the hosted service) instead of starting one: its origin, such as https://design.penpot.app. */
  external?: string;
  /** Add the instance directory to .gitignore. */
  gitignore?: boolean;
  isFree?: (port: number) => Promise<boolean>;
}

export interface InitResult {
  config: ProjectConfig;
  createdConfig: boolean;
  createdSecrets: boolean;
  files: string[];
  gitignoreAdded: boolean;
}

const ensureGitignore = (root: string, entry: string): Promise<boolean> => ensureGitignoreEntry(root, entry, { directory: true, comment: "penpair: generated compose file, secrets and backups" });

/**
 * Sets an instance up in a project: config (committed), then the generated compose file and secrets (in a git-ignored
 * directory). Running it again rewrites the compose file from the config; existing secrets are never replaced.
 */
export async function init(root: string, options: InitOptions = {}): Promise<InitResult> {
  let config: ProjectConfig;
  let createdConfig = false;
  try {
    config = await loadConfig(root);
  } catch (error) {
    if (!(error instanceof ConfigError) || !/No penpair\.config\.json/.test(error.message)) throw error;
    if (options.external) {
      config = validateProjectConfig({ instance: options.instance ?? defaultInstanceName(root), profile: { type: "external", origin: options.external } });
      await writeFile(path.join(root, configFileName), `${JSON.stringify(config, null, 2)}\n`);
      return { config, createdConfig: true, createdSecrets: false, files: [], gitignoreAdded: options.gitignore ? await ensureKeyFileIgnored(root) : false };
    }
    const free = options.isFree ?? isPortFree;
    const frontend = options.port ?? (await firstFreePort(9001, [], free));
    const mail = options.mailPort ?? (await firstFreePort(1080, [frontend], free));
    config = validateConfig({
      instance: options.instance ?? defaultInstanceName(root),
      penpotVersion: options.penpotVersion ?? testedPenpotVersion,
      ports: { frontend, mail },
      directory: options.directory ?? ".penpair",
      ...(options.composeProject ? { composeProject: options.composeProject } : {}),
    });
    await writeFile(path.join(root, configFileName), `${JSON.stringify(config, null, 2)}\n`);
    createdConfig = true;
  }
  if (isExternal(config)) return { config, createdConfig, createdSecrets: false, files: [], gitignoreAdded: options.gitignore ? await ensureKeyFileIgnored(root) : false };
  const paths = instancePaths(root, config);
  await mkdir(paths.directory, { recursive: true });
  await writeFile(paths.compose, renderCompose(config));
  const files = [paths.compose];
  const createdSecrets = await writeSecretFile(paths.env, renderEnv(config, generateSecrets()));
  files.push(paths.env);
  let gitignoreAdded = false;
  if (options.gitignore) {
    const directoryAdded = await ensureGitignore(root, config.directory);
    gitignoreAdded = (await ensureKeyFileIgnored(root)) || directoryAdded;
  }
  return { config, createdConfig, createdSecrets, files, gitignoreAdded };
}
