#!/usr/bin/env node
import { writeFile, readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { connect, executeCode } from "./client.js";
import { resolveEndpoint } from "./endpoint.js";
import { PenpairError } from "./errors.js";
import { exportShapePng } from "./export.js";
import { archiveOperation, runOnPage, runOperation } from "./operation.js";
import { formatDeepReport, runDeepCheck } from "./deep-check.js";
import { probe } from "./probe.js";
import { checkProjectSnippets, loadProjectSnippets } from "./project-snippets.js";
import { builtInRegistry, coerceParams, RegistryError, type SnippetRegistry } from "./registry.js";
import { runSnippet } from "./snippet.js";
import { audit, pages, tokensDump, tree } from "./snippets/read.js";
import { diffEffective, effectiveValues, type TokenDump } from "./tokens-diff.js";
import { ConfigError, isExternal, loadConfig, requireLocal } from "./instance/config.js";
import { init } from "./instance/init.js";
import { assertEndpointIsInstance, backup, doctor, doctorExternal, down, restore, status, up, verifyBackup, LifecycleError, type Context } from "./instance/lifecycle.js";
import { nodeRunner } from "./instance/runner.js";
import { version } from "./index.js";

const usage = `penpair ${version}
Read-only:
  penpair probe                                        what the connected Penpot and its MCP offer, and the limits
  penpair probe --deep --write                         also tries layout, tokens, components, swap, clone and export on a temporary
                                                       board it removes again (it touches the open file, so --write is required)
  (in a project with an instance every command below acts on that instance only; --any-instance overrides)
  penpair pages                                        the file, its revision, pages and their sizes
  penpair tree --page <name> [--depth 3] [--prefix <text>]
  penpair audit --page <name> --prefix <frame name start> [--steps 0,2,4,8] [--ignore <name starts>]
  penpair tokens dump                                  token sets and themes as JSON
  penpair tokens diff <before.json> <after.json> --theme <name>
  penpair export <shapeId> <out.png> [--page <name>] [--scale 1]
An instance (one Penpot per project, configured in penpair.config.json):
  penpair init [--instance <name>] [--port 9001] [--gitignore]   set up the config, the compose file and the secrets
  penpair init --external <origin>                     use a Penpot someone else runs (a team server or https://design.penpot.app); no Docker
  penpair up | down | status                           start, stop (data stays) and look at the containers
  penpair doctor                                       what is up, what is not, and what to do about it
  penpair backup                                       database and assets, with checksums and counts
  penpair backup verify <dir>                          restore into a throwaway database and compare
  penpair restore <dir> --yes                          replace the instance's data with a backup (safety backup first)
Snippets (the built-in ones and the project's own, listed under "snippets" in penpair.config.json):
  penpair snippets                                     what can be run, with its parameters
  penpair snippets check                               validate the project's snippets without a connection
  penpair run <name> [--param key=value ...] [--apply] run one; a snippet that changes things only looks unless --apply
Changes in a Penpot file (inspect first; nothing is written without --apply):
  penpair archive --page <name> --name <archive board> --keep <prefixes> --parts <prefixes> [--x 9000] [--apply]
  penpair --version`;

const list = (value: string | undefined): string[] => (value ?? "").split(",").map((v) => v.trim()).filter(Boolean);

async function main(argv: string[]): Promise<number> {
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
      deep: { type: "boolean" },
      write: { type: "boolean" },
      param: { type: "string", multiple: true },
      version: { type: "boolean" },
      help: { type: "boolean" },
    },
  });
  const [command, ...rest] = positionals;
  if (values.version) {
    console.log(version);
    return 0;
  }
  if (!command || values.help) {
    console.log(usage);
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

  /** What `doctor` needs to look for the editor and plugin, or nothing when no endpoint is set yet. */
  async function mcpProbeFor(): Promise<{ origin: string; connect: () => Promise<{ file: string }> } | undefined> {
    try {
      const endpoint = await resolveEndpoint();
      return {
        origin: endpoint.description.origin,
        connect: async () => {
          const client = await connect(endpoint);
          try {
            const { result } = await executeCode(client, "return { file: penpot.currentFile.name };", { retries: 0 });
            return { file: String((result as { file?: string }).file ?? "?") };
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
    let snippets: string[] | undefined;
    try {
      snippets = (await loadConfig(root)).snippets;
    } catch {
      // not a penpair project: only the built-in snippets
    }
    const report = await loadProjectSnippets(root, snippets, registry);
    return { registry, problems: report.problems, files: report.files };
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
    const result = await init(root, { instance: values.instance, port: values.port ? Number(values.port) : undefined, gitignore: values.gitignore, external: values.external });
    if (isExternal(result.config)) {
      console.log(`${result.createdConfig ? "created" : "kept"} penpair.config.json (external Penpot at ${result.config.profile.origin})`);
      console.log("next: in that Penpot enable the MCP key (Account, Integrations, MCP Server), put the address in .env.local as PENPAIR_MCP_URL, connect the plugin in a file (File, MCP Server, Connect), then run `penpair doctor`");
      return 0;
    }
    console.log(`${result.createdConfig ? "created" : "kept"} penpair.config.json (instance ${result.config.instance}, Penpot ${result.config.penpotVersion}, port ${result.config.ports.frontend})`);
    console.log(`wrote ${result.config.directory}/docker-compose.yaml; secrets ${result.createdSecrets ? "generated" : "kept"} in ${result.config.directory}/.env`);
    if (!result.gitignoreAdded) console.log(`keep ${result.config.directory}/ out of git (add it to .gitignore, or run init with --gitignore)`);
    console.log("next: penpair up");
    return 0;
  }
  const lifecycle = new Set(["up", "down", "status", "doctor", "backup", "restore"]);
  if (lifecycle.has(command)) {
    const project = await loadConfig(root);
    if (isExternal(project) && command !== "doctor") requireLocal(project);
    if (isExternal(project)) {
      const mcp = await mcpProbeFor();
      const checks = await doctorExternal(project, { mcp });
      for (const check of checks) console.log(`${check.ok ? "ok  " : "FAIL"} ${check.check}: ${check.detail}${check.remedy ? `\n       → ${check.remedy}` : ""}`);
      if (!mcp) console.log("skip editor and plugin: no MCP endpoint yet (set PENPAIR_MCP_URL in .env.local)");
      return checks.every((check) => check.ok) ? 0 : 1;
    }
    const c: Context = { root, config: requireLocal(project), runner: nodeRunner, log };
    if (command === "up") {
      const result = await up(c);
      console.log(result.ready ? `Penpot is up at ${result.url}. Create an account, open a file, then enable the MCP key (Account, Integrations, MCP Server) and put it in .env.local as PENPAIR_MCP_URL.` : `The containers started but ${result.url} does not answer yet. Run \`penpair status\`.`);
      return result.ready ? 0 : 1;
    }
    if (command === "down") {
      await down(c);
      console.log("stopped; the data volumes are kept");
      return 0;
    }
    if (command === "status") {
      const state = await status(c);
      for (const s of state.services) console.log(`${s.state.padEnd(10)} ${s.service}${s.health ? ` (${s.health})` : ""}`);
      console.log(`${state.frontendReachable ? "answers" : "does not answer"} at ${state.url}; backend ${state.backendReady ? "ready" : "not ready"}`);
      return state.frontendReachable && state.backendReady ? 0 : 1;
    }
    if (command === "doctor") {
      const mcp = await mcpProbeFor();
      const checks = await doctor(c, { mcp });
      for (const check of checks) console.log(`${check.ok ? "ok  " : "FAIL"} ${check.check}: ${check.detail}${check.remedy ? `\n       → ${check.remedy}` : ""}`);
      if (!mcp) console.log("skip editor and plugin: no MCP endpoint yet (set PENPAIR_MCP_URL in .env.local)");
      return checks.every((check) => check.ok) ? 0 : 1;
    }
    if (command === "backup") {
      if (rest[0] === "verify") {
        if (!rest[1]) throw new Error("usage: penpair backup verify <backup directory>");
        const result = await verifyBackup(c, rest[1]);
        for (const check of result.checks) console.log(`${check.ok ? "ok  " : "FAIL"} ${check.check}: ${check.detail}`);
        return result.ok ? 0 : 1;
      }
      const result = await backup(c);
      console.log(`backup in ${result.directory} (${result.manifest.counts.files} files, ${result.manifest.counts.storageObjects} assets). It holds account data: never commit it.`);
      return 0;
    }
    if (command === "restore") {
      if (!rest[0]) throw new Error("usage: penpair restore <backup directory> --yes");
      const result = await restore(c, rest[0], { yes: values.yes === true });
      for (const check of result.checks) console.log(`${check.ok ? "ok  " : "FAIL"} ${check.check}: ${check.detail}`);
      if (result.safetyBackup) console.log(`safety backup of the previous data: ${result.safetyBackup}`);
      return result.ok ? 0 : 1;
    }
  }

  const endpoint = await resolveEndpoint();
  // In a project with an instance, act only on that instance unless told otherwise.
  if (!values["any-instance"]) {
    let projectConfig;
    try {
      projectConfig = await loadConfig(root);
    } catch {
      // not a penpair project: any endpoint will do
    }
    if (projectConfig) assertEndpointIsInstance(endpoint.description, projectConfig);
  }
  if (command === "probe") {
    if (values.deep && !values.write) throw new Error("probe --deep creates a temporary board, a token set and two components in the open file and removes them again. Run it on a scratch file, with --write to confirm.");
    console.log(JSON.stringify(await probe(endpoint, () => connect(endpoint)), null, 2));
    if (values.deep) {
      const client = await connect(endpoint);
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
  const client = await connect(endpoint);
  const options = { onWait: (m: string) => console.error(`… ${m}`), onStep: (m: string) => console.error(`… ${m}`) };
  try {
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
      const result = await registry.run(client, name, coerceParams(entry.params, raw), { ...options, apply: values.apply === true });
      console.log(JSON.stringify(result, null, 2));
      if (entry.kind === "write" && !values.apply) console.error("Nothing was written. Run again with --apply to do it.");
      return (result as { verified?: boolean; phase?: string }).phase === "applied" && !(result as { verified?: boolean }).verified ? 1 : 0;
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
        { ...options, apply: values.apply === true },
      );
      console.log(JSON.stringify(report, null, 2));
      if (report.phase === "inspected") console.error("Nothing was written. Run again with --apply to do it.");
      return report.phase === "applied" && !report.verified ? 1 : 0;
    } else {
      console.log(usage);
      return 1;
    }
    return 0;
  } finally {
    await client.close();
  }
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(error instanceof PenpairError ? error.message : error instanceof ConfigError || error instanceof LifecycleError || error instanceof RegistryError ? `penpair: ${error.message}` : `penpair: ${String((error as Error)?.message ?? error)}`);
    process.exitCode = 1;
  },
);
