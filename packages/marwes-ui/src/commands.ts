import { componentsCommand } from "./components.js";
import { runModeTrial } from "./mode-trial.js";
import { ownershipReport, readSyncAncestor, saveSyncAncestor } from "./ownership.js";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

import { parseCommandArgs, readDesignJson, atomicWriteFile, resolveProjectOutput, readJournalTarget, guardFile, resolveProjectInput, createCheckpoint, loadConfig, readRawConfig, type AdapterCommand, type AdapterContext, type PenpotToolClient } from "@penpair/core";
import { readMarwesSettings, type MarwesSettings } from "./config.js";
import { familyProblems, loadInstalledMarwes, type InstalledMarwes } from "./marwes.js";
import { applyPlan, compareToPenpot, describePlan, formatDrift, impactOf, planPush, readLive, type Drift } from "./penpot.js";
import { diffSnapshots, formatDiff, tokenSnapshotSchema, migrateTokenSnapshot, readSnapshot, writeSnapshot, type SnapshotDiff } from "./snapshot-file.js";
import { loadThemeInput } from "./theme-input.js";
import { buildSnapshot, type TokenSnapshot } from "./tokens.js";

const print = (context: AdapterContext, ...values: unknown[]): void => (context.output?.log ?? console.log)(...values);
const diagnostic = (context: AdapterContext, ...values: unknown[]): void => (context.output?.error ?? console.error)(...values);

const adapterVersion = (createRequire(import.meta.url)("../package.json") as { version: string }).version;

/** What the project's configuration, the installed Marwes and the project's themes say the Penpot tokens should be. */
export interface Expectation {
  settings: MarwesSettings;
  installed: InstalledMarwes;
  fresh: TokenSnapshot;
  problems: string[];
}

export async function computeExpectation(root: string, rawConfig: Record<string, unknown>, instance: string): Promise<Expectation> {
  const settings = readMarwesSettings(rawConfig, instance);
  const installed = await loadInstalledMarwes(await resolveProjectInput(root, settings.project));
  const [light, dark] = await Promise.all([settings.themes.light, settings.themes.dark].map((reference) => (reference ? loadThemeInput(root, reference) : undefined)));
  const fresh = buildSnapshot({
    core: installed.core,
    version: installed.version,
    name: settings.name,
    extras: settings.extras,
    project: { ...(light ? { light: light.input } : {}), ...(dark ? { dark: dark.input } : {}) },
    generatedBy: `@penpair/marwes-ui@${adapterVersion}`,
  });
  return { settings, installed, fresh, problems: familyProblems(installed) };
}

export interface SnapshotCheck {
  /** The committed snapshot equals what the installed Marwes and the themes give now. */
  current: boolean;
  committed?: TokenSnapshot;
  diff: SnapshotDiff;
  problems: string[];
  expectation: Expectation;
}

export async function checkSnapshotFor(root: string, rawConfig: Record<string, unknown>, instance: string): Promise<SnapshotCheck> {
  const expectation = await computeExpectation(root, rawConfig, instance);
  const committed = await readSnapshot(root, expectation.settings.snapshot);
  const diff = diffSnapshots(committed, expectation.fresh);
  const problems = [...expectation.problems];
  if (!committed) problems.push(`there is no snapshot yet at ${expectation.settings.snapshot}; run \`penpair marwes tokens snapshot --write\` and commit it`);
  return { current: !!committed && diff.identical && committed.hash === expectation.fresh.hash && expectation.problems.length === 0, committed, diff, problems, expectation };
}

/**
 * For a project's own test suite: resolves the project's penpair.config.json and checks that the committed Marwes token snapshot
 * is current, so that bumping Marwes or editing the theme without regenerating the snapshot fails a test.
 */
export async function checkTokenSnapshot(root: string): Promise<SnapshotCheck> {
  const config = await loadConfig(root);
  return checkSnapshotFor(root, await readRawConfig(root), config.instance);
}

