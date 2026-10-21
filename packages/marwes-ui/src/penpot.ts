import { guardRevision, writeCoordinator, runSnippet, snippet, guardFile, observationHash, readJournal, readJournalTarget, runJournaledSteps, type JournalOptions, type JournalStep, type PenpotToolClient, type Snippet } from "@penpair/core";
import { canonical, normalizeValue, type PenpotToken, type PenpotTokenSet, type TokenSnapshot } from "./tokens.js";
import { actionSatisfied, reconcileAction, remainingAction } from "./reconciliation.js";

/** What the Penpot file holds today. */
export interface LiveTokens {
  sets: { order: number; name: string; active: boolean; tokens: { name: string; type: string; value: unknown; description: string }[] }[];
  themes: { group: string; name: string; active: boolean; sets: string[] }[];
}

export function readTokens(): Snippet {
  return snippet(
    "marwes-tokens-read",
    `const tokens = penpot.library.local.tokens;
const set = (s, i) => ({ order: i, name: s.name, active: !!s.active, tokens: s.tokens.map((t) => ({ name: t.name, type: t.type, value: t.value, description: t.description || "" })) });
return { ok: true, readOnly: true, sets: tokens.sets.map(set),
  themes: tokens.themes.map((t) => ({ group: t.group, name: t.name, active: !!t.active, sets: (t.activeSets || []).map((x) => (typeof x === "string" ? x : x.name)) })) };`,
  );
}

/** How many shapes use each token, over every page: what a change of a token would reach. */
export function bindingCounts(): Snippet {
  return snippet(
    "marwes-tokens-bindings",
    `const counts = {}; let shapes = 0;
const visit = (s) => { shapes++; const b = s.tokens; if (b && typeof b === "object") for (const key of Object.keys(b)) { const name = b[key]; if (typeof name === "string") counts[name] = (counts[name] || 0) + 1; } (s.children || []).forEach(visit); };
for (const page of penpot.currentFile.pages) (page.root.children || []).forEach(visit);
return { ok: true, readOnly: true, shapes, counts };`,
  );
}

/** A hash of everything structural on every page (ids, kinds, geometry, which tokens are bound), not of colours: pushing tokens must not move or rebind a shape. */
export function structureFingerprint(): Snippet {
  return snippet(
    "marwes-tokens-structure",
    `const cyrb = (text) => { let h1 = 0xdeadbeef, h2 = 0x41c6ce57; for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); } h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909); h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909); return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16); };
const rows = []; const round = (n) => (typeof n === "number" ? Math.round(n * 100) / 100 : n);
const visit = (page, s) => { rows.push([page, s.id, s.type, s.name, round(s.x), round(s.y), round(s.width), round(s.height), JSON.stringify(s.tokens || {})].join("|")); (s.children || []).forEach((c) => visit(page, c)); };
for (const page of penpot.currentFile.pages) (page.root.children || []).forEach((c) => visit(page.name, c));
return { ok: true, readOnly: true, count: rows.length, hash: cyrb(rows.join("\\n")) };`,
  );
}

export type TokenDrift =
  | { name: string; kind: "missing" }
  | { name: string; kind: "extra" }
  | { name: string; kind: "value"; expected: string; actual: string }
  | { name: string; kind: "type"; expected: string; actual: string }
  | { name: string; kind: "description"; expected: string; actual: string };

export interface SetDrift {
  set: string;
  missing?: true;
  tokens: TokenDrift[];
}

export interface ThemeDrift {
  theme: string;
  missing?: true;
  missingSets: string[];
  extraSets: string[];
}

export interface Drift {
  inSync: boolean;
  sets: SetDrift[];
  themes: ThemeDrift[];
  /** Sets in the file that look like ones this adapter manages but are not in the expectation. */
  unexpectedSets: string[];
}

const display = (type: string, value: unknown): string => {
  const normal = normalizeValue(type, value);
  return normal.length > 90 ? `${normal.slice(0, 87)}...` : normal;
};

