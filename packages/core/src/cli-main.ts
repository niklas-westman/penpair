import { auditDesignRules } from "./audit-rules.js";
import { projectStatus, projectFileUrl, openProject } from "./project-status.js";
import { artifactSchemas, migrateProjectConfig } from "./formats.js";
import { importDtcg, exportDtcg } from "./portable-tokens.js";
import { captureStructuralSnapshot, writeStructuralSnapshot, readStructuralSnapshot, diffStructuralSnapshots, renderStructuralDiff } from "./structure-snapshot.js";
import { recordApproval, approvalFingerprint, artifactSha } from "./approvals.js";
import { AsyncLocalStorage } from "node:async_hooks";
import { buildDesignSpec, renderDesignSpec, checkDesignSpec, readDesignJson, validateComponentMap, emptyComponentMap, writeDesignSpec } from "./design-spec.js";
import { readBaselineCoverage } from "./baseline-coverage.js";
import { runKitSmoke } from "./kit-smoke.js";
import { checkKits, loadKits } from "./kit.js";
import { prepareFileScript, runFileScript } from "./run-file.js";
import { tokenEditOperation, validateTokenEdit, type TokenEdit } from "./token-edit.js";
import { withCommandSignal, commandSignal, commandOutput as output, commandFailure, commandRedactor, collectCommand, CommandInterruptedError, type CommandResult } from "./command-result.js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { CommandArgumentError, parseCommandArgs } from "./cli-arguments.js";
import { connect, executeCode } from "./client.js";
import { endpointRedactor, redactEndpoint, resolveEndpoint } from "./endpoint.js";
import { PenpairError } from "./errors.js";
import { captureInspection, inspectChunk, validateCaptureBudget, validateInspectionQuery, type InspectionField, type InspectionQuery, type CaptureBudget } from "./inspection.js";
import { resolveProjectOutput } from "./project-input.js";
import { mkdir } from "node:fs/promises";
import { captureShots, exportShapeByName, findShapesByName } from "./shots.js";
import { exportShapePng } from "./export.js";
import { exportBaselines } from "./baselines.js";
import { archiveOperation, runOnPage, runOperation } from "./operation.js";
import { formatDeepReport, runDeepCheck } from "./deep-check.js";
import { probe } from "./probe.js";
import { installSkills, listBundledSkills } from "./skills.js";
import { checkProjectSnippets, loadProjectSnippets } from "./project-snippets.js";
import { builtInRegistry, coerceParams, RegistryError, type SnippetRegistry } from "./registry.js";
import { runSnippet } from "./snippet.js";
import { audit, pages, tree } from "./snippets/read.js";
import { diffEffective, effectiveValues, parseTokenDump, type TokenDump } from "./tokens-diff.js";
import { ConfigError, isExternal, loadConfig, loadOptionalConfig, requireLocal, type ProjectConfig } from "./instance/config.js";
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
import { atomicWriteFile } from "./atomic-output.js";
import { onboardingChecklist } from "./onboard.js";
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
Connect / diagnose:
  penpair config check [--json]                        validate configuration offline
  penpair config schema                               print its JSON Schema
  penpair doctor [--json] [--timeout-ms 5000]           origin, transport, fresh editor read and file pin (1000–30000 ms)
  penpair status [--adapters]                          observed project health and optional companion readiness
  penpair open [--print]                              open the pinned public file URL, or print it
  penpair probe [--integrity]                          observed APIs and limits
  penpair probe --deep --write [--kit]                 temporary scratch checks; requires an authorized disposable file
  penpair onboard [--json]                            personal-key colleague setup checklist
Build:
  penpair kit check [--include @kit]                   compile helpers offline
  penpair recipes [--include @kit]                     list available recipes without building
  penpair run-file <script.js> --include @kit --inspect inspect.js --readback readback.js --page PAGE [--apply]
  penpair run <name> [--param key=value] [--apply]       configured snippet; inspect first
  penpair snippets / snippets check                    list or validate configured trusted scripts
  penpair tokens add-set|set|remove|promote             inspect token edits; --apply writes once
  penpair archive --page PAGE --name Archive --keep PREFIX [--apply]
  (run-file/export/shots accept --layout auto|native|geometry; default auto)
  (journaled writes accept --resume RUN_ID --apply, --checkpoint and --trace)
Inspect / spec:
  penpair pages                                       file identity, revision and pages
  penpair tree --page PAGE [--depth 3] [--prefix TEXT]  bounded preview
  penpair inspect ID --page PAGE --all --out design/inspection.json
  penpair spec --from design/inspection.json --out design/spec.md
  penpair spec check --from design/inspection.json --out design/spec.md
  penpair spec --page PAGE --frame ID [--map mapping.json]
  penpair audit --page PAGE --prefix PREFIX [--rules]  advisory findings and unknowns
  penpair tokens dump                                  complete typed token catalog
Snapshot / diff:
  penpair snapshot [--write] [--out design/snapshots/current]
  penpair snapshot diff design/snapshots/before --from design/snapshots/current
  penpair tokens diff before.json after.json --theme NAME
  penpair runs [RUN_ID]                                private recovery evidence, offline
Capture / approve:
  penpair export ID out.png [--page PAGE] [--scale 1]
  penpair export --name EXACT_NAME --page PAGE out.png
  penpair shots --page PAGE [--prefix PREFIX] [--out design/shots]
  penpair approve --page PAGE --frame ID [--case CASE_ID]  preview exact-artifact evidence
  penpair approve --page PAGE --frame ID --write --note "OWNER WORDS" --by OWNER
  penpair baselines [--apply] [--update]                capture configured references; approval requires exact owner evidence
  penpair baselines coverage [--json]                  approved intent, missing cases and unknowns
  penpair backup file new.penpot                        bounded full-file archive; restore proof remains separate
Compare:
  penpair reflection plan --map cases.json              requires the configured comparison companion
  penpair reflection check --map cases.json --provider provider.mjs
  (install/register the companion, then supply real browser setup/readback; scores require owner review)
  Workflow and limitations: docs/design-workflow.md, docs/adapters.md, docs/recovery.md
@@INSTANCE@@Skills (the rules an AI agent follows, shipped with penpair):
  penpair skills                                       list them
  penpair skills install [--to <folder>] [--only <name>] [--force] [--agents AGENTS.md] [--dry-run]
  (built-in help lists configured extensions without importing their trusted code)
  (config-free inspection requires --standalone; writes require a project)
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

const usage = (hasLocal: boolean, adapters: Adapter[] = [], configured: string[] = []): string =>
  usageHead.replace("@@INSTANCE@@", usageConnection + (hasLocal ? usageLocalInstance : usageNoLocalInstance)).replace("@@SETUP@@", hasLocal ? "  penpair setup --docker                               Penpot on this computer in Docker\n" : "") + adapterUsage(adapters) + (configured.length ? `\nConfigured executable extensions (not loaded for built-in help):\n${configured.map((name) => `  ${JSON.stringify(name)}`).join("\n")}\nUse the extension command to load its trusted project code.\n` : "");

/** The commands that adapters from penpair.config.json add, after the core's own. */
const adapterUsage = (adapters: Adapter[]): string =>
  adapters.length === 0 ? "" : `\nAdapters (listed under "adapters" in penpair.config.json):\n${adapters.flatMap((a) => a.commands.flatMap((c) => c.usage.map((line) => `  ${line}`))).join("\n")}\n`;

const list = (value: string | undefined): string[] => (value ?? "").split(",").map((v) => v.trim()).filter(Boolean);

