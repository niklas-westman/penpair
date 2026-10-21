import { createRequire } from "node:module";
import path from "node:path";
import { parseArgs } from "node:util";
import { createCheckpoint, loadConfig, readRawConfig, type AdapterCommand, type AdapterContext, type PenpotToolClient } from "@penpair/core";
import { readMarwesSettings, type MarwesSettings } from "./config.js";
import { familyProblems, loadInstalledMarwes, type InstalledMarwes } from "./marwes.js";
import { applyPlan, compareToPenpot, describePlan, formatDrift, impactOf, planPush, readLive, type Drift } from "./penpot.js";
import { diffSnapshots, formatDiff, readSnapshot, writeSnapshot, type SnapshotDiff } from "./snapshot-file.js";
import { loadThemeInput } from "./theme-input.js";
import { buildSnapshot, type TokenSnapshot } from "./tokens.js";

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
  const installed = await loadInstalledMarwes(path.resolve(root, settings.project));
  const [light, dark] = await Promise.all([settings.themes.light, settings.themes.dark].map((reference) => (reference ? loadThemeInput(root, reference) : undefined)));
  const fresh = buildSnapshot({
    core: installed.core,
    version: installed.version,
    name: settings.name,
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
  parseArgs({ args, allowPositionals: true, options: { write: { type: "boolean" }, apply: { type: "boolean" }, prune: { type: "boolean" }, json: { type: "boolean" }, resume: { type: "string" }, checkpoint: { type: "boolean" }, "force-lock": { type: "boolean" } } });

const staleAdvice = "Run `penpair marwes tokens snapshot --write`, review the change in git, and commit it.";

async function snapshotCommand(context: AdapterContext, args: string[]): Promise<number> {
  const { values } = flags(args);
  const check = await checkSnapshotFor(context.root, context.rawConfig, context.config.instance);
  const fresh = check.expectation.fresh;
  if (values.json) console.log(JSON.stringify({ current: check.current, summary: summary(fresh), diff: check.diff, problems: check.problems }, null, 2));
  else {
    console.log(`Expected from the installed ${summary(fresh)}`);
    for (const line of formatDiff(check.diff)) console.log(`  ${line}`);
    if (coverage(fresh)) console.log(`note ${coverage(fresh)}`);
    for (const problem of check.problems.filter((p) => !p.startsWith("there is no snapshot"))) console.log(`FAIL ${problem}`);
  }
  if (check.expectation.problems.length > 0) return 1;
  if (check.current) {
    if (!values.json) console.log(`ok   ${check.expectation.settings.snapshot} is current`);
    return 0;
  }
  if (!values.write) {
    if (!values.json) console.log(`${check.committed ? "The committed snapshot is stale." : "There is no snapshot yet."} Run again with --write to save ${check.expectation.settings.snapshot}.`);
    return 2;
  }
  await writeSnapshot(context.root, check.expectation.settings.snapshot, fresh);
  if (!values.json) console.log(`wrote ${check.expectation.settings.snapshot}. Review the change in git and commit it; then \`penpair marwes tokens diff\` shows what Penpot needs.`);
  return 0;
}

async function checkCommand(context: AdapterContext, args: string[]): Promise<number> {
  const { values } = flags(args);
  const check = await checkSnapshotFor(context.root, context.rawConfig, context.config.instance);
  if (values.json) {
    console.log(JSON.stringify({ current: check.current, installed: check.expectation.installed.versions, diff: check.diff, problems: check.problems }, null, 2));
    return check.current ? 0 : check.expectation.problems.length > 0 ? 1 : 2;
  }
  if (check.current) {
    console.log(`ok   ${check.expectation.settings.snapshot} is current (${summary(check.expectation.fresh)})`);
    return 0;
  }
  for (const line of formatDiff(check.diff)) console.log(`  ${line}`);
  for (const problem of check.problems) console.log(`FAIL ${problem}`);
  if (check.committed && check.expectation.problems.length === 0) {
    const cause = check.committed.marwesVersion !== check.expectation.installed.version ? `it was made from Marwes ${check.committed.marwesVersion} and the installed Marwes is ${check.expectation.installed.version}` : "the installed Marwes or the project's theme has changed since it was made";
    console.log(`FAIL the committed snapshot is stale: ${cause}. ${staleAdvice}`);
  }
  return check.expectation.problems.length > 0 ? 1 : 2;
}

async function readPenpot(context: AdapterContext, committed: TokenSnapshot, wantImpact: boolean): Promise<{ drift: Drift; impact?: Record<string, number>; live: Awaited<ReturnType<typeof readLive>> }> {
  return context.withPenpot(async (client: PenpotToolClient) => {
    const live = await readLive(client);
    const drift = compareToPenpot(committed, live);
    return { live, drift, ...(wantImpact && !drift.inSync ? { impact: await impactOf(client).catch(() => undefined) } : {}) };
  });
}

async function diffCommand(context: AdapterContext, args: string[]): Promise<number> {
  const { values } = flags(args);
  const check = await checkSnapshotFor(context.root, context.rawConfig, context.config.instance);
  if (!check.committed) {
    console.error(`FAIL ${check.problems.join("; ")}`);
    return 1;
  }
  const { drift, impact } = await readPenpot(context, check.committed, true);
  if (values.json) {
    console.log(JSON.stringify({ snapshotCurrent: check.current, drift, impact }, null, 2));
    return drift.inSync ? 0 : 2;
  }
  if (!check.current) console.log(`note: the committed snapshot is stale against the installed Marwes (${staleAdvice}); the comparison below is against the committed one.`);
  if (drift.inSync) {
    console.log(`ok   Penpot matches ${summary(check.committed)}`);
    return 0;
  }
  console.log(values.resume ? `Resuming run ${values.resume}; current snapshot: ${summary(check.committed)}` : `Penpot differs from ${summary(check.committed)}:`);
  for (const line of formatDrift(drift, impact)) console.log(`  ${line}`);
  console.log("`penpair marwes tokens push --apply` brings Penpot to the snapshot (Marwes is authoritative: a value changed by hand in Penpot is put back).");
  return 2;
}

async function pushCommand(context: AdapterContext, args: string[]): Promise<number> {
  const { values } = flags(args);
  if ((values.resume || values.checkpoint || values["force-lock"]) && !values.apply) throw new Error("Resume/checkpoint require --apply; inspect the journal and current design first");
  const check = await checkSnapshotFor(context.root, context.rawConfig, context.config.instance);
  if (!check.committed) {
    console.error(`FAIL ${check.problems.join("; ")}`);
    return 1;
  }
  if (!check.current) {
    for (const line of formatDiff(check.diff)) console.log(`  ${line}`);
    console.error(`STOP the committed snapshot is stale against the installed Marwes or the theme, and the repository's record must lead. ${staleAdvice} Then push.`);
    return 2;
  }
  const { drift, impact, live } = await readPenpot(context, check.committed, true);
  const plan = planPush(check.committed, live, { prune: values.prune === true });
  if (drift.inSync && plan.length === 0 && !values.resume) {
    console.log(`ok   Penpot already matches ${summary(check.committed)}; nothing to write`);
    return 0;
  }
  console.log(values.resume ? `Resuming run ${values.resume}; current snapshot: ${summary(check.committed)}` : `Penpot differs from ${summary(check.committed)}:`);
  for (const line of formatDrift(drift, impact)) console.log(`  ${line}`);
  console.log("Plan:");
  for (const line of describePlan(plan)) console.log(`  ${line}`);
  if (!values.apply) {
    console.log("Nothing was written. Run again with --apply to do it.");
    if (!values.prune && drift.sets.some((s) => s.tokens.some((t) => t.kind === "extra")) ) console.log("Tokens added by hand are kept unless you add --prune.");
    return 0;
  }
  const report = await context.withPenpot((client) => applyPlan(client, check.committed!, plan, (message) => context.log(message), {
    prune: values.prune === true, expectedLive: live,
    journal: { root: context.root, forceLock: values["force-lock"] === true, runId: values.resume, resume: Boolean(values.resume), redact: context.redact, requireCheckpoint: values.checkpoint === true,
      ...(values.checkpoint ? { checkpoint: (runId) => createCheckpoint(client, { label: "token push", runId }, { apply: true }) } : {}),
    },
  }));
  for (const step of report.steps) console.log(`done ${step}`);
  if (report.verified) {
    console.log(`ok   verified: Penpot now matches the snapshot and no shape moved or was rebound (${report.structureAfter.count} shapes unchanged)`);
    return 0;
  }
  if (!report.structureUnchanged) console.error(`FAIL the shapes changed while pushing tokens (${report.structureBefore.hash} -> ${report.structureAfter.hash}); look at the file before going on`);
  for (const line of formatDrift(report.drift)) console.error(`FAIL still different: ${line}`);
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
      lines.push(`skip Penpot: not checked (${String((error as Error).message).split("\n")[0]})`);
    }
  }
  if (values.json) console.log(JSON.stringify({ installed: check.expectation.installed.versions, snapshotCurrent: check.current, penpotInSync: drift?.inSync ?? null, exit: code }, null, 2));
  else for (const line of lines) console.log(line);
  return code;
}

