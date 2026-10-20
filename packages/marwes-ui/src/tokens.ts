import { createHash } from "node:crypto";

export type PenpotTokenType = "color" | "spacing" | "sizing" | "borderRadius" | "fontFamilies" | "typography";

export interface PenpotToken {
  name: string;
  type: PenpotTokenType;
  /** Plain strings for simple tokens; a composite typography token carries an object. */
  value: string | Record<string, string>;
  description: string;
}

export interface PenpotTokenSet {
  name: string;
  tokens: PenpotToken[];
}

export interface PenpotTokenTheme {
  group: string;
  name: string;
  sets: string[];
}

/** What the Penpot file is expected to hold: generated from the installed Marwes and the project's theme, committed to the project. */
export interface TokenSnapshot {
  schemaVersion: 1;
  /** The Marwes version the values came from. */
  marwesVersion: string;
  /** What produced the file, so a reader knows not to edit it by hand. */
  generatedBy: string;
  /** The project name that prefixes its overlay sets. */
  project: string;
  /** A hash of the version, the sets, the themes and the unmapped variables: two snapshots with the same hash are the same expectation. */
  hash: string;
  /** Variables the installed Marwes provides that this adapter does not turn into tokens. A new one means Marwes grew something the design file does not know about yet. */
  unmapped: string[];
  sets: PenpotTokenSet[];
  themes: PenpotTokenTheme[];
}

/** The part of Marwes core the snapshot needs. The real package exports these; a test supplies its own. */
export interface MarwesCore {
  resolveThemeInput: (input: Record<string, unknown>) => unknown;
  themeToCSSVars: (theme: unknown) => Record<string, string>;
  mwThemeVars: { spacing: Record<string, string> };
}

export const coreSetName = "Marwes · Core";
export const darkSetName = "Marwes · Dark";
export const themeGroup = "Mode";

const hex = (value: number): string => Math.round(value).toString(16).padStart(2, "0").toUpperCase();

/** Penpot colour tokens are hex; Marwes also uses rgba() and the word transparent. */
export function toHexColor(value: string): string {
  if (value === "transparent") return "#00000000";
  const rgba = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(value);
  if (rgba) {
    const alpha = rgba[4] === undefined ? 1 : Number(rgba[4]);
    return `#${hex(Number(rgba[1]))}${hex(Number(rgba[2]))}${hex(Number(rgba[3]))}${alpha < 1 ? hex(alpha * 255) : ""}`;
  }
  if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value)) return value.toUpperCase();
  throw new Error(`Unsupported colour value: ${value}`);
}

const px = (value: string): string => {
  const match = /^(-?[\d.]+)px$/.exec(value);
  if (!match) throw new Error(`Expected a px value, got ${value}`);
  return String(Number(match[1]));
};

