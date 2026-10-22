import type { Action, LiveTokens } from "./penpot.js";
import { normalizeValue } from "./tokens.js";

const set = (live: LiveTokens, name: string) => live.sets.filter((entry) => entry.name === name);
const theme = (live: LiveTokens, group: string, name: string) =>
  live.themes.filter((entry) => entry.group === group && entry.name === name);
const tokenState = (
  token:
    | {
        type: string;
        value: unknown;
        description: string;
      }
    | undefined,
): string | null =>
  token
    ? JSON.stringify([
        token.type,
        normalizeValue(token.type, token.value),
        token.description || "",
      ])
    : null;

export function actionSatisfied(action: Action, live: LiveTokens): boolean {
  switch (action.kind) {
    case "createSet":
      return set(live, action.set).length === 1;
    case "addTokens":
    case "updateTokens":
    case "replaceTokens": {
      const sets = set(live, action.set);
      return (
        sets.length === 1 &&
        action.tokens.every((wanted) => {
          const actual = sets[0]!.tokens.filter((token) => token.name === wanted.name);
          return actual.length === 1 && tokenState(actual[0]) === tokenState(wanted);
        })
      );
    }
    case "removeTokens":
      return (
        set(live, action.set).length === 1 &&
        action.names.every(
          (name) => !set(live, action.set)[0]!.tokens.some((token) => token.name === name),
        )
      );
    case "createTheme": {
      const found = theme(live, action.group, action.name);
      return (
        found.length === 1 &&
        found[0]!.sets.length === action.sets.length &&
        action.sets.every((name) => found[0]!.sets.includes(name))
      );
    }
    case "syncThemeSets": {
      const found = theme(live, action.group, action.name);
      return (
        found.length === 1 &&
        action.add.every((name) => found[0]!.sets.includes(name)) &&
        action.remove.every((name) => !found[0]!.sets.includes(name))
      );
    }
    case "activateTheme":
      return (
        theme(live, action.group, action.name).some((entry) => entry.active) &&
        live.themes.every(
          (entry) => !entry.active || (entry.group === action.group && entry.name === action.name),
        )
      );
  }
}

/** Only old or explicitly desired states can be our partial write; a third value needs owner reconciliation. */
export function reconcileAction(
  action: Action,
  before: LiveTokens,
  current: LiveTokens,
): "complete" | "pending" | "conflict" {
  if (actionSatisfied(action, current)) {
    return "complete";
  }
  switch (action.kind) {
    case "createSet":
      return set(current, action.set).length === 0 ? "pending" : "conflict";
    case "addTokens":
    case "updateTokens":
    case "replaceTokens": {
      const oldSets = set(before, action.set);
      const nowSets = set(current, action.set);
      if (nowSets.length !== 1 || oldSets.length > 1) {
        return "conflict";
      }
      for (const wanted of action.tokens) {
        const oldTokens = oldSets[0]?.tokens.filter((token) => token.name === wanted.name) ?? [];
        const nowTokens = nowSets[0]!.tokens.filter((token) => token.name === wanted.name);
        if (oldTokens.length > 1 || nowTokens.length > 1) {
          return "conflict";
        }
        const old = tokenState(oldTokens[0]);
        const actual = tokenState(nowTokens[0]);
        const desired = tokenState(wanted);
        if (action.kind === "addTokens" && old !== null && old !== desired) {
          return "conflict";
        }
        if (action.kind !== "addTokens" && old === null) {
          return "conflict";
        }
        if (
          actual !== old &&
          actual !== desired &&
          !(action.kind === "replaceTokens" && actual === null)
        ) {
          return "conflict";
        }
      }
      return "pending";
    }
    case "removeTokens": {
      const oldSets = set(before, action.set);
      const nowSets = set(current, action.set);
      if (oldSets.length !== 1 || nowSets.length !== 1) {
        return "conflict";
      }
      return action.names.every((name) => {
        const old = oldSets[0]!.tokens.filter((token) => token.name === name);
        const actual = nowSets[0]!.tokens.filter((token) => token.name === name);
        return (
          actual.length <= 1 &&
          (actual.length === 0 ||
            (old.length === 1 && tokenState(old[0]) === tokenState(actual[0])))
        );
      })
        ? "pending"
        : "conflict";
    }
    case "createTheme": {
      const old = theme(before, action.group, action.name);
      const actual = theme(current, action.group, action.name);
      return old.length === 0 &&
        actual.length <= 1 &&
        (actual.length === 0 || actual[0]!.sets.every((name) => action.sets.includes(name)))
        ? "pending"
        : "conflict";
    }
    case "syncThemeSets": {
      const old = theme(before, action.group, action.name);
      const actual = theme(current, action.group, action.name);
      if (old.length !== 1 || actual.length !== 1) {
        return "conflict";
      }
      const touched = new Set([
        ...action.add,
        ...action.remove,
      ]);
      const unchanged = (sets: string[]) =>
        sets
          .filter((name) => !touched.has(name))
          .sort()
          .join("\n");
      return unchanged(old[0]!.sets) === unchanged(actual[0]!.sets) ? "pending" : "conflict";
    }
    case "activateTheme": {
      const active = (live: LiveTokens) =>
        live.themes
          .filter((entry) => entry.active)
          .map((entry) =>
            JSON.stringify([
              entry.group,
              entry.name,
            ]),
          )
          .sort()
          .join("\n");
      return active(current) === active(before) || active(current) === "" ? "pending" : "conflict";
    }
  }
}

/** Recompute residual work from actual state so completed token replacements are never removed/recreated again. */
export function remainingAction(action: Action, current: LiveTokens): Action | undefined {
  if (actionSatisfied(action, current)) {
    return undefined;
  }
  if ("tokens" in action) {
    const actual = set(current, action.set)[0];
    const tokens = action.tokens.filter(
      (wanted) =>
        tokenState(actual?.tokens.find((token) => token.name === wanted.name)) !==
        tokenState(wanted),
    );
    return tokens.length
      ? {
          ...action,
          tokens,
        }
      : undefined;
  }
  if (action.kind === "removeTokens") {
    return {
      ...action,
      names: action.names.filter((name) =>
        set(current, action.set)[0]?.tokens.some((token) => token.name === name),
      ),
    };
  }
  if (action.kind === "createTheme" && theme(current, action.group, action.name).length === 1) {
    const actual = theme(current, action.group, action.name)[0]!;
    return {
      kind: "syncThemeSets",
      group: action.group,
      name: action.name,
      add: action.sets.filter((name) => !actual.sets.includes(name)),
      remove: [],
    };
  }
  if (action.kind === "syncThemeSets") {
    const actual = theme(current, action.group, action.name)[0]!;
    return {
      ...action,
      add: action.add.filter((name) => !actual.sets.includes(name)),
      remove: action.remove.filter((name) => actual.sets.includes(name)),
    };
  }
  return action;
}
