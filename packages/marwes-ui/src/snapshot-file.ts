import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { atomicWriteFile, resolveProjectInput, resolveProjectOutput } from "@penpair/core";
import { canonical, type PenpotToken, type TokenSnapshot } from "./tokens.js";

export async function readSnapshot(root: string, file: string): Promise<TokenSnapshot | undefined> {
  try {
    const snapshot = JSON.parse(await readFile(await resolveProjectInput(root, file), "utf8")) as TokenSnapshot;
    if (![1, 2].includes(snapshot.schemaVersion) || !Array.isArray(snapshot.sets) || !Array.isArray(snapshot.themes) || typeof snapshot.hash !== "string" || typeof snapshot.project !== "string") throw new Error("Unsupported or malformed snapshot; regenerate with tokens snapshot --write");
    if (snapshot.schemaVersion === 2 && (!snapshot.ownership || Object.keys(snapshot.ownership).length !== snapshot.sets.length || snapshot.sets.some(set => !["adapter", "project"].includes(snapshot.ownership?.[set.name] ?? "")))) throw new Error("Invalid schema-2 set ownership");
    return snapshot;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new Error(`${file} is not a readable snapshot: ${String((error as Error).message)}`);
  }
}

export async function writeSnapshot(root: string, file: string, snapshot: TokenSnapshot): Promise<void> {
  const target = await resolveProjectOutput(root, file);
  await mkdir(path.dirname(target), { recursive: true });
  await atomicWriteFile(target, `${JSON.stringify(snapshot, null, 2)}\n`, { replace: true });
}

export interface TokenChange {
  name: string;
  before: string;
  after: string;
}

export interface SetChange {
  set: string;
  /** The whole set is new or gone. */
  setAdded?: boolean;
  setRemoved?: boolean;
  added: string[];
  removed: string[];
  changed: TokenChange[];
}

export interface SnapshotDiff {
  identical: boolean;
  versionChange?: { before: string; after: string };
  sets: SetChange[];
  themes: { added: string[]; removed: string[]; changed: { theme: string; before: string[]; after: string[] }[] };
  /** Marwes variables that are not tokens, and that appeared or disappeared since the other snapshot. */
  unmapped: { added: string[]; removed: string[] };
}

const show = (token: PenpotToken): string => (typeof token.value === "string" ? token.value : canonical(token.value));

/** What differs between two expectations: the Marwes version, then set by set which tokens were added, removed or changed. */
export function diffSnapshots(before: TokenSnapshot | undefined, after: TokenSnapshot): SnapshotDiff {
  const sets: SetChange[] = [];
  const previous = new Map((before?.sets ?? []).map((s) => [s.name, s]));
  const next = new Map(after.sets.map((s) => [s.name, s]));
  for (const [name, set] of next) {
    const old = previous.get(name);
    const oldTokens = new Map((old?.tokens ?? []).map((t) => [t.name, t]));
    const newTokens = new Map(set.tokens.map((t) => [t.name, t]));
    const change: SetChange = {
      set: name,
      ...(old ? {} : { setAdded: true }),
      added: [...newTokens.keys()].filter((n) => !oldTokens.has(n)),
      removed: [...oldTokens.keys()].filter((n) => !newTokens.has(n)),
      changed: [...newTokens.entries()].filter(([n, t]) => oldTokens.has(n) && show(oldTokens.get(n)!) !== show(t)).map(([n, t]) => ({ name: n, before: show(oldTokens.get(n)!), after: show(t) })),
    };
    if (change.setAdded || change.added.length || change.removed.length || change.changed.length) sets.push(change);
  }
  for (const [name, old] of previous) if (!next.has(name)) sets.push({ set: name, setRemoved: true, added: [], removed: old.tokens.map((t) => t.name), changed: [] });
  const oldThemes = new Map((before?.themes ?? []).map((t) => [`${t.group}/${t.name}`, t.sets]));
  const newThemes = new Map(after.themes.map((t) => [`${t.group}/${t.name}`, t.sets]));
  const themes = {
    added: [...newThemes.keys()].filter((k) => !oldThemes.has(k)),
    removed: [...oldThemes.keys()].filter((k) => !newThemes.has(k)),
    changed: [...newThemes.entries()].filter(([k, s]) => oldThemes.has(k) && canonical(oldThemes.get(k)) !== canonical(s)).map(([k, s]) => ({ theme: k, before: oldThemes.get(k)!, after: s })),
  };
  const wasUnmapped = new Set(before?.unmapped ?? []);
  const isUnmapped = new Set(after.unmapped ?? []);
  const unmapped = { added: [...isUnmapped].filter((v) => !wasUnmapped.has(v)), removed: [...wasUnmapped].filter((v) => !isUnmapped.has(v)) };
  const versionChange = before && before.marwesVersion !== after.marwesVersion ? { before: before.marwesVersion, after: after.marwesVersion } : undefined;
  const identical = !!before && !versionChange && sets.length === 0 && !themes.added.length && !themes.removed.length && !themes.changed.length && !unmapped.added.length && !unmapped.removed.length;
  return { identical, ...(versionChange ? { versionChange } : {}), sets, themes, unmapped };
}

/** A short, readable account of a diff for the terminal; long lists are cut with a count. */
export function formatDiff(diff: SnapshotDiff, limit = 8): string[] {
  const lines: string[] = [];
  if (diff.versionChange) lines.push(`Marwes ${diff.versionChange.before} -> ${diff.versionChange.after}`);
  const cut = (items: string[]): string => (items.length > limit ? `${items.slice(0, limit).join(", ")} and ${items.length - limit} more` : items.join(", "));
  for (const s of diff.sets) {
    if (s.setAdded) lines.push(`${s.set}: new set with ${s.added.length} tokens`);
    else if (s.setRemoved) lines.push(`${s.set}: set no longer expected (${s.removed.length} tokens)`);
    else {
      if (s.added.length) lines.push(`${s.set}: ${s.added.length} added: ${cut(s.added)}`);
      if (s.removed.length) lines.push(`${s.set}: ${s.removed.length} removed: ${cut(s.removed)}`);
      if (s.changed.length) lines.push(`${s.set}: ${s.changed.length} changed: ${cut(s.changed.map((c) => `${c.name} ${c.before} -> ${c.after}`))}`);
    }
  }
  if (diff.unmapped.added.length) lines.push(`NEW Marwes variables that are not tokens (the design file does not know them yet; review, then extend the adapter or accept): ${cut(diff.unmapped.added)}`);
  if (diff.unmapped.removed.length) lines.push(`Marwes variables that are no longer provided: ${cut(diff.unmapped.removed)}`);
  for (const t of diff.themes.added) lines.push(`theme ${t}: new`);
  for (const t of diff.themes.removed) lines.push(`theme ${t}: no longer expected`);
  for (const t of diff.themes.changed) lines.push(`theme ${t.theme}: sets ${t.before.join(" + ")} -> ${t.after.join(" + ")}`);
  return lines;
}