export const marwesCommand: AdapterCommand = {
  name: "marwes",
  summary: "Marwes tokens in Penpot, and drift from the installed Marwes",
  usage: [
    "penpair marwes tokens snapshot [--write]       build the expected Penpot tokens from the installed Marwes and your theme; --write saves the snapshot",
    "penpair marwes tokens check [--json]           offline, for CI: is the committed snapshot current? (exit 2 when stale)",
    "penpair marwes tokens diff [--json]            Penpot against the snapshot: missing, changed, added by hand, and what each change reaches",
    "penpair marwes tokens push [--apply] [--prune] bring Penpot to the snapshot (looks first; --apply writes; --prune also removes what is not expected)",
    "penpair marwes tokens status                   one screen: installed Marwes, snapshot, Penpot",
  ],
  async run(context, args) {
    const [area, sub, ...rest] = args;
    if (area !== "tokens" || !sub) {
      console.error(`usage:\n  ${marwesCommand.usage.join("\n  ")}`);
      return 1;
    }
    const commands: Record<string, (c: AdapterContext, a: string[]) => Promise<number>> = { snapshot: snapshotCommand, check: checkCommand, diff: diffCommand, push: pushCommand, status: statusCommand };
    const run = commands[sub];
    if (!run) {
      console.error(`unknown: penpair marwes tokens ${sub}\nusage:\n  ${marwesCommand.usage.join("\n  ")}`);
      return 1;
    }
    return run(context, rest);
  },
};
