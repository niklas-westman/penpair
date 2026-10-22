import { writeFile } from "node:fs/promises";
import path from "node:path";
import { requireLocalProfile, type LocalProfile } from "../local-profile.js";
import {
  configFileName,
  ConfigError,
  isExternal,
  loadConfig,
  validateProjectConfig,
  type ProjectConfig,
} from "./config.js";
import { ensureKeyFileIgnored } from "./gitignore.js";

export interface InitOptions {
  instance?: string;
  port?: number;
  mailPort?: number;
  penpotVersion?: string;
  directory?: string;
  composeProject?: string;
  /** Use a Penpot someone else runs (a team server or the hosted service) instead of starting one: its origin, such as https://design.penpot.app. */
  external?: string;
  /** Add the instance directory and the key file to .gitignore. */
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

/** A short, valid instance name from the folder's name; "design" when nothing usable is left. */
export function defaultInstanceName(root: string): string {
  const name = path
    .basename(path.resolve(root))
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^[^a-z]+/, "")
    .slice(0, 31);
  return name.length > 0 ? name : "design";
}

/**
 * Sets a project up. For Penpot on the web (`external`) it writes only the config, here. For Penpot on this computer it hands over to
 * the local profile a package provides (`@penpair/docker`), which writes the config, the compose file and the secrets.
 */
export async function init(
  root: string,
  options: InitOptions = {},
  deps: {
    local?: LocalProfile;
  } = {},
): Promise<InitResult> {
  let existing;
  try {
    existing = await loadConfig(root);
  } catch (error) {
    if (!(error instanceof ConfigError) || error.code !== "missing") {
      throw error;
    }
  }
  if (existing && isExternal(existing)) {
    return {
      config: existing,
      createdConfig: false,
      createdSecrets: false,
      files: [],
      gitignoreAdded: options.gitignore ? await ensureKeyFileIgnored(root) : false,
    };
  }
  if (!existing && options.external) {
    const config = validateProjectConfig({
      instance: options.instance ?? defaultInstanceName(root),
      profile: {
        type: "external",
        origin: options.external,
      },
    });
    await writeFile(path.join(root, configFileName), `${JSON.stringify(config, null, 2)}\n`);
    return {
      config,
      createdConfig: true,
      createdSecrets: false,
      files: [],
      gitignoreAdded: options.gitignore ? await ensureKeyFileIgnored(root) : false,
    };
  }
  return requireLocalProfile(deps.local).init(root, options);
}
