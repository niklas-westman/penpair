import { ConfigError, type InstanceConfig } from "./instance/config.js";
import type { InitOptions, InitResult } from "./instance/init.js";
import type { Check, DoctorCheck, DoctorOptions } from "./instance/connection.js";
import type { Runner } from "./instance/runner.js";

/**
 * Another package can add a way to run Penpot on this computer (`@penpair/docker` does). It depends on this one, never the other way
 * round: it starts the command line with its implementation of `LocalProfile`, and this file is the whole contract. Without one, the
 * commands that run Penpot locally say where they come from.
 */

/** What an action on a local instance needs to know about the project. Injectable so it can be tested without the real thing. */
export interface LocalContext {
  root: string;
  config: InstanceConfig;
  runner: Runner;
  log?: (message: string) => void;
  sleep?: (milliseconds: number) => Promise<void>;
  fetch?: typeof fetch;
  now?: () => Date;
}

export interface ServiceState {
  service: string;
  state: string;
  health: string;
}

export interface Counts {
  files: number;
  profiles: number;
  teams: number;
  storageObjects: number;
  fileRevisions: {
    id: string;
    name: string;
    revn: number;
  }[];
}

export interface BackupManifest {
  instance: string;
  penpotVersion: string;
  createdAt: string;
  label?: string;
  files: {
    db: {
      name: string;
      sha256: string;
      bytes: number;
    };
    assets: {
      name: string;
      sha256: string;
      bytes: number;
    };
  };
  counts: Counts;
  note: string;
}

export interface RestoreOptions {
  /** Restoring replaces the instance's data; it only runs when this is true. */
  yes: boolean;
  /** Skip the safety backup of the current data. */
  skipSafetyBackup?: boolean;
}

export interface LocalProfile {
  /** Throws a plain-language ConfigError when what the instance runs on is not available (for example, Docker is not running). */
  preflight(runner: Runner): Promise<void>;
  /** Writes the config when missing, the compose file and the secrets (never replaced). */
  init(root: string, options: InitOptions): Promise<InitResult>;
  up(c: LocalContext): Promise<{
    url: string;
    ready: boolean;
  }>;
  down(c: LocalContext): Promise<void>;
  status(c: LocalContext): Promise<{
    services: ServiceState[];
    frontendReachable: boolean;
    backendReady: boolean;
    url: string;
  }>;
  doctor(c: LocalContext, options?: DoctorOptions): Promise<DoctorCheck[]>;
  backup(
    c: LocalContext,
    label?: string,
  ): Promise<{
    directory: string;
    manifest: BackupManifest;
  }>;
  verifyBackup(
    c: LocalContext,
    directory: string,
  ): Promise<{
    ok: boolean;
    checks: Check[];
  }>;
  restore(
    c: LocalContext,
    directory: string,
    options: RestoreOptions,
  ): Promise<{
    ok: boolean;
    checks: Check[];
    safetyBackup?: string;
  }>;
}

/** The commands that run Penpot on this computer exist only when a package provides a profile for them. */
export const needsLocalProfile =
  "Running Penpot on this computer is not part of this install. It comes with `@penpair/docker`: install it with `npm i -D @penpair/docker` and run `npx penpair …` (or, once, `npx @penpair/docker <command>`). Penpot on the web needs nothing extra.";

export function requireLocalProfile(local: LocalProfile | undefined): LocalProfile {
  if (!local) {
    throw new ConfigError(needsLocalProfile);
  }
  return local;
}