const commandProjects = new AsyncLocalStorage<{ root: string; projectEndpointOnly?: boolean; pinnedConfig?: ProjectConfig; strictFileGuard?: boolean }>();
const targetSignature = (config: ProjectConfig) => JSON.stringify({ instance: config.instance, file: config.file, profile: "profile" in config ? config.profile : null, ports: "ports" in config ? config.ports : null });
async function loadCommandConfig(root: string): Promise<ProjectConfig> {
  const config = await loadConfig(root), pinned = commandProjects.getStore()?.pinnedConfig;
  if (pinned && targetSignature(config) !== targetSignature(pinned)) throw new Error("Pinned project target changed; restart and review the server configuration");
  return config;
}
const projectRoot = () => commandProjects.getStore()?.root ?? process.cwd();
const projectEndpoint = async (root: string) => {
  const config = await loadOptionalConfig(root);
  return resolveEndpoint({ envFiles: [path.join(root, ".env.local")], credentialRoot: root, credential: config?.connection?.credential, globalConfig: !commandProjects.getStore()?.projectEndpointOnly });
};

export interface CliOptions {
  /** Explicit request-scoped project root; never changes the process working directory. */
  root?: string;
  /** Refuse unrelated global client endpoint fallback (used by the stdio server). */
  projectEndpointOnly?: boolean;
  /** Immutable server target: every loaded project configuration must still match. */
  pinnedConfig?: ProjectConfig;
  strictFileGuard?: boolean;
  /** Adapters already loaded (the command loads the project's own from penpair.config.json). */
  adapters?: Adapter[];
  configuredAdapters?: string[];
  /** A way to run Penpot on this computer, from a package that provides one (`@penpair/docker`). Without it those commands explain where they come from. */
  local?: LocalProfile;
}

