import path from "node:path";
import type { ThemeReference } from "./theme-input.js";

/** The `marwes` block of penpair.config.json. */
export interface MarwesSettings {
  /** The project's name; it prefixes its overlay sets ("Tradient · Light"). Defaults to the instance name, capitalised. */
  name: string;
  /** The folder of the package that depends on Marwes (a workspace package in a monorepo). Relative to the project. */
  project: string;
  /** The project's own themes, so the project's choices go on top of Marwes's defaults. Optional. */
  themes: { light?: ThemeReference; dark?: ThemeReference };
  /** Where the committed snapshot lives, relative to the project. */
  snapshot: string;
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
    project: v.project === undefined ? "." : relative(v.project, "project"),
    themes: { light: themeReference(themes.light, "light"), dark: themeReference(themes.dark, "dark") },
    snapshot: v.snapshot === undefined ? defaultSnapshotPath : relative(v.snapshot, "snapshot"),
  };
}