const summary = (snapshot: TokenSnapshot): string => `Marwes ${snapshot.marwesVersion}, ${snapshot.sets.length} sets, ${snapshot.sets.reduce((n, s) => n + s.tokens.length, 0)} tokens, ${snapshot.hash.slice(0, 10)}`;

/** What the snapshot says it does not cover, so a reader is never left thinking everything Marwes provides is in Penpot. */
const coverage = (snapshot: TokenSnapshot): string | undefined => ((snapshot.unmapped ?? []).length > 0 ? `${snapshot.unmapped.length} Marwes variable(s) are not tokens: ${snapshot.unmapped.slice(0, 6).join(", ")}${snapshot.unmapped.length > 6 ? ", ..." : ""}` : undefined);

const flags = (args: string[]) =>
  parseCommandArgs({ args, allowPositionals: true, options: { from: { type: "string" }, ownership: { type: "string" }, resolved: { type: "boolean" }, page: { type: "string" }, out: { type: "string" }, overwrite: { type: "boolean" }, adopt: { type: "string" }, write: { type: "boolean" }, apply: { type: "boolean" }, prune: { type: "boolean" }, json: { type: "boolean" }, resume: { type: "string" }, checkpoint: { type: "boolean" }, "force-lock": { type: "boolean" } } });

const staleAdvice = "Run `penpair marwes tokens snapshot --write`, review the change in git, and commit it.";

async function snapshotCommand(context: AdapterContext, args: string[]): Promise<number> {
  const { values } = flags(args);
  const check = await checkSnapshotFor(context.root, context.rawConfig, context.config.instance);
  const fresh = check.expectation.fresh;
  if (values.json) print(context, JSON.stringify({ current: check.current, summary: summary(fresh), diff: check.diff, problems: check.problems }, null, 2));
  else {
    print(context, `Expected from the installed ${summary(fresh)}`);
    for (const line of formatDiff(check.diff)) print(context, `  ${line}`);
    if (coverage(fresh)) print(context, `note ${coverage(fresh)}`);
    for (const problem of check.problems.filter((p) => !p.startsWith("there is no snapshot"))) print(context, `FAIL ${problem}`);
  }
  if (check.expectation.problems.length > 0) return 1;
  if (check.current) {
    if (!values.json) print(context, `ok   ${check.expectation.settings.snapshot} is current`);
    return 0;
  }
  if (!values.write) {
    if (!values.json) print(context, `${check.committed ? "The committed snapshot is stale." : "There is no snapshot yet."} Run again with --write to save ${check.expectation.settings.snapshot}.`);
    return 2;
  }
  await writeSnapshot(context.root, check.expectation.settings.snapshot, fresh);
  context.output?.result({ current: true, snapshot: check.expectation.settings.snapshot, hash: fresh.hash, written: true });
  if (!values.json) print(context, `wrote ${check.expectation.settings.snapshot}. Review the change in git and commit it; then \`penpair marwes tokens diff\` shows what Penpot needs.`);
  return 0;
}

async function checkCommand(context: AdapterContext, args: string[]): Promise<number> {
  const { values } = flags(args);
  const check = await checkSnapshotFor(context.root, context.rawConfig, context.config.instance);
  if (values.json) {
    print(context, JSON.stringify({ current: check.current, installed: check.expectation.installed.versions, diff: check.diff, problems: check.problems }, null, 2));
    return check.current ? 0 : check.expectation.problems.length > 0 ? 1 : 2;
  }
  if (check.current) {
    print(context, `ok   ${check.expectation.settings.snapshot} is current (${summary(check.expectation.fresh)})`);
    return 0;
  }
  for (const line of formatDiff(check.diff)) print(context, `  ${line}`);
  for (const problem of check.problems) print(context, `FAIL ${problem}`);
  if (check.committed && check.expectation.problems.length === 0) {
    const cause = check.committed.marwesVersion !== check.expectation.installed.version ? `it was made from Marwes ${check.committed.marwesVersion} and the installed Marwes is ${check.expectation.installed.version}` : "the installed Marwes or the project's theme has changed since it was made";
    print(context, `FAIL the committed snapshot is stale: ${cause}. ${staleAdvice}`);
  }
  return check.expectation.problems.length > 0 ? 1 : 2;
}

