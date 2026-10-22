import { createServer } from "node:net";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  configFileName,
  ConfigError,
  defaultInstanceName,
  ensureGitignoreEntry,
  ensureKeyFileIgnored,
  instancePaths,
  isExternal,
  loadConfig,
  testedPenpotVersion,
  validateConfig,
  type InitOptions,
  type InitResult,
  type ProjectConfig,
} from "@penpair/core";
import { generateSecrets, renderEnv, writeSecretFile } from "./secrets.js";
import { renderCompose } from "./template.js";

export async function isPortFree(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, host);
  });
}

export async function firstFreePort(
  from: number,
  avoid: number[] = [],
  free: (port: number) => Promise<boolean> = isPortFree,
): Promise<number> {
  for (let port = from; port < from + 200; port++) {
    if (!avoid.includes(port) && (await free(port))) {
      return port;
    }
  }
  throw new Error(`no free port from ${from}`);
}

const ensureGitignore = (root: string, entry: string): Promise<boolean> =>
  ensureGitignoreEntry(root, entry, {
    directory: true,
    comment: "penpair: generated compose file, secrets and backups",
  });

/**
 * Sets an instance up in a project: config (committed), then the generated compose file and secrets (in a git-ignored
 * directory). Running it again rewrites the compose file from the config; existing secrets are never replaced.
 */
export async function initDocker(root: string, options: InitOptions = {}): Promise<InitResult> {
  let config: ProjectConfig;
  let createdConfig = false;
  try {
    config = await loadConfig(root);
  } catch (error) {
    if (!(error instanceof ConfigError) || error.code !== "missing") {
      throw error;
    }
    const free = options.isFree ?? isPortFree;
    const frontend = options.port ?? (await firstFreePort(9001, [], free));
    const mail =
      options.mailPort ??
      (await firstFreePort(
        1080,
        [
          frontend,
        ],
        free,
      ));
    config = validateConfig({
      instance: options.instance ?? defaultInstanceName(root),
      penpotVersion: options.penpotVersion ?? testedPenpotVersion,
      ports: {
        frontend,
        mail,
      },
      directory: options.directory ?? ".penpair",
      ...(options.composeProject
        ? {
            composeProject: options.composeProject,
          }
        : {}),
    });
    await writeFile(path.join(root, configFileName), `${JSON.stringify(config, null, 2)}\n`);
    createdConfig = true;
  }
  if (isExternal(config)) {
    throw new ConfigError(
      "This project uses a Penpot that someone else runs; there is nothing for Docker to set up.",
    );
  }
  const paths = instancePaths(root, config);
  await mkdir(paths.directory, {
    recursive: true,
  });
  await writeFile(paths.compose, renderCompose(config));
  const files = [
    paths.compose,
  ];
  const createdSecrets = await writeSecretFile(paths.env, renderEnv(config, generateSecrets()));
  files.push(paths.env);
  let gitignoreAdded = false;
  if (options.gitignore) {
    const directoryAdded = await ensureGitignore(root, config.directory);
    gitignoreAdded = (await ensureKeyFileIgnored(root)) || directoryAdded;
  }
  return {
    config,
    createdConfig,
    createdSecrets,
    files,
    gitignoreAdded,
  };
}
