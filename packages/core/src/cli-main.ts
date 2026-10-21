import { writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { connect, executeCode } from "./client.js";
import { redactEndpoint, resolveEndpoint } from "./endpoint.js";
import { PenpairError } from "./errors.js";
import { exportShapePng } from "./export.js";
import { exportBaselines } from "./baselines.js";
import { archiveOperation, runOnPage, runOperation } from "./operation.js";
import { formatDeepReport, runDeepCheck } from "./deep-check.js";
import { probe } from "./probe.js";
import { installSkills, listBundledSkills } from "./skills.js";
import { checkProjectSnippets, loadProjectSnippets } from "./project-snippets.js";
import { builtInRegistry, coerceParams, RegistryError, type SnippetRegistry } from "./registry.js";
import { runSnippet } from "./snippet.js";
import { audit, pages, tokensDump, tree } from "./snippets/read.js";
import { diffEffective, effectiveValues, type TokenDump } from "./tokens-diff.js";
import { ConfigError, isExternal, loadConfig, loadOptionalConfig, requireLocal } from "./instance/config.js";
import { projectConfigSchema } from "./instance/config-schema.js";
import { init } from "./instance/init.js";
import { ConnectError, connectProject, keyFileCheck, type ConnectIo } from "./instance/connect.js";
import { hostedOrigin, setup, type SetupWhere } from "./instance/setup.js";
import { askHidden, askLine, openInBrowser } from "./instance/tty.js";
import { loadAdapters, readRawConfig, reservedCommands, type Adapter, type AdapterContext } from "./adapters.js";
import { requireLocalProfile, type LocalContext, type LocalProfile } from "./local-profile.js";
import { assertEndpointIsInstance, doctorExternal, LifecycleError, type DoctorCheck } from "./instance/connection.js";
import { nodeRunner } from "./instance/runner.js";
import { version } from "./version.js";
import { guardFile } from "./file-guard.js";
import { exportFileArchive } from "./file-archive.js";
import { backupNoteCheck } from "./backup-note.js";
import { createCheckpoint } from "./native-api.js";
import { listJournals, readJournal } from "./journal.js";

const usageHead = `penpair ${version}
Start here (guided, plain language; safe to run again):
  penpair setup                                        asks where your Penpot is (web is the default), sets everything up and checks it
  penpair setup --web [--external <address>]           Penpot on the web: design.penpot.app, or your team's address; no questions about it
@@SETUP@@  penpair connect [--replace]                          only the connection: takes your personal key without showing it, waits for the editor
                                                       (a pipe works too: pbpaste | penpair connect)
  penpair connect --pin-file                           pin the connected design file ID in project configuration
  (--any-file explicitly overrides a pinned file; instance guarding still applies)
Read-only:
  penpair config check [--json]                        validate project configuration offline, without loading extensions
  penpair config schema                               print its JSON Schema (also works while fixing invalid config)
  (without a project config, built-in inspection requires --standalone; writes require a project)
  penpair probe [--integrity]                          APIs and limits; optionally validate file integrity when supported
  penpair probe --deep --write                         also tries layout, tokens, components, swap, clone and export on a temporary
                                                       board it removes again (it touches the open file, so --write is required)
  (in a project with an instance every command below acts on that instance only; --any-instance overrides)
  penpair pages                                        the file, its revision, pages and their sizes
  penpair tree --page <name> [--depth 3] [--prefix <text>]
  penpair audit --page <name> --prefix <frame name start> [--steps 0,2,4,8] [--ignore <name starts>]
  penpair tokens dump                                  token sets and themes as JSON
  penpair tokens diff <before.json> <after.json> --theme <name>
  penpair export <shapeId> <out.png> [--page <name>] [--scale 1]
  penpair backup file <new.penpot>                     try a bounded full-file export, without replacing an existing archive
@@INSTANCE@@Skills (the rules an AI agent follows, shipped with penpair):
  penpair skills                                       list them
  penpair skills install [--to <folder>] [--only <name>] [--force]   copy them into the project and make them discoverable
Snippets (the built-in ones and the project's own, listed under "snippets" in penpair.config.json):
  penpair snippets                                     what can be run, with its parameters
  penpair snippets check                               validate the project's snippets without a connection
  penpair run <name> [--param key=value ...] [--apply] run one; a snippet that changes things only looks unless --apply
Hand a page's design to a check (Reflection or any image comparison):
  penpair baselines [--apply] [--update]               export the frames listed under "baselines" in penpair.config.json as approved images,
                                                       a manifest and ready-made Reflection cases. Looks first; --apply writes new images;
                                                       --update also replaces images whose design changed (approving the new design)
Changes in a Penpot file (inspect first; nothing is written without --apply):
  penpair runs [run-id]                                list recovery runs or inspect one, offline
  (write commands support --resume <run-id> --apply and optional --checkpoint)
  penpair archive --page <name> --name <archive board> --keep <prefixes> --parts <prefixes> [--x 9000] [--apply]
  penpair --version`;

const usageLocalInstance = `An instance on this computer (one Penpot per project, configured in penpair.config.json):
  penpair init [--instance <name>] [--port 9001] [--gitignore]   set up the config, the compose file and the secrets
  penpair up | down | status                           start, stop (data stays) and look at the containers
  penpair backup                                       database and assets, with checksums and counts
  penpair backup verify <dir>                          restore into a throwaway database and compare
  penpair restore <dir> --yes                          replace the instance's data with a backup (safety backup first)
`;
const usageNoLocalInstance = `Penpot on this computer is not part of this install; it comes with the package @penpair/docker.
`;
const usageConnection = `Connecting to a Penpot (one project, configured in penpair.config.json):
  penpair init --external <origin>                     use a Penpot someone else runs (a team server or https://design.penpot.app)
  penpair doctor [--json]                              what is up, what is not, and what to do about it (--json for scripts and agents)
`;

const usage = (hasLocal: boolean, adapters: Adapter[] = []): string =>
  usageHead.replace("@@INSTANCE@@", usageConnection + (hasLocal ? usageLocalInstance : usageNoLocalInstance)).replace("@@SETUP@@", hasLocal ? "  penpair setup --docker                               Penpot on this computer in Docker\n" : "") + adapterUsage(adapters);

/** The commands that adapters from penpair.config.json add, after the core's own. */
const adapterUsage = (adapters: Adapter[]): string =>
  adapters.length === 0 ? "" : `\nAdapters (listed under "adapters" in penpair.config.json):\n${adapters.flatMap((a) => a.commands.flatMap((c) => c.usage.map((line) => `  ${line}`))).join("\n")}\n`;

const list = (value: string | undefined): string[] => (value ?? "").split(",").map((v) => v.trim()).filter(Boolean);

export interface CliOptions {
  /** Adapters already loaded (the command loads the project's own from penpair.config.json). */
  adapters?: Adapter[];
  /** A way to run Penpot on this computer, from a package that provides one (`@penpair/docker`). Without it those commands explain where they come from. */
  local?: LocalProfile;
}

async function main(argv: string[], cli: CliOptions): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      page: { type: "string" },
      depth: { type: "string" },
      prefix: { type: "string" },
      steps: { type: "string" },
      ignore: { type: "string" },
      theme: { type: "string" },
      scale: { type: "string" },
      name: { type: "string" },
      keep: { type: "string" },
      parts: { type: "string" },
      x: { type: "string" },
      apply: { type: "boolean" },
      instance: { type: "string" },
      external: { type: "string" },
      port: { type: "string" },
      gitignore: { type: "boolean" },
      yes: { type: "boolean" },
      "any-instance": { type: "boolean" },
      "any-file": { type: "boolean" },
      "pin-file": { type: "boolean" },
      standalone: { type: "boolean" },
      web: { type: "boolean" },
      docker: { type: "boolean" },
      replace: { type: "boolean" },
      update: { type: "boolean" },
      json: { type: "boolean" },
      deep: { type: "boolean" },
      integrity: { type: "boolean" },
      resume: { type: "string" },
      checkpoint: { type: "boolean" },
      force: { type: "boolean" },
      to: { type: "string" },
      only: { type: "string", multiple: true },
      write: { type: "boolean" },
      param: { type: "string", multiple: true },
      version: { type: "boolean" },
      help: { type: "boolean" },
    },
  });
  const [command, ...rest] = positionals;
  if ((values.resume || values.checkpoint) && (!values.apply || !["archive", "run"].includes(command ?? "")))
    throw new Error("--resume and --checkpoint require an operation command (archive/run) with --apply");
  if (values.version) {
    console.log(version);
    return 0;
  }
  if (!command || values.help) {
    console.log(usage(Boolean(cli.local), cli.adapters));
    return 0;
  }

  if (command === "tokens" && rest[0] === "diff") {
    const [, beforeFile, afterFile] = rest;
    if (!beforeFile || !afterFile || !values.theme) throw new Error("usage: penpair tokens diff <before.json> <after.json> --theme <name>");
    const load = async (file: string): Promise<TokenDump> => JSON.parse(await readFile(file, "utf8")) as TokenDump;
    const diff = diffEffective(effectiveValues(await load(beforeFile), values.theme), effectiveValues(await load(afterFile), values.theme));
    console.log(JSON.stringify(diff, null, 2));
    return diff.added.length + diff.removed.length + diff.changed.length === 0 ? 0 : 2;
  }

  const root = process.cwd();
  const log = (message: string): void => console.error(`… ${message}`);
  if (values.standalone) {
    const inspection = ["pages", "tree", "audit", "export"].includes(command!) || (command === "probe" && !values.deep) || (command === "tokens" && rest[0] === "dump");
    if (await loadOptionalConfig(root) || !inspection || values.apply || values.write)
      throw new ConfigError("--standalone is only for built-in inspection commands in a folder without penpair.config.json. It cannot bypass a project or run writes/snippets.");
  }

  /** What `doctor` needs to look for the editor and plugin, or nothing when no endpoint is set yet. */
  async function mcpProbeFor(): Promise<{ origin: string; connect: () => Promise<{ file: string; fileId?: string }> } | undefined> {
    try {
      const endpoint = await resolveEndpoint();
      return {
        origin: endpoint.description.origin,
        connect: async () => {
          const client = await connect(endpoint);
          try {
            const { result } = await executeCode(client, "return { file: penpot.currentFile.name, fileId: penpot.currentFile.id };", { retries: 0, effect: "read" });
            const actual = result as { file?: string; fileId?: string };
            return { file: String(actual.file ?? "?"), fileId: actual.fileId };
          } finally {
            await client.close();
          }
        },
      };
    } catch {
      return undefined;
    }
  }

  async function registryFor(): Promise<{ registry: SnippetRegistry; problems: string[]; files: string[] }> {
    const registry = builtInRegistry();
    const snippets = (await loadOptionalConfig(root))?.snippets;
    const report = await loadProjectSnippets(root, snippets, registry);
    return { registry, problems: report.problems, files: report.files };
  }

  const connectIo = (): ConnectIo => ({
    say: (line) => console.log(line),
    askHidden,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    confirmFile: async (file) => values["pin-file"] === true || /^(y|yes)$/i.test(await askLine(`Pin this project's file to "${file.name}" (${file.id})? [y/N] `, "n")),
    openFile: async (url) => {
      const endpoint = await resolveEndpoint({ environment: { PENPAIR_MCP_URL: url }, envFiles: [] });
      try {
        const client = await connect(endpoint);
        try {
          const { result } = await executeCode(client, "return { file: penpot.currentFile.name, fileId: penpot.currentFile.id, pages: penpot.currentFile.pages.map((p) => p.name) };", { retries: 0, effect: "read" });
          const read = result as { file?: string; fileId?: string; pages?: string[] };
          return { file: String(read.file ?? "?"), fileId: read.fileId, pages: read.pages ?? [] };
        } finally {
          await client.close();
        }
      } catch (error) {
        throw new Error(redactEndpoint(String((error as Error).message ?? error), endpoint));
      }
    },
  });

  if (command === "setup" || command === "connect") {
    if (command === "connect") {
      const project = await loadConfig(root);
      await connectProject(root, project, connectIo(), { replace: values.replace === true, anyFile: values["any-file"] === true });
      console.log("Next: `penpair doctor`, then `penpair skills install` if you have not yet.");
      return 0;
    }
    let where: SetupWhere | undefined;
    if (values.docker) where = { type: "docker" };
    else if (values.web || values.external) where = { type: "web", origin: values.external ?? hostedOrigin };
    await setup(
      root,
      { ...connectIo(), ask: (question, fallback) => askLine(question, fallback), openBrowser: openInBrowser },
      {
        where,
        instance: values.instance,
        port: values.port ? Number(values.port) : undefined,
        runner: nodeRunner,
        log,
        local: cli.local,
        installSkills: async () => {
          const report = await installSkills({ root });
          console.log(`Installed ${report.installed.length} rule file(s) in ${report.to}/ (${report.unchanged.length} already there). Add these rows to your AGENTS.md skills table:\n${report.agentsRows.join("\n")}`);
        },
      },
    );
    return 0;
  }

  if (command === "skills") {
    if (rest[0] === "install") {
      const report = await installSkills({ root, to: values.to, only: values.only, force: values.force });
      for (const file of report.installed) console.log(`wrote     ${file}`);
      for (const file of report.kept) console.log(`kept      ${file} (differs from the shipped one; --force replaces it, except the project-owned files)`);
      for (const link of report.linked) console.log(`linked    ${link}`);
      console.log(`${report.unchanged.length} file(s) already up to date`);
      console.log("\nAdd to your AGENTS.md skills table:\n" + report.agentsRows.join("\n"));
      for (const old of report.legacy) console.log(`\nnote ${old.folder} is the old name of ${old.renamedTo}. ${old.carriedFacts ? "Your project-facts.md was copied to the new folder. " : ""}Delete the old folder and its links (.agents/skills/${path.posix.basename(old.folder)}, .claude/skills/${path.posix.basename(old.folder)}) and update its row in your AGENTS.md.`);
      console.log("\nThen fill in references/project-facts.md in penpair-design: it is yours and is never replaced.");
      return 0;
    }
    for (const name of await listBundledSkills()) console.log(name);
    return 0;
  }

  if (command === "snippets") {
    const { registry, problems, files } = await registryFor();
    if (rest[0] === "check") {
      const found = [...problems, ...checkProjectSnippets(registry)];
      const project = registry.list().filter((entry) => entry.source === "project");
      console.log(`${project.length} project snippet(s) from ${files.length} file(s)`);
      for (const problem of found) console.log(`FAIL ${problem}`);
      if (found.length === 0) console.log("ok   every snippet is valid plugin code and small enough");
      return found.length === 0 ? 0 : 1;
    }
    for (const entry of registry.list()) {
      console.log(`${entry.name.padEnd(14)} ${entry.kind === "write" ? "changes " : "reads   "} ${entry.source === "project" ? "[project] " : ""}${entry.description}`);
      for (const p of entry.params) console.log(`${"".padEnd(14)}   --param ${p.name}=<${p.type}>${p.required ? " (required)" : p.default !== undefined ? ` (default ${JSON.stringify(p.default)})` : ""}${p.description ? ` ${p.description}` : ""}`);
    }
    for (const problem of problems) console.error(`warning: ${problem}`);
    return 0;
  }
  if (command === "init") {
    const result = await init(root, { instance: values.instance, port: values.port ? Number(values.port) : undefined, gitignore: values.gitignore, external: values.external }, { local: cli.local });
    if (isExternal(result.config)) {
      console.log(`${result.createdConfig ? "created" : "kept"} penpair.config.json (external Penpot at ${result.config.profile.origin})`);
      console.log("next: in Penpot switch on Account, Integrations, MCP Server and copy the address; open a design file and choose File, MCP Server, Connect; then run penpair connect (takes the address without showing it)");
      return 0;
    }
    console.log(`${result.createdConfig ? "created" : "kept"} penpair.config.json (instance ${result.config.instance}, Penpot ${result.config.penpotVersion}, port ${result.config.ports.frontend})`);
    console.log(`wrote ${result.config.directory}/docker-compose.yaml; secrets ${result.createdSecrets ? "generated" : "kept"} in ${result.config.directory}/.env`);
    if (!result.gitignoreAdded) console.log(`keep ${result.config.directory}/ out of git (add it to .gitignore, or run init with --gitignore)`);
    console.log("next: penpair up, then penpair connect");
    return 0;
  }
  /** Prints the checks one per line, or as JSON for scripts and agents. The key file check is added to both kinds of project. */
  async function report(checks: DoctorCheck[], mcp: unknown): Promise<number> {
    const keyCheck = await keyFileCheck(root, nodeRunner);
    const backupCheck = await backupNoteCheck(root, await loadConfig(root));
    const all: DoctorCheck[] = [...checks, ...(keyCheck ? [keyCheck] : []), ...(backupCheck ? [backupCheck] : [])];
    const ok = all.every((check) => check.ok);
    if (values.json) {
      console.log(JSON.stringify({ ok, mcpConfigured: Boolean(mcp), file: all.find((check) => check.file)?.file, checks: all }, null, 2));
      return ok ? 0 : 1;
    }
    for (const check of all) console.log(`${check.warning ? "WARN" : check.ok ? "ok  " : "FAIL"} ${check.check}: ${check.detail}${"remedy" in check && check.remedy ? `\n       → ${check.remedy}` : ""}`);
    if (!mcp) console.log("skip editor and plugin: no key yet. Run `penpair connect`.");
    return ok ? 0 : 1;
  }
  const lifecycle = new Set(["up", "down", "status", "doctor", "backup", "restore"]);
  if (lifecycle.has(command) && !(command === "backup" && rest[0] === "file")) {
    const project = await loadConfig(root);
    if (isExternal(project) && command !== "doctor") requireLocal(project);
    if (isExternal(project)) {
      const mcp = await mcpProbeFor();
      return report(await doctorExternal(project, { mcp }), mcp);
    }
    const local = requireLocalProfile(cli.local);
    const c: LocalContext = { root, config: requireLocal(project), runner: nodeRunner, log };
    if (command === "up") {
      const result = await local.up(c);
      console.log(result.ready ? `Penpot is up at ${result.url}. Create an account and open a file, then run \`penpair connect\`.` : `The containers started but ${result.url} does not answer yet. Run \`penpair status\`.`);
      return result.ready ? 0 : 1;
    }
    if (command === "down") {
      await local.down(c);
      console.log("stopped; the data volumes are kept");
      return 0;
    }
    if (command === "status") {
      const state = await local.status(c);
      for (const s of state.services) console.log(`${s.state.padEnd(10)} ${s.service}${s.health ? ` (${s.health})` : ""}`);
      console.log(`${state.frontendReachable ? "answers" : "does not answer"} at ${state.url}; backend ${state.backendReady ? "ready" : "not ready"}`);
      return state.frontendReachable && state.backendReady ? 0 : 1;
    }
    if (command === "doctor") {
      const mcp = await mcpProbeFor();
      return report(await local.doctor(c, { mcp }), mcp);
    }
    if (command === "backup") {
      if (rest[0] === "verify") {
        if (!rest[1]) throw new Error("usage: penpair backup verify <backup directory>");
        const result = await local.verifyBackup(c, rest[1]);
        for (const check of result.checks) console.log(`${check.ok ? "ok  " : "FAIL"} ${check.check}: ${check.detail}`);
        return result.ok ? 0 : 1;
      }
      const result = await local.backup(c);
      console.log(`backup in ${result.directory} (${result.manifest.counts.files} files, ${result.manifest.counts.storageObjects} assets). It holds account data: never commit it.`);
      return 0;
    }
    if (command === "restore") {
      if (!rest[0]) throw new Error("usage: penpair restore <backup directory> --yes");
      const result = await local.restore(c, rest[0], { yes: values.yes === true });
      for (const check of result.checks) console.log(`${check.ok ? "ok  " : "FAIL"} ${check.check}: ${check.detail}`);
      if (result.safetyBackup) console.log(`safety backup of the previous data: ${result.safetyBackup}`);
      return result.ok ? 0 : 1;
    }
  }

  const projectConfig = values.standalone ? await loadOptionalConfig(root) : await loadConfig(root);
  if (values.standalone && projectConfig) throw new ConfigError("--standalone cannot bypass a project configuration.");
  const endpoint = await resolveEndpoint();
  if (projectConfig && !values["any-instance"]) assertEndpointIsInstance(endpoint.description, projectConfig);
  const guarded = async () => guardFile(await connect(endpoint), projectConfig?.file, {
    anyFile: values["any-file"] === true,
    mode: ["pages", "tree", "audit", "tokens"].includes(command) || command === "probe" && !values.deep && !values.integrity ? "warn" : "strict",
    warn: log,
  });
  if (command === "probe") {
    if (values.deep && !values.write) throw new Error("probe --deep creates a temporary board, a token set and two components in the open file and removes them again. Run it on a scratch file, with --write to confirm.");
    const capabilityReport = await probe(endpoint, guarded, { integrity: values.integrity === true });
    console.log(JSON.stringify(capabilityReport, null, 2));
    if (capabilityReport.integrity?.supported && capabilityReport.integrity.valid === false) return 1;
    if (values.deep) {
      const client = await guarded();
      try {
        const report = await runDeepCheck(client, { onWait: (m: string) => console.error(`… ${m}`) });
        console.log(`\n${formatDeepReport(report)}`);
        return report.ok ? 0 : 1;
      } finally {
        await client.close();
      }
    }
    return 0;
  }
  const client = await guarded();
  const options = { onWait: (m: string) => console.error(`… ${m}`), onStep: (m: string) => console.error(`… ${m}`) };
  const writeOptions = (operation: string) => ({
    ...options, apply: values.apply === true, redact: (text: string) => redactEndpoint(text, endpoint),
    ...(values.apply ? { journal: {
      root, runId: values.resume, resume: Boolean(values.resume), requireCheckpoint: values.checkpoint === true,
      ...(values.checkpoint ? { checkpoint: (runId: string) => createCheckpoint(client, { label: operation, runId }, { apply: true }) } : {}),
    } } : {}),
  });
  try {
    if (command === "backup" && rest[0] === "file") {
      const out = rest[1];
      if (!out || !out.endsWith(".penpot")) throw new Error("usage: penpair backup file <new.penpot>");
      const archive = await exportFileArchive(client);
      if (archive.status !== "exported") { console.error(redactEndpoint(archive.message, endpoint)); return 1; }
      await writeFile(out, archive.bytes, { flag: "wx" });
      console.log(JSON.stringify({ file: out, fileId: archive.fileId, revn: archive.revn, bytes: archive.bytes.length, sha256: archive.sha256, restoreVerified: false }, null, 2));
      console.error("Archive bytes saved. Restore is not verified: import into a scratch project and compare content and renders.");
      return 0;
    }
    if (command === "run") {
      const [name] = rest;
      if (!name) throw new Error("usage: penpair run <snippet> [--param key=value ...] [--apply]");
      const { registry, problems } = await registryFor();
      for (const problem of problems) console.error(`warning: ${problem}`);
      const raw: Record<string, string | string[]> = {};
      for (const pair of values.param ?? []) {
        const at = pair.indexOf("=");
        if (at < 1) throw new RegistryError(`--param needs key=value, got ${JSON.stringify(pair)}`);
        const key = pair.slice(0, at);
        const value = pair.slice(at + 1);
        const earlier = raw[key];
        raw[key] = earlier === undefined ? value : [...(Array.isArray(earlier) ? earlier : [earlier]), value];
      }
      const entry = registry.get(name);
      if (entry.kind === "read" && (values.resume || values.checkpoint)) throw new Error("Read snippets have no write run to resume or checkpoint");
      const result = await registry.run(client, name, coerceParams(entry.params, raw), writeOptions(name));
      console.log(JSON.stringify(result, null, 2));
      if (entry.kind === "write" && !values.apply) console.error("Nothing was written. Run again with --apply to do it.");
      return (result as { verified?: boolean; phase?: string }).phase === "applied" && !(result as { verified?: boolean }).verified ? 1 : 0;
    }
    if (command === "baselines") {
      const config = (await loadConfig(root)).baselines;
      if (!config) throw new Error('penpair.config.json has no "baselines" block. Add {"page": "<page>", "root": "tests/baselines", "frames": [{"frame": "<frame name>", "id": "<file name>", "route": "<route>"}]}; see docs/guide.md.');
      const report = await exportBaselines(client, root, config, { ...options, apply: values.apply === true, update: values.update === true });
      for (const r of report.results) console.log(`${r.status.padEnd(9)} ${r.id.padEnd(28)} ${r.frame}${r.imageWidth ? ` (${r.imageWidth}x${r.imageHeight})` : ""}${r.written ? "  written" : ""}`);
      for (const file of report.wrote) console.log(`wrote     ${file}`);
      const changed = report.results.filter((r) => r.status === "changed" && !r.written);
      if (!values.apply) console.error("Nothing was written. Run again with --apply to write new images.");
      if (changed.length > 0) console.error(`${changed.length} design(s) differ from the image in the folder. That is a change of the approved design: review it in Penpot, then run again with --apply --update to approve it.`);
      if (report.results.some((r) => r.status === "missing" || r.status === "unstable")) return 1;
      return changed.length > 0 ? 2 : 0;
    }
    if (command === "pages") console.log(JSON.stringify(await runSnippet(client, pages(), options), null, 2));
    else if (command === "tree") {
      if (!values.page) throw new Error("--page is required");
      const record = await runOnPage(client, tree({ page: values.page, depth: values.depth ? Number(values.depth) : 3, namePrefix: values.prefix }), values.page, options);
      console.log(((record.lines as string[]) ?? []).join("\n"));
    } else if (command === "audit") {
      if (!values.page || !values.prefix) throw new Error("--page and --prefix are required");
      const steps = values.steps ? values.steps.split(",").map(Number) : undefined;
      const record = await runOnPage(client, audit({ page: values.page, framePrefix: values.prefix, spacingSteps: steps, ignoreUnbound: list(values.ignore) }), values.page, options);
      console.log(JSON.stringify(record.frames, null, 2));
    } else if (command === "tokens" && rest[0] === "dump") {
      const { ok: _ok, readOnly: _readOnly, ...dump } = await runSnippet(client, tokensDump(), options);
      console.log(JSON.stringify(dump, null, 2));
    } else if (command === "export") {
      const [shapeId, out] = rest;
      if (!shapeId || !out) throw new Error("usage: penpair export <shapeId> <out.png> [--page <name>] [--scale 1]");
      const result = await exportShapePng(client, shapeId, { ...options, page: values.page, scale: values.scale ? Number(values.scale) : 1 });
      await writeFile(out, result.png);
      console.log(`saved ${out} (${result.png.length} bytes, ${result.stable ? "stable" : "not confirmed stable"} after ${result.exports} exports)`);
    } else if (command === "archive") {
      if (!values.page || !values.name) throw new Error("--page and --name are required");
      const report = await runOperation(
        client,
        archiveOperation,
        { page: values.page, archiveName: values.name, keepPrefixes: list(values.keep), partPrefixes: list(values.parts), x: values.x ? Number(values.x) : 9000 },
        writeOptions("archive"),
      );
      console.log(JSON.stringify(report, null, 2));
      if (report.phase === "inspected") console.error("Nothing was written. Run again with --apply to do it.");
      return report.phase === "applied" && !report.verified ? 1 : 0;
    } else {
      console.log(usage(Boolean(cli.local), cli.adapters));
      return 1;
    }
    return 0;
  } finally {
    await client.close();
  }
}

