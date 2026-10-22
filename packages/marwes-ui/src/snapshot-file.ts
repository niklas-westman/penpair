import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  atomicWriteFile,
  resolveProjectInput,
  resolveProjectOutput,
  validateEditableToken,
} from "@penpair/core";
import { canonical, type PenpotToken, type TokenSnapshot } from "./tokens.js";

export async function readSnapshot(root: string, file: string): Promise<TokenSnapshot | undefined> {
  try {
    const snapshot = JSON.parse(
      await readFile(await resolveProjectInput(root, file), "utf8"),
    ) as TokenSnapshot;
    if (
      ![
        1,
        2,
      ].includes(snapshot.schemaVersion) ||
      !Array.isArray(snapshot.sets) ||
      !Array.isArray(snapshot.themes) ||
      typeof snapshot.hash !== "string" ||
      typeof snapshot.project !== "string"
    ) {
      throw new Error("Unsupported or malformed snapshot; regenerate with tokens snapshot --write");
    }
    if (
      snapshot.schemaVersion === 2 &&
      (!snapshot.ownership ||
        Object.keys(snapshot.ownership).length !== snapshot.sets.length ||
        snapshot.sets.some(
          (set) =>
            ![
              "adapter",
              "project",
            ].includes(snapshot.ownership?.[set.name] ?? ""),
        ))
    ) {
      throw new Error("Invalid schema-2 set ownership");
    }
    return snapshot;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw new Error(`${file} is not a readable snapshot: ${String((error as Error).message)}`);
  }
}

export async function writeSnapshot(
  root: string,
  file: string,
  snapshot: TokenSnapshot,
): Promise<void> {
  const target = await resolveProjectOutput(root, file);
  await mkdir(path.dirname(target), {
    recursive: true,
  });
  await atomicWriteFile(target, `${JSON.stringify(snapshot, null, 2)}\n`, {
    replace: true,
  });
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
  versionChange?: {
    before: string;
    after: string;
  };
  sets: SetChange[];
  themes: {
    added: string[];
    removed: string[];
    changed: {
      theme: string;
      before: string[];
      after: string[];
    }[];
  };
  /** Marwes variables that are not tokens, and that appeared or disappeared since the other snapshot. */
  unmapped: {
    added: string[];
    removed: string[];
  };
}

const show = (token: PenpotToken): string =>
  typeof token.value === "string" ? token.value : canonical(token.value);

/** What differs between two expectations: the Marwes version, then set by set which tokens were added, removed or changed. */
export function diffSnapshots(
  before: TokenSnapshot | undefined,
  after: TokenSnapshot,
): SnapshotDiff {
  const sets: SetChange[] = [];
  const previous = new Map(
    (before?.sets ?? []).map((s) => [
      s.name,
      s,
    ]),
  );
  const next = new Map(
    after.sets.map((s) => [
      s.name,
      s,
    ]),
  );
  for (const [name, set] of next) {
    const old = previous.get(name);
    const oldTokens = new Map(
      (old?.tokens ?? []).map((t) => [
        t.name,
        t,
      ]),
    );
    const newTokens = new Map(
      set.tokens.map((t) => [
        t.name,
        t,
      ]),
    );
    const change: SetChange = {
      set: name,
      ...(old
        ? {}
        : {
            setAdded: true,
          }),
      added: [
        ...newTokens.keys(),
      ].filter((n) => !oldTokens.has(n)),
      removed: [
        ...oldTokens.keys(),
      ].filter((n) => !newTokens.has(n)),
      changed: [
        ...newTokens.entries(),
      ]
        .filter(([n, t]) => oldTokens.has(n) && show(oldTokens.get(n)!) !== show(t))
        .map(([n, t]) => ({
          name: n,
          before: show(oldTokens.get(n)!),
          after: show(t),
        })),
    };
    if (change.setAdded || change.added.length || change.removed.length || change.changed.length) {
      sets.push(change);
    }
  }
  for (const [name, old] of previous) {
    if (!next.has(name)) {
      sets.push({
        set: name,
        setRemoved: true,
        added: [],
        removed: old.tokens.map((t) => t.name),
        changed: [],
      });
    }
  }
  const oldThemes = new Map(
    (before?.themes ?? []).map((t) => [
      `${t.group}/${t.name}`,
      t.sets,
    ]),
  );
  const newThemes = new Map(
    after.themes.map((t) => [
      `${t.group}/${t.name}`,
      t.sets,
    ]),
  );
  const themes = {
    added: [
      ...newThemes.keys(),
    ].filter((k) => !oldThemes.has(k)),
    removed: [
      ...oldThemes.keys(),
    ].filter((k) => !newThemes.has(k)),
    changed: [
      ...newThemes.entries(),
    ]
      .filter(([k, s]) => oldThemes.has(k) && canonical(oldThemes.get(k)) !== canonical(s))
      .map(([k, s]) => ({
        theme: k,
        before: oldThemes.get(k)!,
        after: s,
      })),
  };
  const wasUnmapped = new Set(before?.unmapped ?? []);
  const isUnmapped = new Set(after.unmapped ?? []);
  const unmapped = {
    added: [
      ...isUnmapped,
    ].filter((v) => !wasUnmapped.has(v)),
    removed: [
      ...wasUnmapped,
    ].filter((v) => !isUnmapped.has(v)),
  };
  const versionChange =
    before && before.marwesVersion !== after.marwesVersion
      ? {
          before: before.marwesVersion,
          after: after.marwesVersion,
        }
      : undefined;
  const identical =
    !!before &&
    !versionChange &&
    sets.length === 0 &&
    !themes.added.length &&
    !themes.removed.length &&
    !themes.changed.length &&
    !unmapped.added.length &&
    !unmapped.removed.length;
  return {
    identical,
    ...(versionChange
      ? {
          versionChange,
        }
      : {}),
    sets,
    themes,
    unmapped,
  };
}