const firstFamily = (stack: string): string =>
  stack
    .split(",")[0]!
    .trim()
    .replace(/^['"]|['"]$/g, "");

const typographyKeys: Record<string, string> = {
  "font-size": "fontSize",
  "line-height": "lineHeight",
  "font-weight": "fontWeight",
  "letter-spacing": "letterSpacing",
  transform: "textCase",
};

function typographyTokens(vars: Record<string, string>, fontFamily: string, describe: (variable: string) => string): PenpotToken[] {
  const variants = new Map<string, Record<string, string>>();
  for (const [variable, value] of Object.entries(vars)) {
    const match = /^--mw-typography-(.+)-(font-size|line-height|font-weight|letter-spacing|transform)$/.exec(variable);
    if (!match) continue;
    const entry = variants.get(match[1]!) ?? { fontFamilies: fontFamily };
    const key = typographyKeys[match[2]!]!;
    if (match[2] === "transform") {
      if (value !== "none") entry[key] = value;
    } else entry[key] = match[2] === "line-height" || match[2] === "font-weight" ? value : px(value);
    variants.set(match[1]!, entry);
  }
  return [...variants.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([variant, value]) => ({
      name: `mw-typography-${variant}`,
      type: "typography" as const,
      // The paragraph variants in Marwes define only size and line height; weight and spacing fall back to the normal values, as a browser does.
      value: { fontWeight: "400", letterSpacing: "0", ...value },
      description: describe(`--mw-typography-${variant}-*`),
    }));
}

const byName = (left: PenpotToken, right: PenpotToken): number => left.name.localeCompare(right.name);

/** Every token a resolved theme provides (everything but the spacing scale, which is not part of a theme). */
export function tokensFromVars(vars: Record<string, string>, describe: (variable: string) => string): PenpotToken[] {
  const colors: PenpotToken[] = Object.entries(vars)
    .filter(([variable]) => variable.startsWith("--mw-color-"))
    .map(([variable, value]) => ({ name: variable.slice(2), type: "color" as const, value: toHexColor(value), description: describe(variable) }))
    .sort(byName);
  const density: PenpotToken[] = Object.entries(vars)
    .filter(([variable, value]) => variable.startsWith("--mw-density-") && value.endsWith("px"))
    .map(([variable, value]) => ({ name: variable.slice(2), type: "sizing" as const, value: px(value), description: describe(variable) }))
    .sort(byName);
  const radii: PenpotToken[] = ["--mw-ui-radius", "--mw-ui-radius-button"]
    .filter((variable) => vars[variable] !== undefined)
    .map((variable) => ({ name: variable.slice(2), type: "borderRadius" as const, value: px(vars[variable]!), description: describe(variable) }));
  const fonts: PenpotToken[] = ["--mw-font-primary", "--mw-font-secondary", "--mw-font-mono"]
    .filter((variable) => vars[variable] !== undefined)
    .map((variable) => ({ name: variable.slice(2), type: "fontFamilies" as const, value: firstFamily(vars[variable]!), description: describe(variable) }));
  const primary = vars["--mw-font-primary"];
  const typography = primary === undefined ? [] : typographyTokens(vars, firstFamily(primary), describe);
  return [...colors, ...density, ...radii, ...fonts, ...typography];
}

/** The tokens of `of` that `base` does not already provide with the same value: what is left to say on top of it. */
export function tokensAbove(base: PenpotToken[], of: PenpotToken[]): PenpotToken[] {
  const known = new Map(base.map((token) => [token.name, canonical(token.value)]));
  return of.filter((token) => known.get(token.name) !== canonical(token.value));
}

/** JSON with sorted keys, so the same data always gives the same text. */
export function canonical(value: unknown): string {
  const sort = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(sort);
    if (typeof input === "object" && input !== null) return Object.fromEntries(Object.entries(input as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, sort(v)]));
    return input;
  };
  return JSON.stringify(sort(value));
}

const typographyVariable = /^--mw-typography-(.+)-(font-size|line-height|font-weight|letter-spacing|transform)$/;

/** Whether a Marwes variable becomes a token (see tokensFromVars). Everything else is reported, never silently dropped. */
export function isMapped(variable: string, value: string): boolean {
  if (variable.startsWith("--mw-color-")) return true;
  if (variable.startsWith("--mw-density-")) return value.endsWith("px");
  if (variable === "--mw-ui-radius" || variable === "--mw-ui-radius-button") return true;
  if (variable === "--mw-font-primary" || variable === "--mw-font-secondary" || variable === "--mw-font-mono") return true;
  return typographyVariable.test(variable);
}

export function unmappedVariables(...themes: Record<string, string>[]): string[] {
  const found = new Set<string>();
  for (const vars of themes) for (const [variable, value] of Object.entries(vars)) if (!isMapped(variable, value)) found.add(variable);
  return [...found].sort();
}

export interface SnapshotInput {
  core: MarwesCore;
  version: string;
  /** The project's own light and dark themes (a Marwes ThemeInput each), when it has them. */
  project?: { light?: Record<string, unknown>; dark?: Record<string, unknown> };
  /** The project's name, which prefixes its overlay sets. */
  name: string;
  generatedBy: string;
}