/** Compares the committed expectation with what the file holds. Only the sets the expectation names are judged; other sets are the project's own. */
export function compareToPenpot(expected: TokenSnapshot, live: LiveTokens): Drift {
  const sets: SetDrift[] = [];
  for (const wanted of expected.sets) {
    const found = live.sets.find((s) => s.name === wanted.name);
    if (!found) {
      sets.push({ set: wanted.name, missing: true, tokens: wanted.tokens.map((t) => ({ name: t.name, kind: "missing" as const })) });
      continue;
    }
    const tokens: TokenDrift[] = [];
    const have = new Map(found.tokens.map((t) => [t.name, t]));
    const want = new Map(wanted.tokens.map((t) => [t.name, t]));
    for (const token of wanted.tokens) {
      const actual = have.get(token.name);
      if (!actual) tokens.push({ name: token.name, kind: "missing" });
      else if (actual.type !== token.type) tokens.push({ name: token.name, kind: "type", expected: token.type, actual: actual.type });
      else if (normalizeValue(token.type, token.value) !== normalizeValue(actual.type, actual.value)) tokens.push({ name: token.name, kind: "value", expected: display(token.type, token.value), actual: display(actual.type, actual.value) });
      else if (token.description !== actual.description) tokens.push({ name: token.name, kind: "description", expected: token.description, actual: actual.description });
    }
    for (const name of have.keys()) if (!want.has(name)) tokens.push({ name, kind: "extra" });
    if (tokens.length > 0) sets.push({ set: wanted.name, tokens });
  }
  const themes: ThemeDrift[] = [];
  for (const wanted of expected.themes) {
    const found = live.themes.find((t) => t.group === wanted.group && t.name === wanted.name);
    if (!found) {
      themes.push({ theme: `${wanted.group}/${wanted.name}`, missing: true, missingSets: wanted.sets, extraSets: [] });
      continue;
    }
    const missingSets = wanted.sets.filter((s) => !found.sets.includes(s));
    const extraSets = found.sets.filter((s) => !wanted.sets.includes(s));
    if (missingSets.length || extraSets.length) themes.push({ theme: `${wanted.group}/${wanted.name}`, missingSets, extraSets });
  }
  const managed = new Set(expected.sets.map((s) => s.name));
  const looksManaged = (name: string): boolean => name.startsWith("Marwes · ") || name === `${expected.project} · Light` || name === `${expected.project} · Dark`;
  const unexpectedSets = live.sets.map((s) => s.name).filter((name) => looksManaged(name) && !managed.has(name));
  return { inSync: sets.length === 0 && themes.length === 0 && unexpectedSets.length === 0, sets, themes, unexpectedSets };
}

export function formatDrift(drift: Drift, impact?: Record<string, number>, limit = 6): string[] {
  const lines: string[] = [];
  const used = (name: string): string => (impact && impact[name] ? ` (used by ${impact[name]} shape${impact[name] === 1 ? "" : "s"})` : "");
  for (const s of drift.sets) {
    if (s.missing) {
      lines.push(`${s.set}: missing in Penpot (${s.tokens.length} tokens)`);
      continue;
    }
    const missing = s.tokens.filter((t) => t.kind === "missing");
    const extra = s.tokens.filter((t) => t.kind === "extra");
    const changed = s.tokens.filter((t): t is Extract<TokenDrift, { kind: "value" | "type" }> => t.kind === "value" || t.kind === "type");
    const described = s.tokens.filter((t) => t.kind === "description");
    const cut = (items: string[]): string => (items.length > limit ? `${items.slice(0, limit).join("; ")}; and ${items.length - limit} more` : items.join("; "));
    if (missing.length) lines.push(`${s.set}: ${missing.length} missing in Penpot: ${cut(missing.map((t) => t.name))}`);
    if (changed.length) lines.push(`${s.set}: ${changed.length} differ from the expectation: ${cut(changed.map((t) => `${t.name} is ${t.actual}, expected ${t.expected}${used(t.name)}`))}`);
    if (extra.length) lines.push(`${s.set}: ${extra.length} not in the expectation (added by hand?): ${cut(extra.map((t) => t.name))}`);
    if (described.length) lines.push(`${s.set}: ${described.length} carry an old description (the recorded Marwes version): ${cut(described.map((t) => t.name))}`);
  }
  for (const t of drift.themes) {
    if (t.missing) lines.push(`theme ${t.theme}: missing in Penpot`);
    else lines.push(`theme ${t.theme}: ${t.missingSets.length ? `lacks ${t.missingSets.join(", ")}` : ""}${t.missingSets.length && t.extraSets.length ? "; " : ""}${t.extraSets.length ? `also has ${t.extraSets.join(", ")}` : ""}`);
  }
  for (const name of drift.unexpectedSets) lines.push(`set ${name}: in Penpot but no longer expected`);
  return lines;
}

