import { createHash } from "node:crypto";
import { mkdir, open, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import {
  atomicWriteFile,
  ensureGitignoreEntry,
  resolveProjectInput,
  resolveProjectOutput,
} from "@penpair/core";
import type { Action, LiveTokens } from "./penpot.js";
import { canonical, normalizeValue, type TokenSnapshot } from "./tokens.js";

export interface OwnershipChange {
  set: string;
  name: string;
  property: string;
  kind: "upstream" | "designer" | "conflict" | "untracked";
  ancestor: unknown;
  desired: unknown;
  live: unknown;
}
export interface OwnershipReport {
  changes: OwnershipChange[];
  blockers: OwnershipChange[];
  unmanagedSets: string[];
  unmanagedTokens: {
    set: string;
    name: string;
  }[];
}
const tokenMap = (
  sets: {
    name: string;
    tokens: {
      name: string;
      type: string;
      value: unknown;
      description: string;
    }[];
  }[],
) =>
  new Map(
    sets.map((set) => [
      set.name,
      new Map(
        set.tokens.map((token) => [
          token.name,
          token,
        ]),
      ),
    ]),
  );
const values = (
  token:
    | {
        type: string;
        value: unknown;
        description: string;
      }
    | undefined,
): Record<string, unknown> =>
  token
    ? {
        type: token.type,
        value: normalizeValue(token.type, token.value),
        description: token.description || "",
      }
    : {
        type: null,
        value: null,
        description: null,
      };

/** Report each changed property against a verified ancestor; never guess a rename. */
export function ownershipReport(
  desired: TokenSnapshot,
  live: LiveTokens,
  ancestor?: TokenSnapshot,
): OwnershipReport {
  const wanted = tokenMap(desired.sets);
  const actual = tokenMap(live.sets);
  const old = tokenMap(ancestor?.sets ?? []);
  const changes: OwnershipChange[] = [];
  const unmanagedSets = live.sets
    .filter((set) => !wanted.has(set.name) && !old.has(set.name))
    .map((set) => set.name);
  const unmanagedTokens: {
    set: string;
    name: string;
  }[] = [];
  for (const setName of new Set([
    ...wanted.keys(),
    ...old.keys(),
  ])) {
    for (const name of new Set([
      ...(wanted.get(setName)?.keys() ?? []),
      ...(old.get(setName)?.keys() ?? []),
    ])) {
      const a = values(old.get(setName)?.get(name));
      const d = values(wanted.get(setName)?.get(name));
      const l = values(actual.get(setName)?.get(name));
      for (const property of [
        "type",
        "value",
        "description",
      ]) {
        const same = (x: unknown, y: unknown) => canonical(x) === canonical(y);
        if (same(d[property], l[property])) {
          continue;
        }
        let kind: OwnershipChange["kind"];
        if (!ancestor || !old.get(setName)?.has(name)) {
          kind = !actual.get(setName)?.has(name) ? "upstream" : "untracked";
        } else {
          const upstream = !same(d[property], a[property]);
          const designer = !same(l[property], a[property]);
          kind = upstream && designer ? "conflict" : designer ? "designer" : "upstream";
        }
        changes.push({
          set: setName,
          name,
          property,
          kind,
          ancestor: a[property],
          desired: d[property],
          live: l[property],
        });
      }
    }
    for (const name of actual.get(setName)?.keys() ?? []) {
      if (!wanted.get(setName)?.has(name) && !old.get(setName)?.has(name)) {
        unmanagedTokens.push({
          set: setName,
          name,
        });
      }
    }
  }
  const key = (theme: { group: string; name: string }) =>
    canonical([
      theme.group,
      theme.name,
    ]);
  const previousThemes = new Map(
    (ancestor?.themes ?? []).map((theme) => [
      key(theme),
      theme,
    ]),
  );
  for (const theme of desired.themes) {
    const current = live.themes.find((t) => key(t) === key(theme));
    const previous = previousThemes.get(key(theme));
    const managed = new Set(
      [
        ...desired.sets,
        ...(ancestor?.sets ?? []),
      ].map((set) => set.name),
    );
    const orderedMembership = (sets: string[] | undefined) =>
      sets === undefined ? null : sets.filter((name) => managed.has(name)).sort();
    const a = orderedMembership(previous?.sets);
    const d = orderedMembership(theme.sets);
    const l = orderedMembership(current?.sets);
    if (canonical(d) === canonical(l)) {
      continue;
    }
    const kind = !previous
      ? !current
        ? "upstream"
        : "untracked"
      : canonical(l) === canonical(a)
        ? "upstream"
        : canonical(d) === canonical(a)
          ? "designer"
          : "conflict";
    changes.push({
      set: "@themes",
      name: key(theme),
      property: "membership",
      kind,
      ancestor: a,
      desired: d,
      live: l,
    });
  }
  return {
    changes,
    blockers: changes.filter((change) => change.kind !== "upstream"),
    unmanagedSets,
    unmanagedTokens,
  };
}

/** Destruction is conservative across all sets, including those outside adapter ownership. */
export function assertSafeDestruction(
  actions: Action[],
  live: LiveTokens,
  bindingCounts: Record<string, number> = {},
): void {
  for (const action of actions) {
    const names =
      action.kind === "removeTokens"
        ? action.names
        : action.kind === "replaceTokens"
          ? action.tokens
              .filter(
                (token) =>
                  live.sets
                    .find((set) => set.name === action.set)
                    ?.tokens.find((old) => old.name === token.name)?.type !== token.type,
              )
              .map((token) => token.name)
          : [];
    for (const name of names) {
      if ((bindingCounts[name] ?? 0) > 0) {
        throw new Error(
          `Cannot remove or change type of ${name}: bound to ${bindingCounts[name]} retained shape(s)`,
        );
      }
      for (const set of live.sets) {
        for (const token of set.tokens) {
          if (
            set.name ===
              (
                action as {
                  set: string;
                }
              ).set &&
            token.name === name
          ) {
            continue;
          }
          if (JSON.stringify(token.value).includes("{" + name + "}")) {
            throw new Error(
              `Cannot remove or change type of ${name}: referenced by ${set.name}/${token.name}`,
            );
          }
        }
      }
    }
  }
}

const ledgerPath = (fileId: string) =>
  `.penpair/token-sync/${createHash("sha256").update(fileId).digest("hex")}.json`;
export async function readSyncAncestor(
  root: string,
  fileId: string,
): Promise<TokenSnapshot | undefined> {
  try {
    const record = JSON.parse(
      await readFile(await resolveProjectInput(root, ledgerPath(fileId)), "utf8"),
    );
    if (
      record.schemaVersion !== 1 ||
      record.fileId !== fileId ||
      record.sha256 !== createHash("sha256").update(canonical(record.snapshot)).digest("hex") ||
      ![
        1,
        2,
      ].includes(record.snapshot?.schemaVersion) ||
      !Array.isArray(record.snapshot?.sets) ||
      !Array.isArray(record.snapshot?.themes)
    ) {
      throw new Error("Invalid token-sync ancestor; inspect it before replacing it");
    }
    return record.snapshot;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}
export async function saveSyncAncestor(
  root: string,
  fileId: string,
  snapshot: TokenSnapshot,
  expectedAncestor?: TokenSnapshot,
): Promise<void> {
  await ensureGitignoreEntry(root, ".penpair", {
    directory: true,
    comment: "penpair: private token synchronization evidence",
  });
  const destination = await resolveProjectOutput(root, ledgerPath(fileId));
  await mkdir(path.dirname(destination), {
    recursive: true,
    mode: 0o700,
  });
  const lockPath = destination + ".lock";
  const lock = await open(lockPath, "wx", 0o600).catch(() => {
    throw new Error("Token ancestor is locked; inspect any interrupted local sync before retrying");
  });
  try {
    const current = await readSyncAncestor(root, fileId);
    if (
      current &&
      canonical(current) !== canonical(snapshot) &&
      canonical(current) !== canonical(expectedAncestor)
    ) {
      throw new Error("Token ancestor advanced concurrently; newer sync evidence was preserved");
    }
    await atomicWriteFile(
      destination,
      JSON.stringify(
        {
          schemaVersion: 1,
          fileId,
          savedAt: new Date().toISOString(),
          sha256: createHash("sha256").update(canonical(snapshot)).digest("hex"),
          snapshot,
        },
        null,
        2,
      ) + "\n",
      {
        replace: true,
        mode: 0o600,
      },
    );
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}