async function readPenpot(context: AdapterContext, committed: TokenSnapshot, wantImpact: boolean): Promise<{ drift: Drift; impact?: Record<string, number>; live: Awaited<ReturnType<typeof readLive>>; target: Awaited<ReturnType<typeof readJournalTarget>> }> {
  return context.withPenpot(async (client: PenpotToolClient) => {
    const target = await readJournalTarget(client);
    const pinned = guardFile(client, { id: target.fileId });
    const live = await readLive(pinned);
    const after = await readJournalTarget(pinned);
    if (after.fileId !== target.fileId || after.revision !== target.revision) throw new Error("File changed during token inspection; inspect again");
    const ancestor = await readSyncAncestor(context.root, target.fileId);
    const drift = compareToPenpot(committed, live, { ancestor });
    return { target, live, drift, ...(wantImpact && !drift.inSync ? { impact: await impactOf(pinned).catch(() => undefined) } : {}) };
  });
}

async function diffCommand(context: AdapterContext, args: string[]): Promise<number> {
  const { values } = flags(args);
  if (values.resolved) return modeCommand(context, args);
  const check = await checkSnapshotFor(context.root, context.rawConfig, context.config.instance);
  if (!check.committed) {
    diagnostic(context, `FAIL ${check.problems.join("; ")}`);
    return 1;
  }
  const { drift, impact } = await readPenpot(context, check.committed, true);
  if (values.json) {
    print(context, JSON.stringify({ snapshotCurrent: check.current, drift, impact }, null, 2));
    return drift.inSync ? 0 : 2;
  }
  if (!check.current) print(context, `note: the committed snapshot is stale against the installed Marwes (${staleAdvice}); the comparison below is against the committed one.`);
  if (drift.inSync) {
    for (const line of formatDrift(drift, impact)) print(context, `note preserved: ${line}`);
    print(context, `ok   Penpot matches ${summary(check.committed)}`);
    return 0;
  }
  print(context, values.resume ? `Resuming run ${values.resume}; current snapshot: ${summary(check.committed)}` : `Penpot differs from ${summary(check.committed)}:`);
  for (const line of formatDrift(drift, impact)) print(context, `  ${line}`);
  print(context, "`penpair marwes tokens push --apply` brings Penpot to the snapshot (designer edits require explicit adoption or overwrite).");
  return 2;
}

async function modeCommand(context: AdapterContext, args: string[], frameId?: string): Promise<number> {
  const { values } = flags(args);
  if ((values.resume || values.checkpoint || values["force-lock"]) && !values.apply) throw new Error("Mode resume/checkpoint/force-lock require --apply");
  if (frameId && (!values.page || !values.out)) throw new Error("verify-modes requires one frame ID, --page and --out");
  if (values.out) await resolveProjectOutput(context.root, values.out);
  const check = await checkSnapshotFor(context.root, context.rawConfig, context.config.instance);
  if (!check.committed || !check.current) { diagnostic(context, "Mode verification requires a current committed snapshot. " + staleAdvice); return 2; }
  const report = await context.withPenpot(client => runModeTrial(client, check.committed!, {
    root: context.root, apply: values.apply === true, resume: values.resume, forceLock: values["force-lock"] === true, redact: context.redact, onStep: context.log,
    requireCheckpoint: values.checkpoint === true,
    ...(values.checkpoint ? { checkpoint: runId => createCheckpoint(client, { label: "mode trial", runId }, { apply: true }) } : {}),
    ...(frameId ? { frame: { id: frameId, page: values.page!, out: values.out! } } : {}),
  }));
  context.output?.result(report); print(context, JSON.stringify(report, null, 2));
  if (!values.apply) { diagnostic(context, "Mode checks temporarily change active selection. Inspect planned states, then use --apply; the full original selection will be restored and verified separately."); return 0; }
  return report.uncertain ? 4 : !report.restoration.verified ? 1 : !report.complete ? 3 : report.verified ? 0 : 2;
}