export type Action =
  | { kind: "createSet"; set: string }
  | { kind: "addTokens"; set: string; tokens: PenpotToken[] }
  | { kind: "updateTokens"; set: string; tokens: PenpotToken[] }
  | { kind: "replaceTokens"; set: string; tokens: PenpotToken[] }
  | { kind: "removeTokens"; set: string; names: string[] }
  | { kind: "createTheme"; group: string; name: string; sets: string[] }
  | { kind: "syncThemeSets"; group: string; name: string; add: string[]; remove: string[] }
  | { kind: "activateTheme"; group: string; name: string };

export interface PlanOptions {
  /** Also remove what Penpot has but the expectation does not (tokens added by hand, sets no longer expected, extra sets in a theme). */
  prune?: boolean;
}

/** The writes that bring the file to the expectation. Nothing in a set the expectation does not name is ever touched. */
export function planPush(expected: TokenSnapshot, live: LiveTokens, options: PlanOptions = {}): Action[] {
  const drift = compareToPenpot(expected, live);
  const actions: Action[] = [];
  const wantedSet = new Map(expected.sets.map((s) => [s.name, s]));
  for (const s of drift.sets) {
    const wanted = wantedSet.get(s.set) as PenpotTokenSet;
    if (s.missing) {
      actions.push({ kind: "createSet", set: s.set }, { kind: "addTokens", set: s.set, tokens: wanted.tokens });
      continue;
    }
    const byName = new Map(wanted.tokens.map((t) => [t.name, t]));
    const add = s.tokens.filter((t) => t.kind === "missing").map((t) => byName.get(t.name)!);
    // A typography value assigned in place is stored un-normalised by Penpot, so those are removed and added again.
    const typed = s.tokens.filter((t) => t.kind === "type" || ((t.kind === "value" || t.kind === "description") && byName.get(t.name)?.type === "typography")).map((t) => byName.get(t.name)!);
    const replace = [...new Map(typed.map((t) => [t.name, t])).values()];
    const replaced = new Set(replace.map((t) => t.name));
    const update = s.tokens.filter((t) => (t.kind === "value" || t.kind === "description") && !replaced.has(t.name)).map((t) => byName.get(t.name)!);
    if (add.length) actions.push({ kind: "addTokens", set: s.set, tokens: add });
    if (update.length) actions.push({ kind: "updateTokens", set: s.set, tokens: update });
    if (replace.length) actions.push({ kind: "replaceTokens", set: s.set, tokens: replace });
    const extra = s.tokens.filter((t) => t.kind === "extra").map((t) => t.name);
    if (options.prune && extra.length) actions.push({ kind: "removeTokens", set: s.set, names: extra });
  }
  const createdThemes = new Set<string>();
  for (const t of drift.themes) {
    const [group, name] = t.theme.split("/") as [string, string];
    if (t.missing) {
      actions.push({ kind: "createTheme", group, name, sets: expected.themes.find((x) => x.group === group && x.name === name)!.sets });
      createdThemes.add(name);
    } else actions.push({ kind: "syncThemeSets", group, name, add: t.missingSets, remove: options.prune ? t.extraSets : [] });
  }
  // A file that has no active theme gets Light, so the tokens take part in resolution; a file that already has one keeps its choice.
  if (createdThemes.size > 0 && !live.themes.some((t) => t.active)) {
    const first = expected.themes.find((t) => t.name === "Light") ?? expected.themes[0];
    if (first && createdThemes.has(first.name)) actions.push({ kind: "activateTheme", group: first.group, name: first.name });
  }
  return actions.filter((a) => a.kind !== "syncThemeSets" || a.add.length > 0 || a.remove.length > 0);
}

const batchSize = 40;
const maxBatchBytes = 45 * 1024;