const hashOf = (parts: { marwesVersion: string; project: string; sets: PenpotTokenSet[]; themes: PenpotTokenTheme[]; unmapped: string[] }): string => createHash("sha256").update(canonical(parts)).digest("hex");

/**
 * The Penpot token sets for Marwes and for the project, generated from the installed Marwes. Light values live in the core set,
 * only what differs in dark goes in the dark set, and what the project's own theme changes goes in small overlay sets above them,
 * so a Marwes update changes the Marwes sets and never silently loses the project's choices.
 */
export function buildSnapshot(input: SnapshotInput): TokenSnapshot {
  const { core, version, name } = input;
  const mode = (which: "light" | "dark", theme?: Record<string, unknown>): Record<string, string> => core.themeToCSSVars(core.resolveThemeInput(theme ?? { mode: which }));
  const marwes = (variable: string): string => `${variable} (Marwes ${version})`;
  const marwesDark = (variable: string): string => `${variable} in dark mode (Marwes ${version})`;
  const overlay = (which: string) => (variable: string): string => `${variable}, ${name} ${which} theme (Marwes ${version})`;

  const lightDefaults = mode("light");
  const darkDefaults = mode("dark");
  const lightBase = tokensFromVars(lightDefaults, marwes);
  const darkBase = tokensFromVars(darkDefaults, marwesDark);
  const spacing: PenpotToken[] = Object.values(core.mwThemeVars.spacing)
    .map((reference) => /var\((--mw-spacing-sp-(\d+))\)/.exec(reference))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => ({ name: match[1]!.slice(2), type: "spacing" as const, value: match[2]!, description: marwes(match[1]!) }))
    .sort((left, right) => Number(left.value) - Number(right.value));

  const unmapped = unmappedVariables(lightDefaults, darkDefaults);
  const sets: PenpotTokenSet[] = [
    { name: coreSetName, tokens: [...lightBase, ...spacing] },
    { name: darkSetName, tokens: tokensAbove(lightBase, darkBase) },
  ];
  const lightSets = [coreSetName];
  const darkSets = [coreSetName, darkSetName];
  if (input.project?.light) {
    const tokens = tokensAbove(lightBase, tokensFromVars(mode("light", input.project.light), overlay("light")));
    if (tokens.length > 0) {
      sets.push({ name: `${name} · Light`, tokens });
      lightSets.push(`${name} · Light`);
    }
  }
  if (input.project?.dark) {
    const tokens = tokensAbove(darkBase, tokensFromVars(mode("dark", input.project.dark), overlay("dark")));
    if (tokens.length > 0) {
      sets.push({ name: `${name} · Dark`, tokens });
      darkSets.push(`${name} · Dark`);
    }
  }
  const themes: PenpotTokenTheme[] = [
    { group: themeGroup, name: "Light", sets: lightSets },
    { group: themeGroup, name: "Dark", sets: darkSets },
  ];
  return { schemaVersion: 1, marwesVersion: version, generatedBy: input.generatedBy, project: name, hash: hashOf({ marwesVersion: version, project: name, sets, themes, unmapped }), unmapped, sets, themes };
}

/** The value of a token as it compares in Penpot: strings are exact, font families and typography are normalised the way Penpot stores them. */
export function normalizeValue(type: string, value: unknown): string {
  if (type === "typography" && typeof value === "object" && value !== null) {
    const entry: Record<string, string> = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      if (key === "fontFamilies" || key === "fontFamily") entry.fontFamily = (Array.isArray(raw) ? raw : [raw]).map(String).join(",");
      else entry[key] = String(raw);
    }
    return canonical(entry);
  }
  if (type === "color" && typeof value === "string" && /^#[0-9a-f]+$/i.test(value)) return value.toUpperCase();
  // Penpot stores a font family token as a list (["Inter"]) whatever it was given.
  if (type === "fontFamilies" || type === "fontFamily") return (Array.isArray(value) ? value : [value]).map(String).join(",");
  return typeof value === "string" ? value : canonical(value);
}