async function pushCommand(context: AdapterContext, args: string[]): Promise<number> {
  const { values } = flags(args);
  if ((values.resume || values.checkpoint || values["force-lock"]) && !values.apply) throw new Error("Resume/checkpoint require --apply; inspect the journal and current design first");
  const check = await checkSnapshotFor(context.root, context.rawConfig, context.config.instance);
  if (!check.committed) {
    diagnostic(context, `FAIL ${check.problems.join("; ")}`);
    return 1;
  }
  if (!check.current) {
    for (const line of formatDiff(check.diff)) print(context, `  ${line}`);
    diagnostic(context, `STOP the committed snapshot is stale against the installed Marwes or the theme, and the repository's record must lead. ${staleAdvice} Then push.`);
    return 2;
  }
  const { drift, impact, live, target } = await readPenpot(context, check.committed, true);
  if (values.adopt && (values.apply || values.overwrite || values.resume)) throw new Error("--adopt writes a local review proposal and cannot be combined with apply/overwrite/resume");
  const ancestor = await readSyncAncestor(context.root, target.fileId);
  const ownership = ownershipReport(check.committed, live, ancestor);
  if (values.adopt) {
    const proposal = JSON.stringify({ schemaVersion: 1, kind: "token-adoption-proposal", fileId: target.fileId, snapshotHash: check.committed.hash, ownership, live, instructions: "Review live values and declare intentional changes in project themes/extras; regenerate the snapshot. This proposal changes no design or ownership ancestor." }, null, 2) + "\n";
    if (context.redact && context.redact(proposal) !== proposal) throw new Error("Adoption evidence requires credential redaction; no proposal was published");
    const out = await resolveProjectOutput(context.root, values.adopt); await mkdir(path.dirname(out), { recursive: true }); await atomicWriteFile(out, proposal);
    context.output?.result({ phase: "adoption-proposed", file: values.adopt, ownership, complete: false });
    print(context, "Saved adoption proposal. Review declarations and regenerate the snapshot before pushing; no Penpot write or ancestor update occurred.");
    return 3;
  }
  const plan = planPush(check.committed, live, { prune: values.prune === true, ancestor });
  if (ownership.blockers.length && !values.overwrite && !values.resume) {
    context.output?.result({ phase: "conflict", ownership, plan, verified: false });
    diagnostic(context, `STOP ${ownership.blockers.length} designer/conflicting/untracked token properties need a decision. Use --adopt <new-file.json> for a local review proposal, or inspect --overwrite and explicitly apply it.`);
    return 2;
  }
  if (drift.inSync && plan.length === 0 && !values.resume) {
    const evidence = JSON.stringify(check.committed); if (context.redact && context.redact(evidence) !== evidence) throw new Error("Sync evidence requires credential redaction");
    if (values.apply) await saveSyncAncestor(context.root, target.fileId, check.committed, ancestor);
    context.output?.result({ verified: true, unchanged: true, drift, ownership });
    print(context, `ok   Penpot already matches ${summary(check.committed)}; nothing to write`);
    return 0;
  }
  print(context, values.resume ? `Resuming run ${values.resume}; current snapshot: ${summary(check.committed)}` : `Penpot differs from ${summary(check.committed)}:`);
  for (const line of formatDrift(drift, impact)) print(context, `  ${line}`);
  print(context, "Plan:");
  for (const line of describePlan(plan)) print(context, `  ${line}`);
  if (!values.apply) {
    context.output?.result({ phase: "inspected", ownership, plan, drift, snapshotCurrent: check.current, verified: false });
    print(context, "Nothing was written. Run again with --apply to do it.");
    if (!values.prune && drift.sets.some((s) => s.tokens.some((t) => t.kind === "extra")) ) print(context, "Tokens without a verified ownership ancestor are preserved, including with --prune.");
    return 0;
  }
  const report = await context.withPenpot((client) => applyPlan(client, check.committed!, plan, (message) => context.log(message), {
    prune: values.prune === true, ancestor, expectedFileId: target.fileId, expectedLive: live,
    journal: { root: context.root, forceLock: values["force-lock"] === true, runId: values.resume, resume: Boolean(values.resume), redact: context.redact, requireCheckpoint: values.checkpoint === true,
      ...(values.checkpoint ? { checkpoint: (runId) => createCheckpoint(client, { label: "token push", runId }, { apply: true }) } : {}),
    },
  }));
  context.output?.result(report);
  for (const step of report.steps) print(context, `done ${step}`);
  if (report.verified) {
    const evidence = JSON.stringify(check.committed); if (context.redact && context.redact(evidence) !== evidence) throw new Error("Sync evidence requires credential redaction");
    await saveSyncAncestor(context.root, target.fileId, check.committed, ancestor);
    print(context, `ok   verified: Penpot now matches the snapshot and no shape moved or was rebound (${report.structureAfter.count} shapes unchanged)`);
    return 0;
  }
  if (!report.structureUnchanged) diagnostic(context, `FAIL the shapes changed while pushing tokens (${report.structureBefore.hash} -> ${report.structureAfter.hash}); look at the file before going on`);
  for (const line of formatDrift(report.drift)) diagnostic(context, `FAIL still different: ${line}`);
  return 1;
}

