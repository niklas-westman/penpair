import { ConfigError, isExternal, loadConfig, requireLocal, type ProjectConfig } from "./config.js";
import { connectProject, penpotAddress, type ConnectIo, type ConnectResult, type WaitOptions } from "./connect.js";
import { init } from "./init.js";
import { requireLocalProfile, type LocalContext, type LocalProfile } from "../local-profile.js";
import type { Runner } from "./runner.js";

export const hostedOrigin = "https://design.penpot.app";

export type SetupWhere = { type: "web"; origin: string } | { type: "docker" };

export interface SetupIo extends ConnectIo {
  /** One line of free text, with a default taken on an empty answer. */
  ask(question: string, fallback: string): Promise<string>;
  /** Best effort: opens the address in the browser. */
  openBrowser(url: string): Promise<void>;
}

export interface SetupOptions {
  /** Given on the command line (`--web [origin]`, `--docker`); otherwise asked, and the web is the default. */
  where?: SetupWhere;
  instance?: string;
  port?: number;
  wait?: WaitOptions;
  /** Install the assistant's rules at the end without asking. */
  installSkills?: () => Promise<void>;
  runner: Runner;
  /** A way to run Penpot on this computer, from a package that provides one; only used when that is chosen. */
  local?: LocalProfile;
  log?: (message: string) => void;
}

export interface SetupResult {
  config: ProjectConfig;
  connect: ConnectResult;
}

async function chooseWhere(io: SetupIo, hasLocal: boolean): Promise<SetupWhere> {
  io.say("Where is your Penpot?");
  io.say("  1  On the web: design.penpot.app (free account) or your team's own Penpot. Nothing to install. (recommended)");
  io.say(hasLocal ? "  2  On this computer, in Docker. Works offline; needs Docker Desktop and a 2 GB download." : "  2  On this computer, in Docker. Needs the @penpair/docker package, which this install does not include.");
  const answer = (await io.ask("Press Enter for 1, or type 2: ", "1")).trim();
  if (answer === "2") return { type: "docker" };
  const origin = (await io.ask(`Penpot address (Enter for ${hostedOrigin}): `, hostedOrigin)).trim();
  return { type: "web", origin };
}

/**
 * One guided path from nothing to "the assistant can read my Penpot file": choose where Penpot is, write the config, start
 * Penpot when it is on this computer, take the personal key without showing it, wait for the browser's editor and plugin, read
 * the file once. Every step says what it is doing in plain words, and it is safe to run again.
 */
export async function setup(root: string, io: SetupIo, options: SetupOptions): Promise<SetupResult> {
  let config: ProjectConfig | undefined;
  try {
    config = await loadConfig(root);
    io.say(`This folder is already set up for ${isExternal(config) ? `Penpot at ${config.profile.origin}` : `Penpot on this computer (port ${config.ports.frontend})`}. Continuing from there.`);
  } catch (error) {
    if (!(error instanceof ConfigError) || error.code !== "missing") throw error;
  }
  if (!config) {
    const where = options.where ?? (await chooseWhere(io, Boolean(options.local)));
    const made = await init(root, { gitignore: true, instance: options.instance, port: options.port, ...(where.type === "web" ? { external: where.origin } : {}) }, { local: options.local });
    config = made.config;
    io.say(`Wrote penpair.config.json (${where.type === "web" ? `Penpot at ${where.origin}` : "Penpot on this computer"}). Commit that file; it holds no secrets.`);
  }
  if (!isExternal(config)) {
    const local = requireLocalProfile(options.local);
    await local.preflight(options.runner);
    const c: LocalContext = { root, config: requireLocal(config), runner: options.runner, log: options.log ?? (() => undefined) };
    io.say("Starting Penpot. The first time it downloads about 2 GB and can take several minutes.");
    const started = await local.up(c);
    if (!started.ready) throw new ConfigError(`Penpot started but ${started.url} does not answer yet. Wait a minute and run \`penpair setup\` again.`);
    io.say("Penpot is running. Create your account on its start page (no email confirmation is needed), then create a design file.");
  } else io.say("In Penpot: log in, then create a project and a design file for this work if you have none.");
  await io.openBrowser(penpotAddress(config)).catch(() => undefined);
  const connect = await connectProject(root, config, io, { wait: options.wait });
  io.say("Everything answers. Last: the rules your assistant follows.");
  if (options.installSkills) await options.installSkills();
  io.say("Done. Try `penpair pages`, or tell your assistant to read the penpair-design skill and start.");
  return { config, connect };
}
