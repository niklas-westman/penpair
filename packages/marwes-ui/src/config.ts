import { readThemeLint, type ThemeLintSettings } from "./theme-lint.js";
import path from "node:path";
import { validateEditableToken } from "@penpair/core";
import type { PenpotTokenSet } from "./tokens.js";
import type { ThemeReference } from "./theme-input.js";

/** The `marwes` block of penpair.config.json. */
export interface MarwesSettings {
  /** The project's name; it prefixes its overlay sets ("Acme · Light"). Defaults to the instance name, capitalised. */
  name: string;
  /** The folder of the package that depends on Marwes (a workspace package in a monorepo). Relative to the project. */
  project: string;
  /** The project's own themes, so the project's choices go on top of Marwes's defaults. Optional. */
  themes: { light?: ThemeReference; dark?: ThemeReference };
  /** Where the committed snapshot lives, relative to the project. */
  snapshot: string;
  /** Explicit project-owned token sets, appended to both modes. */
  extras: PenpotTokenSet[];
  themeLint: ThemeLintSettings;
}

export const defaultSnapshotPath = "design/marwes-tokens.snapshot.json";

export class MarwesConfigError extends Error {}

const relative = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.length === 0 || path.isAbsolute(value) || value.split(/[\\/]/).includes("..")) throw new MarwesConfigError(`penpair.config.json: marwes.${label} must be a relative path that stays inside the project`);
  return value;
};

function themeReference(value: unknown, label: string): ThemeReference | undefined {
  if (value === undefined) return undefined;
  const v = value as { module?: unknown; export?: unknown };
  if (typeof value !== "object" || value === null || typeof v.export !== "string" || v.export.length === 0) throw new MarwesConfigError(`penpair.config.json: marwes.themes.${label} must be {"module": "<file>", "export": "<name>"}`);
  return { module: relative(v.module, `themes.${label}.module`), export: v.export };
}

const capitalise = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

export function readMarwesSettings(rawConfig: Record<string, unknown>, instance: string): MarwesSettings {
  const block = rawConfig.marwes;
  const v = (typeof block === "object" && block !== null ? block : {}) as Record<string, unknown>;
  if (block !== undefined && (typeof block !== "object" || block === null)) throw new MarwesConfigError('penpair.config.json: "marwes" must be an object');
  const themes = (typeof v.themes === "object" && v.themes !== null ? v.themes : {}) as Record<string, unknown>;
  const name = v.name === undefined ? capitalise(instance) : String(v.name);
  if (!/^[A-Za-z][A-Za-z0-9 _-]{0,40}$/.test(name)) throw new MarwesConfigError("penpair.config.json: marwes.name must be a short name (letters, digits, spaces, hyphens)");
  return {
    name,
    extras: readExtras(v.extras),
    themeLint: readThemeLint(v.themeLint),
    project: v.project === undefined ? "." : relative(v.project, "project"),
    themes: { light: themeReference(themes.light, "light"), dark: themeReference(themes.dark, "dark") },
    snapshot: v.snapshot === undefined ? defaultSnapshotPath : relative(v.snapshot, "snapshot"),
  };
}

function readExtras(value: unknown): PenpotTokenSet[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 50) throw new MarwesConfigError("marwes.extras must be an array of at most 50 sets");
  const names = new Set<string>();
  let count = 0;
  return value.map(raw => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.keys(raw).some(key => !["name", "tokens"].includes(key))) throw new MarwesConfigError("Invalid project extra set");
    const set = raw as PenpotTokenSet;
    if (typeof set.name !== "string" || !set.name.trim() || set.name.length > 200 || /[\x00-\x1f]/.test(set.name) || names.has(set.name) || !Array.isArray(set.tokens)) throw new MarwesConfigError("Invalid or duplicate project extra set");
    names.add(set.name);
    const tokens = new Set<string>();
    return { name: set.name, tokens: set.tokens.map(rawToken => {
      if (++count > 10000) throw new MarwesConfigError("Project extras exceed 10000 tokens");
      let token; try { token = validateEditableToken(rawToken); } catch (error) { throw new MarwesConfigError("marwes.extras: " + String(error)); }
      if (tokens.has(token.name)) throw new MarwesConfigError("Duplicate project extra token: " + token.name);
      tokens.add(token.name);
      return token as PenpotTokenSet["tokens"][number];
    }) };
  });
}