/** Runs one command of an adapter with a context that can reach the project's Penpot. */
async function runAdapterCommand(command: Adapter["commands"][number], root: string, args: string[]): Promise<number> {
  const config = await loadConfig(root);
  const rawConfig = await readRawConfig(root);
  let redact = (text: string) => redactEndpoint(text);
  const context: AdapterContext = {
    redact: (text) => redact(text),
    root,
    config,
    rawConfig,
    log: (message) => console.error(`… ${message}`),
    async withPenpot(work) {
      const endpoint = await resolveEndpoint();
      redact = (text) => redactEndpoint(text, endpoint);
      assertEndpointIsInstance(endpoint.description, config);
      const client = guardFile(await connect(endpoint), config.file, { anyFile: args.includes("--any-file"), warn: context.log });
      try {
        return await work(client);
      } finally {
        await client.close();
      }
    },
  };
  return command.run(context, args.filter((arg) => arg !== "--any-file"));
}

/** Runs the command line and returns the exit code. The `penpair` command calls it with nothing extra; a package that adds a way to run Penpot calls it with its profile. */
export async function runCli(argv: string[], options: CliOptions = {}): Promise<number> {
  try {
    const root = process.cwd();
    if (argv[0] === "runs") {
      if (argv.length > 2 || argv[1]?.startsWith("--")) throw new Error("usage: penpair runs [run-id]");
      console.log(JSON.stringify(argv[1] ? await readJournal(root, argv[1]) : await listJournals(root), null, 2));
      return 0;
    }
    if (argv[0] === "config") {
      if (argv[1] === "schema" && argv.length === 2) {
        console.log(JSON.stringify(projectConfigSchema, null, 2));
        return 0;
      }
      if (argv[1] !== "check" || argv.slice(2).some((arg) => arg !== "--json"))
        throw new ConfigError("usage: penpair config check [--json] | penpair config schema");
      try {
        await loadConfig(root);
      } catch (error) {
        if (!argv.includes("--json") || !(error instanceof ConfigError)) throw error;
        console.log(JSON.stringify({ valid: false, file: "penpair.config.json", error: { code: error.code, message: error.message } }));
        return 1;
      }
      console.log(argv.includes("--json") ? JSON.stringify({ valid: true, file: "penpair.config.json" }) : "ok   penpair.config.json is valid (extension settings are validated by their adapters)");
      return 0;
    }
    const raw = await readRawConfig(root);
    const specifiers = Array.isArray(raw.adapters) ? raw.adapters.filter((entry): entry is string => typeof entry === "string") : [];
    const loaded = options.adapters ? { adapters: options.adapters, problems: [] as string[] } : specifiers.length > 0 ? await loadAdapters(root, specifiers) : { adapters: [] as Adapter[], problems: [] as string[] };
    const [first] = argv;
    const adapterCommand = loaded.adapters.flatMap((adapter) => adapter.commands).find((command) => command.name === first);
    if (adapterCommand) return await runAdapterCommand(adapterCommand, root, argv.slice(1));
    const builtIn = (reservedCommands as readonly string[]).includes(first ?? "");
    if (loaded.problems.length > 0 && (!builtIn || argv.includes("--help"))) for (const problem of loaded.problems) console.error(`warning: ${problem}`);
    return await main(argv, { ...options, adapters: loaded.adapters });
  } catch (error: unknown) {
    console.error(error instanceof PenpairError ? error.message : error instanceof ConfigError || error instanceof ConnectError || error instanceof LifecycleError || error instanceof RegistryError ? `penpair: ${error.message}` : `penpair: ${String((error as Error)?.message ?? error)}`);
    return 1;
  }
}