async function statusCommand(context: AdapterContext, args: string[]): Promise<number> {
  const { values } = flags(args);
  const check = await checkSnapshotFor(context.root, context.rawConfig, context.config.instance);
  const lines: string[] = [];
  let code = 0;
  lines.push(`Marwes installed: ${Object.entries(check.expectation.installed.versions).map(([n, v]) => `${n} ${v}`).join(", ")}`);
  for (const problem of check.expectation.problems) {
    lines.push(`FAIL ${problem}`);
    code = 1;
  }
  lines.push(check.committed ? `Snapshot (${check.expectation.settings.snapshot}): ${summary(check.committed)}` : `Snapshot: none yet (${check.expectation.settings.snapshot})`);
  lines.push(check.current ? "ok   the snapshot is current against the installed Marwes and the theme" : `FAIL the snapshot is stale or missing. ${staleAdvice}`);
  if (!check.current && code === 0) code = 2;
  let drift: Drift | undefined;
  if (check.committed) {
    try {
      drift = (await readPenpot(context, check.committed, false)).drift;
      lines.push(drift.inSync ? "ok   Penpot matches the snapshot" : `FAIL Penpot differs from the snapshot (${drift.sets.reduce((n, s) => n + s.tokens.length, 0)} token(s), ${drift.themes.length} theme(s)); see \`penpair marwes tokens diff\``);
      if (!drift.inSync && code === 0) code = 2;
    } catch (error) {
      if (code === 0) code = 3;
      lines.push(`skip Penpot: not checked (${String((error as Error).message).split("\n")[0]})`);
    }
  }
  if (values.json) print(context, JSON.stringify({ installed: check.expectation.installed.versions, snapshotCurrent: check.current, penpotInSync: drift?.inSync ?? null, complete: Boolean(drift), exit: code }, null, 2));
  else for (const line of lines) print(context, line);
  return code;
}