async function main(argv: string[], cli: CliOptions): Promise<number> {
  const { values, positionals } = parseCommandArgs({
    args: argv,
    allowPositionals: true,
    options: {
      include: { type: "string", multiple: true },
      rules: { type: "boolean" }, "token-source": { type: "string" },
      adapters: { type: "boolean" }, print: { type: "boolean" },
      note: { type: "string" }, by: { type: "string" }, "case": { type: "string" }, "force-reason": { type: "string" },
      from: { type: "string" }, map: { type: "string" }, frame: { type: "string" },
      inspect: { type: "string" }, readback: { type: "string" },
      "timeout-ms": { type: "string" },
      layout: { type: "string" },
      page: { type: "string" },
      out: { type: "string" },
      fields: {type:"string"}, cursor:{type:"string"}, all:{type:"boolean"},
      "max-nodes":{type:"string"}, "response-bytes":{type:"string"}, "time-budget-ms":{type:"string"}, "document-bytes":{type:"string"},
      "max-calls":{type:"string"}, "max-total-bytes":{type:"string"}, "capture-timeout-ms":{type:"string"},
      depth: { type: "string" },
      limit: { type: "string" },
      prefix: { type: "string" },
      steps: { type: "string" },
      ignore: { type: "string" },
      theme: { type: "string" },
      type: { type: "string" }, value: { type: "string" }, description: { type: "string" },
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
      "builtins-only": { type: "boolean" },
      agents: { type: "string" },
      "dry-run": { type: "boolean" },
      web: { type: "boolean" },
      docker: { type: "boolean" },
      replace: { type: "boolean" },
      update: { type: "boolean" },
      json: { type: "boolean" },
      deep: { type: "boolean" },
      integrity: { type: "boolean" },
      kit: { type: "boolean" },
      resume: { type: "string" },
      checkpoint: { type: "boolean" },
      "force-lock": { type: "boolean" },
      trace: { type: "boolean" },
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
  const inspectionFlags=["cursor","all","out","max-nodes","response-bytes","time-budget-ms","document-bytes","max-calls","max-total-bytes","capture-timeout-ms"];
  const flags: Record<string, string[]> = {
    formats: ["out"],
    snapshot: ["write", "out", "from"],
    approve: ["page", "frame", "note", "by", "case", "write"],
    spec: ["from", "map", "out", "page", "frame"],
    pages: [], tree: ["page", "depth", "prefix", "limit"], audit: ["page", "prefix", "steps", "ignore", "rules", "from", "token-source"], inspect:["page","depth","fields",...inspectionFlags], tokens:rest[0]==="dump"?inspectionFlags:rest[0]==="diff"?["theme"]:["type","value","description","apply","resume","checkpoint","force-lock","trace"], export: ["page", "scale", "name", "layout"], shots: ["page", "prefix", "out", "scale", "layout"],
    archive: ["page", "name", "keep", "parts", "x", "apply", "resume", "checkpoint", "force-lock", "trace"],
    kit: ["include"], recipes: ["include"],
    "run-file": ["layout", "include", "inspect", "readback", "page", "param", "apply", "resume", "checkpoint", "force-lock", "trace"],
    run: ["builtins-only", "param", "apply", "resume", "checkpoint", "force-lock", "trace"], baselines: ["apply", "update", "force-reason"], probe: ["deep", "write", "integrity", "kit"],
    skills: ["to", "only", "force", "agents", "dry-run"], snippets: ["builtins-only"], init: ["instance", "port", "gitignore", "external"], setup: ["agents", "web", "docker", "external", "instance", "port"],
    connect: ["replace", "pin-file", "any-file"], doctor: ["timeout-ms"], up: [], down: [], open: ["print"], status: ["adapters"], backup: [], restore: ["yes"],
  };
  const network = ["snapshot", "approve", "spec", "inspect", "pages", "tree", "audit", "tokens", "export", "shots", "archive", "run", "run-file", "baselines", "probe", "backup", "doctor"];
  const allowed = new Set(["help", "version", "json", ...(flags[command ?? ""] ?? []), ...(network.includes(command ?? "") ? ["any-instance", "any-file", "standalone"] : [])]);
  for (const key of Object.keys(values)) if (!allowed.has(key)) throw new Error(`--${key} is not supported by ${command || "this command"}`);
  for (const [key, min, max, integer] of [["depth", 0, command==="inspect"?10000:100, true], ["limit",1,1000,true], ["scale", 0.01, 8, false], ["x", -10000000, 10000000, false], ["port", 1024, 65535, true]] as const) {
    const raw = values[key]; if (raw === undefined) continue;
    const number = Number(raw);
    if (!raw.trim() || !Number.isFinite(number) || number < min || number > max || integer && !Number.isInteger(number)) throw new Error(`--${key} must be ${integer ? "an integer" : "a number"} from ${min} to ${max}`);
  }
  if (command === "export" && (rest.length !== (values.name ? 1 : 2) || values.name && !values.page)) throw new CommandArgumentError("Export requires an ID and output path, or --name with an explicit --page and one output path");
  if (command === "shots" && (!values.page || rest.length)) throw new CommandArgumentError("Shots requires --page and supports optional --prefix/--out");
  if (values.layout !== undefined && !["auto", "native", "geometry"].includes(values.layout)) throw new CommandArgumentError("--layout must be auto, native or geometry");
  if (command === "doctor" && values["timeout-ms"] !== undefined && (!/^\d+$/.test(values["timeout-ms"]) || Number(values["timeout-ms"]) < 1000 || Number(values["timeout-ms"]) > 30000)) throw new CommandArgumentError("doctor --timeout-ms must be an integer from 1000 to 30000");
  let tokenEdit: TokenEdit | undefined;
  if (command === "tokens" && !["dump", "diff"].includes(rest[0] ?? "")) {
    const [kind, set, name] = rest;
    if (kind === "add-set" && rest.length === 2) tokenEdit = { kind, set: set! };
    else if (kind === "remove" && rest.length === 3) tokenEdit = { kind, set: set!, name: name! };
    else if (kind === "promote" && rest.length === 3) tokenEdit = { kind, set: set!, to: name! };
    else if (kind === "set" && rest.length === 3 && values.type && values.value) {
      let value: unknown; try { value = JSON.parse(values.value); } catch { throw new CommandArgumentError("--value must be JSON: quote strings or supply a composite object"); }
      tokenEdit = { kind, set: set!, token: { name: name!, type: values.type, value: value as string, description: values.description ?? "" } };
    } else throw new CommandArgumentError("Usage: tokens add-set SET; tokens set SET NAME --type TYPE --value JSON; tokens remove SET NAME; tokens promote SOURCE DESTINATION");
    if (kind !== "set" && [values.type, values.value, values.description].some(v => v !== undefined)) throw new CommandArgumentError("Token value options apply only to tokens set");
    tokenEdit = validateTokenEdit(tokenEdit);
  }
  let inspectionRequest: {query:InspectionQuery;budget:CaptureBudget}|undefined;
  if (command==="inspect" || command==="tokens" && rest[0]==="dump") {
    if (rest.length!==1 || command==="inspect"&&!values.page) throw new CommandArgumentError("Inspect requires one shape ID and --page; tokens dump accepts no extra positionals");
    if (values.cursor&&values.all || values.cursor&&values.out || command==="inspect"&&values.out&&!values.all) throw new CommandArgumentError("Use --all for a complete output file; --cursor selects one continuation chunk");
    if ((values.cursor || command==="inspect"&&!values.all) && [values["max-calls"],values["max-total-bytes"],values["capture-timeout-ms"]].some(value=>value!==undefined)) throw new CommandArgumentError("Collection budgets require a full capture rather than one cursor chunk");
    const numeric=(key:keyof typeof values):number|undefined=>values[key]===undefined?undefined:Number(values[key]);
    const query:InspectionQuery={kind:command==="inspect"?"shape":"tokens",shapeId:command==="inspect"?rest[0]:undefined,page:values.page,
      fields:values.fields?.split(",").map(field=>field.trim()) as InspectionField[]|undefined,depth:numeric("depth"),maxNodes:numeric("max-nodes"),responseBytes:numeric("response-bytes"),timeBudgetMs:numeric("time-budget-ms"),documentBytes:numeric("document-bytes"),cursor:values.cursor};
    validateInspectionQuery(query);
    inspectionRequest={query,budget:validateCaptureBudget({maxCalls:numeric("max-calls"),maxTotalBytes:numeric("max-total-bytes"),timeoutMs:numeric("capture-timeout-ms")})};
  }
  if (values.kit && (!values.deep || !values.write)) throw new CommandArgumentError("--kit requires the explicit scratch probe --deep --write");
  if (values.steps && values.steps.split(",").some((step) => !step.trim() || !Number.isFinite(Number(step)) || Number(step) < 0)) throw new Error("--steps requires finite nonnegative numbers");
  if (command === "skills" && rest[0] !== "install" && [values.agents, values["dry-run"], values.to, values.only, values.force].some((value) => value !== undefined)) throw new Error("Installation flags require skills install");
  if ((values.resume || values.checkpoint || values["force-lock"] || values.trace) && (!values.apply || !(["archive", "run", "run-file"].includes(command ?? "") || command === "tokens" && tokenEdit)))
    throw new Error("--resume and --checkpoint require an operation command (archive/run/run-file/tokens) with --apply");
  if (values.version) {
    output.log(version);
    return 0;
  }
  if (!command || command === "help" || values.help) {
    output.log(usage(Boolean(cli.local), cli.adapters, cli.configuredAdapters));
    return 0;
  }

  if (command === "audit" && values.from) {
    if (rest.length || values.page || values.prefix || values.steps || values.ignore || values["any-file"] || values["any-instance"] || values.standalone) throw new CommandArgumentError("audit --from INSPECTION [--token-source TOKENS] uses configured advisory rules offline");
    const config = await loadCommandConfig(projectRoot()); if (!config.audit) throw new Error("Configure explicit audit rules first");
    const report = auditDesignRules(await readDesignJson(projectRoot(), values.from) as import("./inspection.js").InspectionDocument, config.audit, values["token-source"] ? await readDesignJson(projectRoot(), values["token-source"]) as import("./inspection.js").InspectionDocument : undefined);
    output.result(report); output.log(JSON.stringify(report,null,2)); return report.complete ? 0 : 3;
  }
  if (command === "formats") {
    const [action, input] = rest;
    if (action === "schema" && rest.length === 2 && !values.out && artifactSchemas[input!]) { output.result(artifactSchemas[input!]); output.log(JSON.stringify(artifactSchemas[input!], null, 2)); return 0; }
    if (!["import-tokens", "export-tokens", "migrate-config"].includes(action ?? "") || rest.length !== 2) throw new CommandArgumentError("formats schema NAME | import-tokens FILE | export-tokens FILE | migrate-config FILE [--out NEW_FILE]");
    const raw = await readDesignJson(projectRoot(), input!, 8 * 1024 * 1024);
    const result = action === "import-tokens" ? importDtcg(raw) : action === "export-tokens" ? exportDtcg(raw) : migrateProjectConfig(raw);
    if (values.out) { const target = await resolveProjectOutput(projectRoot(), values.out); await mkdir(path.dirname(target), { recursive: true }); await atomicWriteFile(target, JSON.stringify(result, null, 2) + "\n"); }
    output.result(result); output.log(JSON.stringify(result, null, 2)); return 0;
  }
  if (command === "snapshot" && rest[0] === "diff") {
    if (rest.length !== 2 || !values.from || values.write || values["any-file"] || values["any-instance"] || values.standalone) throw new CommandArgumentError("snapshot diff BEFORE_FOLDER --from AFTER_FOLDER [--out FILE]");
    const diff = diffStructuralSnapshots(await readStructuralSnapshot(projectRoot(), rest[1]!), await readStructuralSnapshot(projectRoot(), values.from));
    if (values.out) await writeDesignSpec(projectRoot(), values.out, renderStructuralDiff(diff));
    output.result(diff); if (!values.json) output.log(renderStructuralDiff(diff)); return !diff.complete ? 3 : diff.totalChanges ? 2 : 0;
  }
  if (command === "snapshot" && (rest.length || values.from)) throw new CommandArgumentError("snapshot [--write] [--out FOLDER], or snapshot diff BEFORE --from AFTER");
  if (command === "spec" && values.from) {
    if (rest.length > 1 || rest.length === 1 && rest[0] !== "check" || values.page || values.frame || values.standalone || values["any-file"] || values["any-instance"]) throw new CommandArgumentError("Offline spec requires --from INSPECTION [--map MAPPING] [--out FILE]; spec check also requires --out");
    const inspection = await readDesignJson(projectRoot(), values.from) as import("./inspection.js").InspectionDocument;
    const mapping = values.map ? validateComponentMap(await readDesignJson(projectRoot(), values.map, 1024 * 1024)) : emptyComponentMap;
    if (rest[0] === "check") {
      if (!values.out) throw new CommandArgumentError("spec check requires --out and --from");
      const file = await import("./project-input.js").then(m => m.resolveProjectInput(projectRoot(), values.out!));
      const report = checkDesignSpec(await readFile(file, "utf8"), inspection, mapping); output.result(report); output.log(JSON.stringify(report)); return report.current ? 0 : 2;
    }
    const spec = buildDesignSpec(inspection, mapping), markdown = renderDesignSpec(spec);
    if (values.out) await writeDesignSpec(projectRoot(), values.out, markdown);
    output.result(spec); if (!values.json) output.log(markdown); return 0;
  }
  if (command === "spec" && (rest.length || !values.page || !values.frame)) throw new CommandArgumentError("Live spec requires --page and --frame ID (or --from for offline generation)");
  if (command === "baselines" && rest[0] === "coverage") {
    if (rest.length !== 1 || values.apply || values.update || values["any-file"] || values["any-instance"] || values.standalone) throw new CommandArgumentError("baselines coverage is an offline report with optional --json");
    const config = await loadCommandConfig(projectRoot()); if (!config.baselines) throw new Error("Configure baselines before reporting coverage");
    const report = await readBaselineCoverage(projectRoot(), config.baselines, config.file?.id);
    output.result(report); if (!values.json) output.log(JSON.stringify(report, null, 2));
    return report.designCasesComplete ? 0 : 3;
  }
  if (command === "kit" || command === "recipes") {
    if (command === "kit" ? rest.length !== 1 || rest[0] !== "check" : rest.length) throw new CommandArgumentError("Use kit check, or recipes, with optional ordered --include aliases");
    const kits = await loadKits(projectRoot(), values.include ?? ["@kit"]);
    output.result(command === "kit" ? checkKits(kits) : { recipes: kits.flatMap(value => value.recipes.map(recipe => ({ ...recipe, include: value.include }))), includes: kits.map(value => value.include) });
    if (!values.json) output.log(command === "kit" ? JSON.stringify(checkKits(kits), null, 2) : kits.flatMap(value => value.recipes.map(recipe => `${value.include} ${recipe.name}: ${recipe.description}`)).join("\n"));
    return 0;
  }
  if (command === "tokens" && rest[0] === "diff") {
    const [, beforeFile, afterFile] = rest;
    if (!beforeFile || !afterFile || !values.theme) throw new Error("usage: penpair tokens diff <before.json> <after.json> --theme <name>");
    const load = async (file: string): Promise<TokenDump> => parseTokenDump(JSON.parse(await readFile(file, "utf8")));
    const diff = diffEffective(effectiveValues(await load(beforeFile), values.theme), effectiveValues(await load(afterFile), values.theme));
    output.log(JSON.stringify(diff, null, 2));
    return !diff.complete ? 3 : diff.added.length + diff.removed.length + diff.changed.length === 0 ? 0 : 2;
  }

  const root = projectRoot();
  const log = (message: string): void => output.error(`… ${message}`);
  if (values.standalone) {
    const inspection = ["inspect", "pages", "tree", "audit", "export", "shots"].includes(command!) || (command === "probe" && !values.deep) || (command === "tokens" && rest[0] === "dump");
    if (await loadOptionalConfig(root) || !inspection || values.apply || values.write)
      throw new ConfigError("--standalone is only for built-in inspection commands in a folder without penpair.config.json. It cannot bypass a project or run writes/snippets.");
  }

  /** What `doctor` needs to look for the editor and plugin, or nothing when no endpoint is set yet. */
  async function mcpProbeFor(): Promise<import("./instance/connection.js").DoctorOptions["mcp"]> {
    try {
      const endpoint = await projectEndpoint(root);
      commandRedactor(endpointRedactor(endpoint));
      return {
        origin: endpoint.description.origin,
        connect: async (request) => {
          if (!request) throw new Error("Doctor requires a fresh challenge");
          const started = Date.now();
          const client = await connect(endpoint, { timeoutMs: request.timeoutMs, signal: request.signal });
          try {
            request.signal.throwIfAborted(); request.onTransport();
            const remaining = request.timeoutMs - (Date.now() - started);
            if (remaining < 1) throw new Error("Doctor connection exhausted execution budget");
            const { result } = await executeCode(client, `return { challenge: ${JSON.stringify(request.challenge)}, file: penpot.currentFile.name, fileId: penpot.currentFile.id, pageId: penpot.currentPage.id, apiVersion: typeof penpot.version === "string" ? penpot.version : undefined };`, { retries: 0, effect: "read", timeoutMs: remaining });
            if (!result || typeof result !== "object") throw new Error("No fresh editor execution evidence");
            return result as import("./instance/connection.js").DoctorObservation;
          } finally { await client.close(); }
        },
      };
    } catch {
      return undefined;
    }
  }

  async function registryFor(requested?: string): Promise<{ registry: SnippetRegistry; problems: string[]; files: string[] }> {
    const registry = builtInRegistry();
    if (values["builtins-only"] || requested && registry.list().some((entry) => entry.name === requested)) return { registry, problems: [], files: [] };
    const snippets = (await loadOptionalConfig(root))?.snippets;
    const report = await loadProjectSnippets(root, snippets, registry);
    return { registry, problems: report.problems, files: report.files };
  }

  const connectIo = (): ConnectIo => ({
    say: (line) => output.log(line),
    askHidden,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    confirmFile: async (file) => values["pin-file"] === true || /^(y|yes)$/i.test(await askLine(`Pin this project's file to "${file.name}" (${file.id})? [y/N] `, "n")),
    openFile: async (url) => {
      const endpoint = await resolveEndpoint({ environment: { PENPAIR_MCP_URL: url }, envFiles: [] });
      commandRedactor(endpointRedactor(endpoint));
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
      const project = await loadCommandConfig(root);
      await connectProject(root, project, connectIo(), { replace: values.replace === true, anyFile: values["any-file"] === true });
      output.log("Next: `penpair doctor`, then `penpair skills install` if you have not yet.");
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
          const report = await installSkills({ root, agents: values.agents });
          output.log(`Installed ${report.installed.length} rule file(s) in ${report.to}/ (${report.unchanged.length} already there).`);
          if (report.instructions?.path) output.log(`Instructions: ${report.instructions.path} (${report.instructions.status})`);
          else output.log(`Choose an instruction destination with skills install --agents <path>. Rows:\n${report.agentsRows.join("\n")}`);
        },
      },
    );
    return 0;
  }

  if (command === "skills") {
    if (rest[0] === "install") {
      const report = await installSkills({ root, to: values.to, only: values.only, force: values.force, agents: values.agents, dryRun: values["dry-run"] });
      output.result(report);
      if (report.instructions?.path) output.log(`instructions: ${report.instructions.path} (${report.instructions.status})`);
      if (report.dryRun) {
        for (const file of report.wouldInstall ?? []) output.log(`would write ${file}`);
        for (const file of report.wouldLink ?? []) output.log(`would link ${file}`);
        if (report.instructions?.diff) output.log(report.instructions.diff);
      }
      if (report.instructions?.status === "choice-required") output.error("Both AGENTS.md and CLAUDE.md exist; choose --agents <path> explicitly. Instruction files were not changed.");
      for (const file of report.installed) output.log(`wrote     ${file}`);
      for (const file of report.kept) output.log(`kept      ${file} (differs from the shipped one; --force replaces it, except the project-owned files)`);
      for (const link of report.linked) output.log(`linked    ${link}`);
      output.log(`${report.unchanged.length} file(s) already up to date`);
      if (!report.instructions?.path) output.log("\nChoose --agents <path> to integrate these rows:\n" + report.agentsRows.join("\n"));
      for (const old of report.legacy) output.log(`\nnote ${old.folder} is the old name of ${old.renamedTo}. ${old.carriedFacts ? "Your project-facts.md was copied to the new folder. " : ""}Delete the old folder and its links (.agents/skills/${path.posix.basename(old.folder)}, .claude/skills/${path.posix.basename(old.folder)}) and update its row in your AGENTS.md.`);
      output.log("\nThen fill in references/project-facts.md in penpair-design: it is yours and is never replaced.");
      return report.instructions?.status === "choice-required" ? 3 : 0;
    }
    const bundled = await listBundledSkills();
    output.result({ skills: bundled });
    for (const name of bundled) output.log(name);
    return 0;
  }

  if (command === "snippets") {
    const { registry, problems, files } = await registryFor();
    if (rest[0] === "check") {
      const found = [...problems, ...checkProjectSnippets(registry)];
      output.result({ files, problems: found, valid: found.length === 0 });
      const project = registry.list().filter((entry) => entry.source === "project");
      output.log(`${project.length} project snippet(s) from ${files.length} file(s)`);
      for (const problem of found) output.log(`FAIL ${problem}`);
      if (found.length === 0) output.log("ok   every snippet is valid plugin code and small enough");
      return found.length === 0 ? 0 : 1;
    }
    output.result({ snippets: registry.list().map(({ name, description, kind, params, source }) => ({ name, description, kind, params, source })), problems, complete: problems.length === 0 });
    for (const entry of registry.list()) {
      output.log(`${entry.name.padEnd(14)} ${entry.kind === "write" ? "changes " : "reads   "} ${entry.source === "project" ? "[project] " : ""}${entry.description}`);
      for (const p of entry.params) output.log(`${"".padEnd(14)}   --param ${p.name}=<${p.type}>${p.required ? " (required)" : p.default !== undefined ? ` (default ${JSON.stringify(p.default)})` : ""}${p.description ? ` ${p.description}` : ""}`);
    }
    for (const problem of problems) output.error(`warning: ${problem}`);
    return 0;
  }
  if (command === "init") {
    const result = await init(root, { instance: values.instance, port: values.port ? Number(values.port) : undefined, gitignore: values.gitignore, external: values.external }, { local: cli.local });
    output.result({ createdConfig: result.createdConfig, createdSecrets: result.createdSecrets, instance: result.config.instance, files: result.files, gitignoreAdded: result.gitignoreAdded });
    if (isExternal(result.config)) {
      output.log(`${result.createdConfig ? "created" : "kept"} penpair.config.json (external Penpot at ${result.config.profile.origin})`);
      output.log("next: in Penpot switch on Account, Integrations, MCP Server and copy the address; open a design file and choose File, MCP Server, Connect; then run penpair connect (takes the address without showing it)");
      return 0;
    }
    output.log(`${result.createdConfig ? "created" : "kept"} penpair.config.json (instance ${result.config.instance}, Penpot ${result.config.penpotVersion}, port ${result.config.ports.frontend})`);
    output.log(`wrote ${result.config.directory}/docker-compose.yaml; secrets ${result.createdSecrets ? "generated" : "kept"} in ${result.config.directory}/.env`);
    if (!result.gitignoreAdded) output.log(`keep ${result.config.directory}/ out of git (add it to .gitignore, or run init with --gitignore)`);
    output.log("next: penpair up, then penpair connect");
    return 0;
  }
  /** Prints the checks one per line, or as JSON for scripts and agents. The key file check is added to both kinds of project. */
  async function report(checks: DoctorCheck[], mcp: unknown): Promise<number> {
    const keyCheck = await keyFileCheck(root, nodeRunner);
    const backupCheck = await backupNoteCheck(root, await loadCommandConfig(root));
    const all: DoctorCheck[] = [...checks, ...(!mcp ? [{ check: "editor and plugin", ok: false, detail: "No resolved project credential/connection; editor identity was not observed", remedy: "Configure the private credential source, connect the intended editor, then rerun doctor." }] : []), ...(keyCheck ? [keyCheck] : []), ...(backupCheck ? [backupCheck] : [])];
    const ok = all.every((check) => check.ok);
    if (values.json) {
      output.log(JSON.stringify({ ok, mcpConfigured: Boolean(mcp), file: all.find((check) => check.file)?.file, checks: all }, null, 2));
      return ok ? 0 : 1;
    }
    for (const check of all) output.log(`${check.warning ? "WARN" : check.ok ? "ok  " : "FAIL"} ${check.check}: ${check.detail}${"remedy" in check && check.remedy ? `\n       → ${check.remedy}` : ""}`);
    if (!mcp) output.log("skip editor and plugin: no key yet. Run `penpair connect`.");
    return ok ? 0 : 1;
  }
  if (command === "open") {
    if (rest.length) throw new CommandArgumentError("open accepts only --print for a URL preview");
    const config = await loadCommandConfig(root), url = values.print ? projectFileUrl(config) : await openProject(config, openInBrowser);
    output.result({ url, opened: !values.print }); if (!values.json) output.log(url); return 0;
  }
  if (command === "status") {
    if (rest.length) throw new CommandArgumentError("status accepts optional --adapters");
    const config = await loadCommandConfig(root);
    let endpoint: Awaited<ReturnType<typeof resolveEndpoint>> | undefined;
    try { endpoint = await projectEndpoint(root); commandRedactor(endpointRedactor(endpoint)); assertEndpointIsInstance(endpoint.description, config); }
    catch (error) { if (endpoint) throw error; }
    const report = await projectStatus(root, config, {
      ...(endpoint ? { connection: async () => guardFile(await connect(endpoint!), config.file, { mode: "strict" }), redact: endpointRedactor(endpoint) } : {}),
      ...(values.adapters ? { adapterStatus: async () => {
        const loaded = await loadAdapters(root, config.adapters ?? []); if (loaded.problems.length) throw new Error(loaded.problems.join("; "));
        const context = await adapterContext(root, []);
        return (await Promise.all(loaded.adapters.map(async a => a.status ? a.status(context) : [{ id: a.name, label: a.name, state: "unknown" as const, detail: "No status hook" }]))).flat();
      } } : {}),
    });
    let localState: unknown = null;
    if (!isExternal(config)) {
      if (cli.local) {
        const state = await cli.local.status({ root, config, runner: nodeRunner, log }); localState = state;
        report.lines.push({ id: "local-runtime", label: "Local containers", state: state.frontendReachable && state.backendReady ? "ok" : "failed", detail: `${state.url}; backend ${state.backendReady ? "ready" : "not ready"}` });
      } else report.lines.push({ id: "local-runtime", label: "Local containers", state: "unknown", detail: "Install the local-instance command package for container diagnostics" });
      report.complete = report.lines.every(line => line.state !== "unknown"); report.ok = report.complete && report.lines.every(line => line.state === "ok");
    }
    output.result({ ...report, localState }); if (!values.json) for (const line of report.lines) output.log(`${line.state.padEnd(7)} ${line.label}: ${line.detail}`);
    return report.lines.some(l => l.state === "failed") ? 1 : report.ok ? 0 : 3;
  }
  const lifecycle = new Set(["up", "down", "status", "doctor", "backup", "restore"]);
  if (lifecycle.has(command) && !(command === "backup" && rest[0] === "file")) {
    const project = await loadCommandConfig(root);
    if (isExternal(project) && command !== "doctor") requireLocal(project);
    if (isExternal(project)) {
      const mcp = await mcpProbeFor();
      return report(await doctorExternal(project, { mcp, timeoutMs: Number(values["timeout-ms"] ?? 5000) }), mcp);
    }
    const local = requireLocalProfile(cli.local);
    const c: LocalContext = { root, config: requireLocal(project), runner: nodeRunner, log };
    if (command === "up") {
      const result = await local.up(c);
      output.log(result.ready ? `Penpot is up at ${result.url}. Create an account and open a file, then run \`penpair connect\`.` : `The containers started but ${result.url} does not answer yet. Run \`penpair status\`.`);
      return result.ready ? 0 : 1;
    }
    if (command === "down") {
      await local.down(c);
      output.log("stopped; the data volumes are kept");
      return 0;
    }
    if (command === "status") {
      const state = await local.status(c);
      for (const s of state.services) output.log(`${s.state.padEnd(10)} ${s.service}${s.health ? ` (${s.health})` : ""}`);
      output.log(`${state.frontendReachable ? "answers" : "does not answer"} at ${state.url}; backend ${state.backendReady ? "ready" : "not ready"}`);
      return state.frontendReachable && state.backendReady ? 0 : 1;
    }
    if (command === "doctor") {
      const mcp = await mcpProbeFor();
      return report(await local.doctor(c, { mcp, timeoutMs: Number(values["timeout-ms"] ?? 5000) }), mcp);
    }
    if (command === "backup") {
      if (rest[0] === "verify") {
        if (!rest[1]) throw new Error("usage: penpair backup verify <backup directory>");
        const result = await local.verifyBackup(c, rest[1]);
        for (const check of result.checks) output.log(`${check.ok ? "ok  " : "FAIL"} ${check.check}: ${check.detail}`);
        return result.ok ? 0 : 1;
      }
      const result = await local.backup(c);
      output.log(`backup in ${result.directory} (${result.manifest.counts.files} files, ${result.manifest.counts.storageObjects} assets). It holds account data: never commit it.`);
      return 0;
    }
    if (command === "restore") {
      if (!rest[0]) throw new Error("usage: penpair restore <backup directory> --yes");
      const result = await local.restore(c, rest[0], { yes: values.yes === true });
      for (const check of result.checks) output.log(`${check.ok ? "ok  " : "FAIL"} ${check.check}: ${check.detail}`);
      if (result.safetyBackup) output.log(`safety backup of the previous data: ${result.safetyBackup}`);
      return result.ok ? 0 : 1;
    }
  }

  if (command === "run-file" && rest.length !== 1) throw new CommandArgumentError("run-file requires exactly one plugin body path");
  const projectConfig = values.standalone ? await loadOptionalConfig(root) : await loadCommandConfig(root);
  if (values.standalone && projectConfig) throw new ConfigError("--standalone cannot bypass a project configuration.");
  let preparedFile: Awaited<ReturnType<typeof prepareFileScript>> | undefined;
  if (command === "run-file") {
    const params: Record<string, string> = Object.create(null);
    for (const pair of values.param ?? []) { const at = pair.indexOf("="); if (at < 1) throw new CommandArgumentError("--param needs key=value"); const key = pair.slice(0, at); if (Object.hasOwn(params, key)) throw new CommandArgumentError("Duplicate script parameter: " + key); params[key] = pair.slice(at + 1); }
    const aliases = (values.include ?? []).filter(include => include.startsWith("@"));
    const kits = aliases.length ? await loadKits(root, aliases) : [];
    const virtualIncludes = Object.fromEntries(kits.map(value => [value.include, value.source]));
    preparedFile = await prepareFileScript(root, rest[0]!, { virtualIncludes, include: values.include, inspect: values.inspect, readback: values.readback, page: values.page, params });
    if (preparedFile.kind === "read" && values.apply) throw new CommandArgumentError("Read files do not require or accept --apply");
  }
  const endpoint = await projectEndpoint(root);
  commandRedactor(endpointRedactor(endpoint));
  if (projectConfig && !values["any-instance"]) assertEndpointIsInstance(endpoint.description, projectConfig);
  const guarded = async () => guardFile(await connect(endpoint), projectConfig?.file, {
    anyFile: values["any-file"] === true,
    mode: !commandProjects.getStore()?.strictFileGuard && (["pages", "tree", "audit", "tokens"].includes(command) || command === "probe" && !values.deep && !values.integrity) ? "warn" : "strict",
    warn: log,
  });
  if (command === "probe") {
    if (values.deep && !values.write) throw new Error("probe --deep creates a temporary board, a token set and two components in the open file and removes them again. Run it on a scratch file, with --write to confirm.");
    const capabilityReport = await probe(endpoint, guarded, { integrity: values.integrity === true });
    output.log(JSON.stringify(capabilityReport, null, 2));
    if (capabilityReport.integrity?.supported && capabilityReport.integrity.valid === false) return 1;
    if (values.deep) {
      const client = await guarded();
      try {
        const report = await runDeepCheck(client, { onWait: (m: string) => output.error(`… ${m}`) });
        const kitReport = values.kit && report.ok ? await runKitSmoke(client, root, { apply: true, onStep: log, redact: endpointRedactor(endpoint) }) : undefined;
        output.result({ ...report, ...(kitReport ? { kit: kitReport } : {}), capabilities: capabilityReport });
        output.log(`\n${formatDeepReport(report)}`);
        return report.ok && (!kitReport || kitReport.verified) ? 0 : 1;
      } finally {
        await client.close();
      }
    }
    return 0;
  }
  const client = await guarded();
  commandRedactor(endpointRedactor(endpoint));
  const options = { ...(values.layout ? { layout: { strategy: values.layout as import("./layout.js").LayoutStrategy } } : {}), signal: commandSignal(), redact: endpointRedactor(endpoint), onWait: (m: string) => output.error(`… ${m}`), onStep: (m: string) => output.error(`… ${m}`) };
  const writeOptions = (operation: string) => ({
    ...options, apply: values.apply === true, redact: (text: string) => redactEndpoint(text, endpoint),
    ...(values.apply ? { journal: {
      root, trace: values.trace === true, forceLock: values["force-lock"] === true, runId: values.resume, resume: Boolean(values.resume), requireCheckpoint: values.checkpoint === true,
      ...(values.checkpoint ? { checkpoint: (runId: string) => createCheckpoint(client, { label: operation, runId }, { apply: true }) } : {}),
    } } : {}),
  });
  try {
    if (command === "backup" && rest[0] === "file") {
      const out = rest[1];
      if (!out || !out.endsWith(".penpot")) throw new Error("usage: penpair backup file <new.penpot>");
      const archive = await exportFileArchive(client);
      if (archive.status !== "exported") { output.error(redactEndpoint(archive.message, endpoint)); return 1; }
      await atomicWriteFile(out, archive.bytes);
      output.log(JSON.stringify({ file: out, fileId: archive.fileId, revn: archive.revn, bytes: archive.bytes.length, sha256: archive.sha256, restoreVerified: false }, null, 2));
      output.error("Archive bytes saved. Restore is not verified: import into a scratch project and compare content and renders.");
      return 0;
    }
    if (command === "run-file") {
      const report = await runFileScript(client, preparedFile!, writeOptions("run-file"));
      output.log(JSON.stringify(report, null, 2));
      if (report.phase === "inspected") output.error("Nothing was written. Review the inspection, then use --apply.");
      return report.complete === false ? 3 : report.phase === "applied" && !report.verified ? 1 : 0;
    }
    if (command === "run") {
      const [name] = rest;
      if (!name) throw new Error("usage: penpair run <snippet> [--param key=value ...] [--apply]");
      const { registry, problems } = await registryFor(name);
      for (const problem of problems) output.error(`warning: ${problem}`);
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
      output.log(JSON.stringify(result, null, 2));
      if (entry.kind === "write" && !values.apply) output.error("Nothing was written. Run again with --apply to do it.");
      return (result as { verified?: boolean; phase?: string }).phase === "applied" && !(result as { verified?: boolean }).verified ? 1 : 0;
    }
    if (command === "baselines") {
      const config = (await loadCommandConfig(root)).baselines;
      if (!config) throw new Error('penpair.config.json has no "baselines" block. Add {"page": "<page>", "root": "tests/baselines", "frames": [{"frame": "<frame name>", "id": "<file name>", "route": "<route>"}]}; see docs/guide.md.');
      const report = await exportBaselines(client, root, config, { ...options, apply: values.apply === true, update: values.update === true, forceReason: values["force-reason"] });
      output.result(report);
      for (const r of report.results) output.log(`${r.status.padEnd(9)} ${r.id.padEnd(28)} ${r.frame}${r.imageWidth ? ` (${r.imageWidth}x${r.imageHeight})` : ""}${r.written ? "  written" : ""}`);
      for (const file of report.wrote) output.log(`wrote     ${file}`);
      const changed = report.results.filter((r) => r.status === "changed" && !r.written);
      if (!values.apply) output.error("Nothing was written. Run again with --apply to write new images.");
      if (changed.length > 0) output.error(`${changed.length} design(s) differ from the image in the folder. That is a change of the approved design: review it in Penpot, then run again with --apply --update to approve it.`);
      for (const row of report.coverage.rows) if (row.status !== "approved-design-intent") output.error(`coverage ${row.status}: ${row.requirement.route} ${row.requirement.theme}/${row.requirement.state} ${row.requirement.viewport.width}x${row.requirement.viewport.height}${row.reason ? ": " + row.reason : ""}`);
      if (!report.complete || report.coverage.configured && !report.coverage.designCasesComplete) return 3;
      return changed.length > 0 ? 2 : 0;
    }
    if (command === "audit" && (values.rules || projectConfig?.audit)) {
      if (!values.page || !projectConfig?.audit || rest.length || values.prefix || values.steps || values.ignore || values["token-source"]) throw new CommandArgumentError("Configured audit requires --page and explicit config rules, without legacy filters");
      const shapes = await captureInspection(client, { kind: "shape", shapeId: "@page-root", page: values.page, depth: 10000, maxNodes: 50000 });
      const tokens = projectConfig.audit.contrast ? await captureInspection(client, { kind: "tokens" }) : undefined;
      if (!shapes.complete || tokens && !tokens.complete) { output.result({ complete:false, reason:"Audit inspection incomplete" }); return 3; }
      const report = auditDesignRules(shapes as import("./inspection.js").InspectionDocument, projectConfig.audit, tokens as import("./inspection.js").InspectionDocument|undefined);
      output.result(report); output.log(JSON.stringify(report,null,2)); return report.complete ? 0 : 3;
    }
    if (command === "pages") output.log(JSON.stringify(await runSnippet(client, pages(), options), null, 2));
    else if (command === "tree") {
      if (!values.page) throw new Error("--page is required");
      const record = await runOnPage(client, tree({ page: values.page, depth: values.depth ? Number(values.depth) : 3, limit:values.limit?Number(values.limit):400, namePrefix: values.prefix }), values.page, options);
      if (values.json) output.log(JSON.stringify(record));
      else output.log(((record.lines as string[]) ?? []).join("\n"));
      if (record.truncated === true) { output.error("Tree is a limited preview; use inspect --all for full text or narrow the tree scope."); return 3; }
    } else if (command === "audit") {
      if (!values.page || !values.prefix) throw new Error("--page and --prefix are required");
      const steps = values.steps ? values.steps.split(",").map(Number) : undefined;
      const record = await runOnPage(client, audit({ page: values.page, framePrefix: values.prefix, spacingSteps: steps, ignoreUnbound: list(values.ignore) }), values.page, options);
      output.log(JSON.stringify(record, null, 2));
      if (record.truncated===true) return 3;
    } else if (command === "snapshot") {
      const snapshot = await captureStructuralSnapshot(client, options);
      if (values.write) { const manifest = await writeStructuralSnapshot(root, values.out ?? "design/snapshots", snapshot, endpointRedactor(endpoint)); output.result(manifest); output.log(JSON.stringify(manifest, null, 2)); }
      else { output.result(snapshot); output.log(JSON.stringify(snapshot, null, 2)); }
      return 0;
    } else if (command === "approve") {
      if (rest.length || !values.page || !values.frame || values.write && (!values.note?.trim() || !values.by?.trim()) || !values.write && (values.note || values.by)) throw new CommandArgumentError("approve --page PAGE --frame ID [--case CASE_ID] previews evidence; --write requires --note exact-owner-words and --by identity");
      let intent: import("./baselines-config.js").BaselineCase | undefined;
      if (values.case) {
        const baseline = projectConfig?.baselines, wanted = baseline?.frames.find(f => f.id === values.case);
        if (!wanted?.case || baseline?.page !== values.page) throw new Error("Approval case must reference an explicitly configured frame on this page");
        const found = await findShapesByName(client, wanted.frame, values.page);
        if (found.matches.length !== 1 || found.matches[0]!.id !== values.frame) throw new Error("Approval frame ID does not match the configured case");
        intent = wanted.case;
      }
      const captured = await exportShapePng(client, values.frame, { ...options, page: values.page, stable: true });
      if (!captured.stable) throw new Error("Approval export did not stabilize");
      const sha256 = artifactSha(captured.png);
      const report = values.write ? await recordApproval(root, captured, { note: values.note!, by: values.by! }, intent, endpointRedactor(endpoint)) : { schemaVersion: 1, kind: "approval-candidate", capture: captured.capture, sha256, fingerprint: approvalFingerprint(captured.capture, sha256, intent), recorded: false };
      output.result(report); output.log(JSON.stringify(report, null, 2)); return 0;
    } else if (command === "spec") {
      const capture = await captureInspection(client, { shapeId: values.frame!, page: values.page!, kind: "shape" });
      if (!capture.complete || capture.kind !== "shape-inspection") { output.result(capture); return 3; }
      const mapping = values.map ? validateComponentMap(await readDesignJson(root, values.map, 1024 * 1024)) : emptyComponentMap;
      const spec = buildDesignSpec(capture as import("./inspection.js").InspectionDocument, mapping), markdown = renderDesignSpec(spec);
      if (values.out) await writeDesignSpec(root, values.out, markdown, endpointRedactor(endpoint));
      output.result(spec); if (!values.json) output.log(markdown); return 0;
    } else if (command === "inspect" || command === "tokens" && rest[0] === "dump") {
      const {query,budget}=inspectionRequest!;
      const result=values.cursor||command==="inspect"&&!values.all?await inspectChunk(client,query):await captureInspection(client,query,budget);
      const redact=endpointRedactor(endpoint),fragments=endpointRedactor(endpoint,true);
      let altered=redact(JSON.stringify(result))!==JSON.stringify(result);
      const chunks=result.kind==="inspection-chunk"?[result]:result.kind==="inspection-partial"?result.chunks:[];
      for(const chunk of chunks){const safe=fragments(chunk.chunk);if(safe!==chunk.chunk){altered=true;chunk.chunk=safe;}}
      if(altered){result.complete=false;Object.assign(result,{redacted:true,reason:"Output required credential redaction; source evidence is incomplete"});if("nextCursor" in result)result.nextCursor=null;}
      output.log(JSON.stringify(result,null,2));
      if (!result.complete) return 3;
      if (values.out) {const serialized=JSON.stringify(result,null,2)+"\n";const target=await resolveProjectOutput(root,values.out);await mkdir(path.dirname(target),{recursive:true});await atomicWriteFile(target,serialized,{replace:true});}
      return 0;
    } else if (command === "export") {
      const [shapeId, out] = values.name ? [undefined, rest[0]] : rest;
      if (!out || rest.length !== (values.name ? 1 : 2) || values.name && !values.page) throw new Error("usage: penpair export <shapeId> <out.png>, or export --name <exact-name> --page <name> <out.png>");
      const exportOptions = { ...options, page: values.page, scale: values.scale ? Number(values.scale) : 1 };
      const result = values.name ? await exportShapeByName(client, values.name, values.page!, exportOptions) : await exportShapePng(client, shapeId!, exportOptions);
      if (!result.stable) throw new PenpairError("incomplete-output", "Export did not stabilize; previous output was preserved");
      await atomicWriteFile(out, result.png, { replace: true });
      output.log(JSON.stringify({ file: out, bytes: result.png.length, stable: result.stable, exports: result.exports, layout: result.layout, capture: result.capture }, null, 2));
    } else if (command === "shots") {
      if (!values.page || rest.length) throw new Error("usage: penpair shots --page <name> [--prefix <prefix>] [--out design/shots]");
      const report = await captureShots(client, root, { page: values.page, prefix: values.prefix, out: values.out }, { ...options, scale: values.scale ? Number(values.scale) : 1 });
      output.log(JSON.stringify(report, null, 2));
      return report.complete ? 0 : 3;
    } else if (command === "tokens" && tokenEdit) {
      const report = await runOperation(client, tokenEditOperation, tokenEdit, writeOptions("tokens-edit"));
      output.log(JSON.stringify(report, null, 2));
      if (!values.apply) output.error("Nothing was written. Run again with --apply to execute this token edit.");
      return report.phase === "applied" && !report.verified ? 1 : 0;
    } else if (command === "archive") {
      if (!values.page || !values.name) throw new Error("--page and --name are required");
      const report = await runOperation(
        client,
        archiveOperation,
        { page: values.page, archiveName: values.name, keepPrefixes: list(values.keep), partPrefixes: list(values.parts), x: values.x ? Number(values.x) : 9000 },
        writeOptions("archive"),
      );
      output.log(JSON.stringify(report, null, 2));
      if (report.phase === "inspected") output.error("Nothing was written. Run again with --apply to do it.");
      return report.phase === "applied" && !report.verified ? 1 : 0;
    } else {
      output.log(usage(Boolean(cli.local), cli.adapters, cli.configuredAdapters));
      return 1;
    }
    return 0;
  } finally {
    await client.close();
  }
}

/** Runs one command of an adapter with a context that can reach the project's Penpot. */
async function adapterContext(root: string, args: string[]): Promise<AdapterContext> {
  const config = await loadCommandConfig(root);
  const rawConfig = await readRawConfig(root);
  let redact = (text: string) => redactEndpoint(text);
  const context: AdapterContext = {
    redact: (text) => redact(text),
    root,
    config,
    rawConfig,
    output,
    log: (message) => output.error(`… ${message}`),
    async withPenpot(work) {
      const endpoint = await projectEndpoint(root);
      redact = (text) => redactEndpoint(text, endpoint);
      commandRedactor(endpointRedactor(endpoint));
      assertEndpointIsInstance(endpoint.description, config);
      const client = guardFile(await connect(endpoint), config.file, { anyFile: args.includes("--any-file"), warn: context.log });
      try {
        return await work(client);
      } finally {
        await client.close();
      }
    },
  };
  return context;
}
async function runAdapterCommand(command: Adapter["commands"][number], root: string, args: string[]): Promise<number> {
  const context = await adapterContext(root, args);
  commandSignal()?.throwIfAborted();
  return command.run(context, args.filter((arg) => arg !== "--any-file"));
}

/** Runs the command line and returns the exit code. The `penpair` command calls it with nothing extra; a package that adds a way to run Penpot calls it with its profile. */
async function runCliInternal(argv: string[], options: CliOptions = {}): Promise<number> {
  try {
    const root = projectRoot();
    if (argv[0] === "onboard") {
      if (argv.slice(1).some((arg) => arg !== "--json")) throw new Error("usage: penpair onboard [--json]");
      const report = onboardingChecklist(await loadCommandConfig(root));
      if (argv.includes("--json")) output.log(JSON.stringify(report, null, 2));
      else {
        output.log(`Join ${report.project}: ${report.origin}`);
        if (report.fileUrl) output.log(`File: ${report.fileUrl}`);
        report.steps.forEach((step, index) => output.log(`${index + 1}. ${step}`));
        report.warnings.forEach((warning) => output.log(`Note: ${warning}`));
      }
      return 0;
    }
    if (argv[0] === "runs") {
      if (argv.filter((arg) => arg !== "--json").length > 2 || argv[1]?.startsWith("--") && argv[1] !== "--json") throw new Error("usage: penpair runs [run-id]");
      output.log(JSON.stringify(argv[1] && argv[1] !== "--json" ? await readJournal(root, argv[1]) : await listJournals(root), null, 2));
      return 0;
    }
    if (argv[0] === "config") {
      if (argv[1] === "schema" && argv.slice(2).every((arg) => arg === "--json")) {
        output.log(JSON.stringify(projectConfigSchema, null, 2));
        return 0;
      }
      if (argv[1] !== "check" || argv.slice(2).some((arg) => arg !== "--json"))
        throw new ConfigError("usage: penpair config check [--json] | penpair config schema");
      try {
        await loadCommandConfig(root);
      } catch (error) {
        if (!argv.includes("--json") || !(error instanceof ConfigError)) throw error;
        commandFailure(error);
        output.log(JSON.stringify({ valid: false, file: "penpair.config.json", error: { code: error.code, message: error.message } }));
        return 1;
      }
      output.log(argv.includes("--json") ? JSON.stringify({ valid: true, file: "penpair.config.json" }) : "ok   penpair.config.json is valid (extension settings are validated by their adapters)");
      return 0;
    }
    const raw = await readRawConfig(root);
    const specifiers = Array.isArray(raw.adapters) ? raw.adapters.filter((entry): entry is string => typeof entry === "string") : [];
    const [first] = argv;
    const builtIn = first === undefined || first.startsWith("--") || (reservedCommands as readonly string[]).includes(first);
    if (builtIn) return await main(argv, { ...options, configuredAdapters: specifiers });
    // Dynamic discovery is necessary only for a requested extension command; it executes trusted project modules.
    const loaded = options.adapters ? { adapters: options.adapters, problems: [] as string[] } : await loadAdapters(root, specifiers);
    const adapterCommand = loaded.adapters.flatMap((adapter) => adapter.commands).find((command) => command.name === first);
    if (adapterCommand) return await runAdapterCommand(adapterCommand, root, argv.slice(1));
    for (const problem of loaded.problems) output.error(`warning: ${problem}`);
    return await main(argv, { ...options, adapters: loaded.adapters, configuredAdapters: specifiers });
  } catch (error: unknown) {
    commandFailure(error);
    output.error(error instanceof PenpairError ? error.message : error instanceof ConfigError || error instanceof ConnectError || error instanceof LifecycleError || error instanceof RegistryError ? `penpair: ${error.message}` : `penpair: ${String((error as Error)?.message ?? error)}`);
    const value = error as { code?: string; outcome?: string };
    return value.code === "write-uncertain" || value.outcome === "uncertain" ? 4 : value.code === "incomplete-output" ? 3 : value.code === "cancelled" ? 130 : value.code === "deadline" ? 124 : 1;
  }
}


export async function runCommand(argv: string[], options: CliOptions & { signal?: AbortSignal } = {}): Promise<CommandResult> {
  const args = [...argv.filter((arg) => arg !== "--json"), "--json"];
  return collectCommand(args[0] ?? "help", async () => {
    if (["setup", "connect"].includes(argv[0] ?? "")) throw new Error("Interactive setup/connect require a terminal; run without --json and use doctor --json afterwards");
    return commandProjects.run({ root: path.resolve(options.root ?? projectRoot()), projectEndpointOnly: options.projectEndpointOnly, pinnedConfig: options.pinnedConfig, strictFileGuard: options.strictFileGuard }, () => runCliInternal(args, options));
  }, { signal: options.signal });
}

async function runCliBound(argv: string[], options: CliOptions = {}): Promise<number> {
  if (argv[0] === "mcp") {
    try {
      const parsed = parseCommandArgs({ args: argv.slice(1), allowPositionals: true, options: { root: { type: "string" }, "allow-writes": { type: "boolean" } } });
      if (!parsed.values.root || !path.isAbsolute(parsed.values.root) || parsed.positionals.length) throw new Error("mcp requires an explicit absolute --root PROJECT; optionally --allow-writes");
      const { serveMcp } = await import("./mcp-server.js");
      await serveMcp({ root: parsed.values.root, allowWrites: parsed.values["allow-writes"] === true, cli: options }); return 0;
    } catch (error) { console.error(redactEndpoint(String((error as Error).message))); return 1; }
  }
  const controller = new AbortController();
  const interrupt = () => controller.abort(new CommandInterruptedError("cancelled"));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const args = [...argv];
  const timeoutAt = args.indexOf("--timeout-ms");
  let invalidTimeout = false;
  if (timeoutAt !== -1) {
    const milliseconds = Number(args[timeoutAt + 1]);
    invalidTimeout = !Number.isInteger(milliseconds) || milliseconds < (args[0] === "doctor" ? 1000 : 1) || milliseconds > (args[0] === "doctor" ? 30000 : 1_800_000) || args.indexOf("--timeout-ms", timeoutAt + 1) !== -1;
    if (args[0] !== "doctor") args.splice(timeoutAt, 2);
    if (!invalidTimeout) timer = setTimeout(() => controller.abort(new CommandInterruptedError("deadline")), milliseconds);
  }
  const json = args.includes("--json");
  if (!json && ["setup", "connect"].includes(args[0] ?? "")) {
    if (timer) clearTimeout(timer);
    if (timeoutAt !== -1) { console.error("--timeout-ms is not supported for interactive setup/connect"); return 1; }
    return withCommandSignal(controller.signal, () => runCliInternal(args, options));
  }
  process.on("SIGINT", interrupt); process.on("SIGTERM", interrupt);
  try {
    if (invalidTimeout) {
      const result = await collectCommand(args[0] ?? "help", async () => { throw new Error("--timeout-ms must be one integer from 1 to 1800000"); });
      if (json) console.log(JSON.stringify(result, null, 2)); else console.error(result.errors[0]?.message);
      return result.exitCode;
    }
    return await withCommandSignal(controller.signal, async () => {
      if (!json) return runCliInternal(args, options);
      const result = await runCommand(args, { ...options, signal: controller.signal });
      console.log(JSON.stringify(result, null, 2));
      return result.exitCode;
    });
  } finally {
    if (timer) clearTimeout(timer);
    process.removeListener("SIGINT", interrupt); process.removeListener("SIGTERM", interrupt);
  }
}

export async function runCli(argv: string[], options: CliOptions = {}): Promise<number> {
  return commandProjects.run({ root: path.resolve(options.root ?? projectRoot()), projectEndpointOnly: options.projectEndpointOnly, pinnedConfig: options.pinnedConfig, strictFileGuard: options.strictFileGuard }, () => runCliBound(argv, options));
}