/** A short, readable account of a diff for the terminal; long lists are cut with a count. */
export function formatDiff(diff: SnapshotDiff, limit = 8): string[] {
  const lines: string[] = [];
  if (diff.versionChange) {
    lines.push(`Marwes ${diff.versionChange.before} -> ${diff.versionChange.after}`);
  }
  const cut = (items: string[]): string =>
    items.length > limit
      ? `${items.slice(0, limit).join(", ")} and ${items.length - limit} more`
      : items.join(", ");
  for (const s of diff.sets) {
    if (s.setAdded) {
      lines.push(`${s.set}: new set with ${s.added.length} tokens`);
    } else if (s.setRemoved) {
      lines.push(`${s.set}: set no longer expected (${s.removed.length} tokens)`);
    } else {
      if (s.added.length) {
        lines.push(`${s.set}: ${s.added.length} added: ${cut(s.added)}`);
      }
      if (s.removed.length) {
        lines.push(`${s.set}: ${s.removed.length} removed: ${cut(s.removed)}`);
      }
      if (s.changed.length) {
        lines.push(
          `${s.set}: ${s.changed.length} changed: ${cut(s.changed.map((c) => `${c.name} ${c.before} -> ${c.after}`))}`,
        );
      }
    }
  }
  if (diff.unmapped.added.length) {
    lines.push(
      `NEW Marwes variables that are not tokens (the design file does not know them yet; review, then extend the adapter or accept): ${cut(diff.unmapped.added)}`,
    );
  }
  if (diff.unmapped.removed.length) {
    lines.push(`Marwes variables that are no longer provided: ${cut(diff.unmapped.removed)}`);
  }
  for (const t of diff.themes.added) {
    lines.push(`theme ${t}: new`);
  }
  for (const t of diff.themes.removed) {
    lines.push(`theme ${t}: no longer expected`);
  }
  for (const t of diff.themes.changed) {
    lines.push(`theme ${t.theme}: sets ${t.before.join(" + ")} -> ${t.after.join(" + ")}`);
  }
  return lines;
}

/** Explicitly classify every legacy set; names cannot establish ownership. Original fields survive migration. */
export function migrateTokenSnapshot(
  raw: unknown,
  ownership: Record<string, "adapter" | "project">,
): TokenSnapshot {
  const source = raw as TokenSnapshot;
  if (
    !source ||
    source.schemaVersion !== 1 ||
    !Array.isArray(source.sets) ||
    !Array.isArray(source.themes) ||
    !Array.isArray(source.unmapped) ||
    typeof source.marwesVersion !== "string" ||
    typeof source.project !== "string"
  ) {
    throw new Error(
      "Migration requires a readable legacy schema-1 token snapshot; unsupported majors need producer guidance",
    );
  }
  if (
    !ownership ||
    typeof ownership !== "object" ||
    Array.isArray(ownership) ||
    Object.keys(ownership).length !== source.sets.length ||
    source.sets.some(
      (set) =>
        ![
          "adapter",
          "project",
        ].includes(ownership[set.name] ?? ""),
    ) ||
    new Set(source.sets.map((set) => set.name)).size !== source.sets.length
  ) {
    throw new Error(
      "Explicit adapter/project ownership is required for every legacy set, with no extra names",
    );
  }
  for (const set of source.sets) {
    if (!set || typeof set.name !== "string" || !Array.isArray(set.tokens)) {
      throw new Error("Malformed legacy set");
    }
    const names = new Set<string>();
    for (const token of set.tokens) {
      validateEditableToken(token);
      if (names.has(token.name)) {
        throw new Error("Duplicate legacy token");
      }
      names.add(token.name);
    }
  }
  if (
    source.unmapped.some((value) => typeof value !== "string") ||
    source.themes.some(
      (theme) =>
        !theme ||
        typeof theme.group !== "string" ||
        typeof theme.name !== "string" ||
        !Array.isArray(theme.sets) ||
        theme.sets.some((name) => !source.sets.some((set) => set.name === name)),
    )
  ) {
    throw new Error("Malformed legacy themes/unmapped variables");
  }
  const migrated = {
    ...structuredClone(source),
    schemaVersion: 2 as const,
    ownership: structuredClone(ownership),
  };
  const { marwesVersion, project, sets, themes, unmapped } = migrated;
  migrated.hash = createHash("sha256")
    .update(
      canonical({
        marwesVersion,
        project,
        sets,
        themes,
        unmapped,
        ownership: migrated.ownership,
      }),
    )
    .digest("hex");
  return migrated;
}

export const tokenSnapshotSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:penpair:schema:v2:adapter-token-snapshot",
  type: "object",
  required: [
    "schemaVersion",
    "ownership",
    "marwesVersion",
    "generatedBy",
    "project",
    "hash",
    "sets",
    "themes",
    "unmapped",
  ],
  properties: {
    schemaVersion: {
      const: 2,
    },
    ownership: {
      type: "object",
      additionalProperties: {
        enum: [
          "adapter",
          "project",
        ],
      },
    },
    marwesVersion: {
      type: "string",
    },
    generatedBy: {
      type: "string",
    },
    project: {
      type: "string",
    },
    hash: {
      type: "string",
      pattern: "^[a-f0-9]{64}$",
    },
    sets: {
      type: "array",
    },
    themes: {
      type: "array",
    },
    unmapped: {
      type: "array",
      items: {
        type: "string",
      },
    },
  },
  additionalProperties: true,
} as const;