export const marwesCommand: AdapterCommand = {
  name: "marwes",
  summary: "Marwes tokens in Penpot, and drift from the installed Marwes",
  usage: [
    "penpair marwes tokens schema | migrate --from FILE --ownership FILE [--out NEW_FILE]   schema and explicit legacy migration",
    "penpair marwes tokens snapshot [--write]       build the expected Penpot tokens from the installed Marwes and your theme; --write saves the snapshot",
    "penpair marwes tokens check [--json]           offline, for CI: is the committed snapshot current? (exit 2 when stale)",
    "penpair marwes tokens diff [--json]            Penpot against the snapshot: missing, changed, added by hand, and what each change reaches",
    "penpair marwes tokens push [--apply] [--prune] inspect reconciliation; --apply writes, --overwrite resolves value conflicts, --prune removes owned retired tokens; --adopt FILE proposes local declarations",
    "penpair marwes tokens diff --resolved [--apply] verify actual values in isolated themes and restore the complete original selection",
    "penpair marwes tokens verify-modes ID --page PAGE --out DIR [--apply] capture stable per-mode PNG evidence and restore selection",
    "penpair marwes components snapshot [--write] | check [--measure] | diff — explicit three-component measurement pilot; native generation gated",
    "penpair marwes tokens status                   one screen: installed Marwes, snapshot, Penpot",
  ],
  async run(context, args) {
    const [area, sub, ...rest] = args;
    if (area === "components") return componentsCommand(context, args.slice(1));
    if (area !== "tokens" || !sub) {
      diagnostic(context, `usage:\n  ${marwesCommand.usage.join("\n  ")}`);
      return 1;
    }
    if (sub === "schema") {
      if (rest.some(value => value !== "--json")) throw new Error("tokens schema accepts only --json");
      context.output?.result(tokenSnapshotSchema); print(context, JSON.stringify(tokenSnapshotSchema, null, 2)); return 0;
    }
    if (sub === "migrate") {
      const { values, positionals } = flags(rest);
      if (positionals.length || !values.from || !values.ownership || Object.keys(values).some(k => !["from", "ownership", "out", "json"].includes(k))) throw new Error("tokens migrate --from LEGACY_JSON --ownership SET_OWNERS_JSON [--out NEW_FILE]");
      const migrated = migrateTokenSnapshot(await readDesignJson(context.root, values.from), await readDesignJson(context.root, values.ownership) as Record<string, "adapter" | "project">);
      if (values.out) { const target = await resolveProjectOutput(context.root, values.out); await mkdir(path.dirname(target), { recursive: true }); await atomicWriteFile(target, JSON.stringify(migrated, null, 2) + "\n"); }
      context.output?.result(migrated); print(context, JSON.stringify(migrated, null, 2)); return 0;
    }
    const commands: Record<string, (c: AdapterContext, a: string[]) => Promise<number>> = { snapshot: snapshotCommand, check: checkCommand, diff: diffCommand, push: pushCommand, status: statusCommand, "verify-modes": (context, args) => modeCommand(context, args, flags(args).positionals[0]) };
    const run = commands[sub];
    if (!run) {
      diagnostic(context, `unknown: penpair marwes tokens ${sub}\nusage:\n  ${marwesCommand.usage.join("\n  ")}`);
      return 1;
    }
    const parsed = flags(rest);
    const allowed = new Set(["json", ...(sub === "snapshot" ? ["write"] : sub === "push" ? ["apply", "prune", "resume", "checkpoint", "force-lock", "overwrite", "adopt"] : sub === "diff" ? ["resolved", "apply", "resume", "checkpoint", "force-lock"] : sub === "verify-modes" ? ["page", "out", "apply", "resume", "checkpoint", "force-lock"] : [])]);
    if (sub === "verify-modes" ? parsed.positionals.length !== 1 : parsed.positionals.length) throw new Error("Unexpected positional arguments after the token subcommand");
    for (const key of Object.keys(parsed.values)) if (!allowed.has(key)) throw new Error(`--${key} is not supported by tokens ${sub}`);
    if (sub === "diff" && !parsed.values.resolved && [parsed.values.apply, parsed.values.resume, parsed.values.checkpoint, parsed.values["force-lock"]].some(Boolean)) throw new Error("Mode write flags require diff --resolved");
    return run(context, rest);
  },
};