/** Splits a long token list into batches that stay well under the request limit. */
export function inBatches(tokens: PenpotToken[]): PenpotToken[][] {
  const batches: PenpotToken[][] = [];
  let current: PenpotToken[] = [];
  let bytes = 0;
  for (const token of tokens) {
    const size = JSON.stringify(token).length;
    if (current.length >= batchSize || (bytes + size > maxBatchBytes && current.length > 0)) {
      batches.push(current);
      current = [];
      bytes = 0;
    }
    current.push(token);
    bytes += size;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

const findSet = `const found = penpot.library.local.tokens.sets.filter((s) => s.name === CFG.set);
if (found.length !== 1) throw new Error("set missing or ambiguous: " + CFG.set);
const set = found[0];`;

function actionSnippet(action: Action, tokens?: PenpotToken[]): Snippet {
  switch (action.kind) {
    case "createSet":
      return snippet("marwes-create-set", `const t = penpot.library.local.tokens;
if (t.sets.some((s) => s.name === CFG.set)) return { ok: true, existed: true };
const set = t.addSet({ name: CFG.set });
// A new set must not take part in resolution before a theme says so.
if (set.active) set.toggleActive();
return { ok: true, active: !!set.active };`, { set: action.set });
    case "addTokens":
      return snippet("marwes-add-tokens", `${findSet}
const failed = [];
for (const t of CFG.tokens) {
  try { if (set.tokens.some((x) => x.name === t.name)) { failed.push(t.name + ": already there"); continue; } set.addToken({ type: t.type, name: t.name, value: t.value, description: t.description || "" }); }
  catch (error) { failed.push(t.name + ": " + String(error && error.message || error).slice(0, 120)); }
}
return { ok: true, done: CFG.tokens.length - failed.length, failed };`, { set: action.set, tokens });
    case "updateTokens":
      return snippet("marwes-update-tokens", `${findSet}
const failed = [];
for (const t of CFG.tokens) {
  const found = set.tokens.filter((x) => x.name === t.name);
  if (found.length !== 1) { failed.push(t.name + ": not found or ambiguous"); continue; }
  try { found[0].value = t.value; found[0].description = t.description || ""; } catch (error) { failed.push(t.name + ": " + String(error && error.message || error).slice(0, 120)); }
}
return { ok: true, done: CFG.tokens.length - failed.length, failed };`, { set: action.set, tokens });
    case "replaceTokens":
      return snippet("marwes-replace-tokens", `${findSet}
const failed = [];
for (const t of CFG.tokens) {
  try {
    const old = set.tokens.filter((x) => x.name === t.name);
    if (old.length > 1) { failed.push(t.name + ": ambiguous"); continue; }
    if (old.length === 1) old[0].remove();
    set.addToken({ type: t.type, name: t.name, value: t.value, description: t.description || "" });
  } catch (error) { failed.push(t.name + ": " + String(error && error.message || error).slice(0, 120)); }
}
return { ok: true, done: CFG.tokens.length - failed.length, failed };`, { set: action.set, tokens });
    case "removeTokens":
      return snippet("marwes-remove-tokens", `${findSet}
const failed = [];
for (const name of CFG.names) {
  const found = set.tokens.filter((x) => x.name === name);
  if (found.length !== 1) { failed.push(name + ": not found or ambiguous"); continue; }
  try { found[0].remove(); } catch (error) { failed.push(name + ": " + String(error && error.message || error).slice(0, 120)); }
}
return { ok: true, done: CFG.names.length - failed.length, failed };`, { set: action.set, names: action.names });
    case "createTheme":
      return snippet("marwes-create-theme", `const t = penpot.library.local.tokens;
if (t.themes.some((x) => x.name === CFG.name && x.group === CFG.group)) throw new Error("theme exists: " + CFG.name);
const theme = t.addTheme({ group: CFG.group, name: CFG.name });
for (const name of CFG.sets) { const s = t.sets.filter((x) => x.name === name); if (s.length !== 1) throw new Error("set missing or ambiguous: " + name); theme.addSet(s[0]); }
return { ok: true, sets: (theme.activeSets || []).map((x) => x.name) };`, { group: action.group, name: action.name, sets: action.sets });
    case "syncThemeSets":
      return snippet("marwes-sync-theme", `const t = penpot.library.local.tokens;
const theme = t.themes.filter((x) => x.name === CFG.name && x.group === CFG.group);
if (theme.length !== 1) throw new Error("theme missing or ambiguous: " + CFG.name);
const pick = (name) => { const s = t.sets.filter((x) => x.name === name); if (s.length !== 1) throw new Error("set missing or ambiguous: " + name); return s[0]; };
for (const name of CFG.add) theme[0].addSet(pick(name));
for (const name of CFG.remove) theme[0].removeSet(pick(name));
return { ok: true, sets: (theme[0].activeSets || []).map((x) => x.name) };`, { group: action.group, name: action.name, add: action.add, remove: action.remove });
    case "activateTheme":
      return snippet("marwes-activate-theme", `const t = penpot.library.local.tokens;
if (t.themes.some((x) => x.active)) return { ok: true, alreadyActive: true };
const theme = t.themes.filter((x) => x.name === CFG.name && x.group === CFG.group);
if (theme.length !== 1) throw new Error("theme missing or ambiguous: " + CFG.name);
theme[0].toggleActive();
return { ok: true, active: !!theme[0].active };`, { group: action.group, name: action.name });
  }
}

export interface ApplyReport {
  journal?: { runId: string; state: string };
  steps: string[];
  structureBefore: { count: number; hash: string };
  structureAfter: { count: number; hash: string };
  structureUnchanged: boolean;
  drift: Drift;
  verified: boolean;
}

const describeAction = (action: Action, count?: number): string => {
  switch (action.kind) {
    case "createSet": return `create set ${action.set}`;
    case "addTokens": return `add ${count ?? action.tokens.length} token(s) to ${action.set}`;
    case "updateTokens": return `update ${count ?? action.tokens.length} token(s) in ${action.set}`;
    case "replaceTokens": return `replace ${count ?? action.tokens.length} token(s) in ${action.set}`;
    case "removeTokens": return `remove ${action.names.length} token(s) from ${action.set}`;
    case "createTheme": return `create theme ${action.group}/${action.name}`;
    case "syncThemeSets": return `theme ${action.group}/${action.name}: add ${action.add.length}, remove ${action.remove.length} set(s)`;
    case "activateTheme": return `activate theme ${action.name}`;
  }
};

export const describePlan = (actions: Action[]): string[] => actions.map((a) => describeAction(a));

export async function readLive(client: PenpotToolClient): Promise<LiveTokens> {
  const record = await runSnippet(client, readTokens(), { effect: "read" });
  if (record.ok !== true || !Array.isArray(record.sets) || !Array.isArray(record.themes))
    throw new Error("Token readback did not provide explicit sets and themes; synchronization is not verified");
  return { sets: record.sets as LiveTokens["sets"], themes: record.themes as LiveTokens["themes"] };
}

/**
 * Carries out the plan one write at a time, stopping at the first anomaly, then reads everything back: the file must now match the
 * expectation, and no shape may have moved or been rebound.
 */
export async function applyPlan(client: PenpotToolClient, expected: TokenSnapshot, actions: Action[], onStep?: (message: string) => void, options: { prune?: boolean; expectedLive?: LiveTokens; journal?: Omit<JournalOptions, "input" | "operation" | "payload" | "target"> } = {}): Promise<ApplyReport> {
  if (options.journal) client = guardFile(client, { id: (await readJournalTarget(client)).fileId });
  const fingerprint = async (): Promise<{ count: number; hash: string }> => {
    const r = await runSnippet(client, structureFingerprint(), { effect: "read" });
    if (r.ok !== true || !Number.isInteger(r.count) || Number(r.count) < 0 || typeof r.hash !== "string" || !r.hash)
      throw new Error("Structure readback did not provide a count and hash; nothing can be verified");
    return { count: Number(r.count), hash: String(r.hash) };
  };
  const structureBefore = await fingerprint();
  if (options.journal) {
    const target = await readJournalTarget(client);
    const guarded = guardFile(client, { id: target.fileId });
    let originalStructure = structureBefore;
    if (options.journal.resume) {
      if (!options.journal.runId) throw new Error("Resume requires a run ID");
      const prior = await readJournal(options.journal.root, options.journal.runId);
      const payload = prior.payload as { actions?: Action[]; structure?: typeof structureBefore } | undefined;
      if (!payload || !Array.isArray(payload.actions) || !payload.structure || typeof payload.structure.hash !== "string") throw new Error("Token journal has no original action/structure plan");
      actions = payload.actions;
      originalStructure = payload.structure;
    }
    if (structureBefore.hash !== originalStructure.hash) throw new Error("Shapes changed since the token run began; reconcile the design before resuming");
    const baseline = { live: await readLive(guarded), structure: structureBefore };
    if (!options.journal.resume && options.expectedLive && observationHash(options.expectedLive) !== observationHash(baseline.live)) throw new Error("Token source changed since the CLI plan; inspect again before writing");
    const work = actions.flatMap<Action>((action) => "tokens" in action ? inBatches(action.tokens).map((tokens) => ({ ...action, tokens })) : [action]);
    const record = await runJournaledSteps(work.map<JournalStep<typeof baseline>>((action, index) => ({
      key: `step-${index}-${observationHash(action).slice(0, 12)}`, label: describeAction(action), signature: [actionSnippet(action, "tokens" in action ? action.tokens : undefined).code, actionSatisfied.toString(), reconcileAction.toString(), remainingAction.toString()].join("\n"),
      initial: baseline,
      inspect: async () => ({ live: await readLive(guarded), structure: await fingerprint() }),
      apply: async (current, target) => {
        const residual = remainingAction(action, current.live);
        if (!residual) return { ok: true, reconciled: true };
        const mutation = actionSnippet(residual, "tokens" in residual ? residual.tokens : undefined);
        const sourceGuard = `{ const observed = await (async () => { ${readTokens().code} })();
if (JSON.stringify({sets:observed.sets, themes:observed.themes}) !== ${JSON.stringify(JSON.stringify(current.live))}) return {ok:false, message:"Token source changed before mutation"}; }\n`;
        return runSnippet(guardRevision(guarded, target), { ...mutation, code: sourceGuard + mutation.code }, { effect: "write" });
      },
      verify: (current) => current.structure.hash === originalStructure.hash && actionSatisfied(action, current.live),
      reconcile: (before, current) => current.structure.hash !== originalStructure.hash ? "conflict" : reconcileAction(action, before.live, current.live),
    })), { ...options.journal, coordinate: writeCoordinator(guarded, { root: options.journal.root, operation: "tokens-push", forceLock: options.journal.forceLock, warn: onStep }), operation: "tokens-push", input: { snapshot: observationHash(expected), prune: options.prune === true }, payload: { actions, structure: originalStructure }, target: () => readJournalTarget(guarded), onStep,
      finalVerify: async () => compareToPenpot(expected, await readLive(guarded)).inSync && (await fingerprint()).hash === originalStructure.hash,
    });
    const structureAfter = await fingerprint();
    const drift = compareToPenpot(expected, await readLive(guarded));
    return { steps: record.steps.map((step) => step.label), structureBefore: originalStructure, structureAfter, structureUnchanged: originalStructure.hash === structureAfter.hash, drift, verified: drift.inSync && originalStructure.hash === structureAfter.hash, journal: { runId: record.runId, state: record.state } };
  }
  const steps: string[] = [];
  for (const action of actions) {
    const work: (PenpotToken[] | undefined)[] = "tokens" in action ? inBatches(action.tokens) : [undefined];
    for (const batch of work) {
      const message = describeAction(action, batch?.length);
      onStep?.(message);
      const result = await runSnippet(client, actionSnippet(action, batch), { effect: "write" });
      const failed = (result.failed as string[] | undefined) ?? [];
      if (failed.length > 0) throw new Error(`${message}: ${failed.join(" | ")}. Nothing after this was written.`);
      steps.push(message);
    }
  }
  const structureAfter = await fingerprint();
  const drift = compareToPenpot(expected, await readLive(client));
  return { steps, structureBefore, structureAfter, structureUnchanged: structureBefore.hash === structureAfter.hash, drift, verified: drift.inSync && structureBefore.hash === structureAfter.hash };
}

/** The use count of every token a drift would change, so a bump can be judged by what it reaches. */
export async function impactOf(client: PenpotToolClient): Promise<Record<string, number>> {
  const record = await runSnippet(client, bindingCounts(), { effect: "read" });
  return record.counts as Record<string, number>;
}

export { canonical };
