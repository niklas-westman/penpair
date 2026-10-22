import { observationHash } from "./journal.js";
import { PenpairError } from "./errors.js";
export interface TypedToken {
  name: string;
  type?: string | null;
  value: unknown;
  description?: string | null;
  resolvedValue?: unknown;
  unknowns?: string[];
}
export interface TokenDump {
  schemaVersion?: 1;
  complete?: boolean;
  sets: {
    order: number;
    name: string;
    active: boolean;
    tokens: (string | TypedToken)[];
  }[];
  themes: {
    group: string;
    name: string;
    active: boolean;
    sets: string[];
  }[];
}
interface Evidence {
  unknown: Set<string>;
  fingerprints: Map<string, string>;
  displayed: Map<string, string>;
  types: Map<string, string>;
}
const evidence = new WeakMap<Map<string, string>, Evidence>();

export function parseTokenDump(value: unknown): TokenDump {
  let input = value as Record<string, unknown>;
  if (input && typeof input === "object" && "outcome" in input && "data" in input) {
    if (input.redacted === true) {
      throw new PenpairError(
        "incomplete-output",
        "Token dump evidence was redacted; use an unmodified private source",
      );
    }
    input = input.data as Record<string, unknown>;
  }
  if (
    !input ||
    typeof input !== "object" ||
    (input.schemaVersion !== undefined && input.schemaVersion !== 1) ||
    !Array.isArray(input.sets) ||
    !Array.isArray(input.themes)
  ) {
    throw new Error("Unsupported or malformed token dump; export a fresh schema-1 dump");
  }
  if (input.complete !== undefined && typeof input.complete !== "boolean") {
    throw new Error("Malformed token dump completeness");
  }
  if (input.complete === false) {
    throw new PenpairError(
      "incomplete-output",
      "Token dump is incomplete; capture it again before comparing",
    );
  }
  const seen = new Set<string>();
  for (const raw of input.sets) {
    const set = raw as TokenDump["sets"][number];
    if (
      !set ||
      typeof set.name !== "string" ||
      seen.has(set.name) ||
      !Number.isInteger(set.order) ||
      !Array.isArray(set.tokens)
    ) {
      throw new Error("Token sets need unique names, numeric order and token arrays");
    }
    seen.add(set.name);
    const names = new Set<string>();
    for (const token of set.tokens) {
      const name = typeof token === "string" ? token.slice(0, token.indexOf("=")) : token?.name;
      if (
        typeof name !== "string" ||
        !name ||
        names.has(name) ||
        (typeof token === "string" && token.indexOf("=") < 1) ||
        (typeof token !== "string" && !("value" in token))
      ) {
        throw new Error("Token dump contains ambiguous or malformed entries");
      }
      names.add(name);
    }
  }
  for (const theme of input.themes as TokenDump["themes"]) {
    if (
      !theme ||
      typeof theme.group !== "string" ||
      typeof theme.name !== "string" ||
      !Array.isArray(theme.sets) ||
      theme.sets.some((name) => typeof name !== "string")
    ) {
      throw new Error("Token dump has malformed theme membership");
    }
  }
  return input as unknown as TokenDump;
}
const display = (value: unknown): string => {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (text === undefined) {
    throw new Error("Token values must be JSON data");
  }
  return text;
};

/** Declared values under theme membership/order; this does not measure Penpot's resolvedValue or activate a theme. */
export function effectiveValues(input: TokenDump, themeName: string): Map<string, string> {
  const dump = parseTokenDump(input);
  const matches = dump.themes.filter((theme) => theme.name === themeName);
  if (!matches.length) {
    throw new Error(`no theme named ${themeName}`);
  }
  if (matches.length !== 1) {
    throw new Error(`theme name ${themeName} is ambiguous; use an unambiguous theme dump`);
  }
  const effective = new Map<string, string>();
  const details: Evidence = {
    unknown: new Set(),
    fingerprints: new Map(),
    displayed: new Map(),
    types: new Map(),
  };
  for (const set of [
    ...dump.sets,
  ].sort((a, b) => a.order - b.order)) {
    if (!matches[0]!.sets.includes(set.name)) {
      continue;
    }
    for (const token of set.tokens) {
      const legacy = typeof token === "string";
      const name = legacy ? token.slice(0, token.indexOf("=")) : token.name;
      const value = legacy ? token.slice(token.indexOf("=") + 1) : display(token.value);
      effective.set(name, value);
      details.unknown.delete(name);
      details.fingerprints.delete(name);
      details.types.delete(name);
      if (legacy) {
        if (value.includes("[object")) {
          details.unknown.add(name);
        }
      } else {
        if (token.type) {
          details.types.set(name, token.type);
        }
        details.fingerprints.set(
          name,
          observationHash({
            type: token.type,
            value: token.value,
          }),
        );
        if (!token.type || token.unknowns?.some((field) => field === "value" || field === "type")) {
          details.unknown.add(name);
        }
      }
    }
  }
  details.displayed = new Map(effective);
  evidence.set(effective, details);
  return effective;
}
export interface EffectiveDiff {
  complete: boolean;
  unknown: string[];
  added: string[];
  removed: string[];
  changed: {
    name: string;
    before: string;
    after: string;
    beforeType?: string;
    afterType?: string;
  }[];
}
/** Composite values compare structurally; legacy flattened objects remain explicitly unknown. */
export function diffEffective(
  before: Map<string, string>,
  after: Map<string, string>,
): EffectiveDiff {
  const details = (map: Map<string, string>): Evidence => {
    const saved = evidence.get(map);
    const unknown = new Set<string>();
    const fingerprints = new Map<string, string>();
    const types = new Map<string, string>();
    for (const [name, value] of map) {
      if (saved?.displayed.get(name) === value) {
        if (saved.unknown.has(name)) {
          unknown.add(name);
        }
        const hash = saved.fingerprints.get(name);
        if (hash) {
          fingerprints.set(name, hash);
        }
        const type = saved.types.get(name);
        if (type) {
          types.set(name, type);
        }
      } else if (value.includes("[object")) {
        unknown.add(name);
      }
    }
    return {
      unknown,
      fingerprints,
      displayed: new Map(map),
      types,
    };
  };
  const a = details(before);
  const b = details(after);
  const unknown = [
    ...new Set([
      ...a.unknown,
      ...b.unknown,
    ]),
  ].sort();
  const changed = [
    ...after.keys(),
  ]
    .filter(
      (name) =>
        before.has(name) &&
        !unknown.includes(name) &&
        (a.fingerprints.has(name) && b.fingerprints.has(name)
          ? a.fingerprints.get(name) !== b.fingerprints.get(name)
          : before.get(name) !== after.get(name)),
    )
    .map((name) => ({
      name,
      before: before.get(name)!,
      after: after.get(name)!,
      ...(a.types.has(name) && b.types.has(name)
        ? {
            beforeType: a.types.get(name)!,
            afterType: b.types.get(name)!,
          }
        : {}),
    }));
  return {
    complete: unknown.length === 0,
    unknown,
    added: [
      ...after.keys(),
    ].filter((name) => !before.has(name)),
    removed: [
      ...before.keys(),
    ].filter((name) => !after.has(name)),
    changed,
  };
}
