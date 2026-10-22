import { observationHash } from "./journal.js";
export interface DeclaredToken { name: string; type: string; value: unknown }
export interface ProjectionCatalog {
 sets: Array<{ id?: string; name: string; tokens: DeclaredToken[] }>;
 themes: Array<{ id?: string; group: string; name: string; sets: string[] }>;
}
export interface ResolvedDeclaredToken { name: string; type: string; value?: unknown; unknown?: string }
/** A small arithmetic grammar, never JavaScript evaluation. Unsupported units/functions are explicit unknowns. */
export function numericExpression(source: string): number {
  if (source.length > 2000) throw new Error("Expression budget exceeded");
  const tokens = source.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|[()+*/-]/gi) ?? [];
  if (tokens.join("") !== source.replace(/\s+/g, "") || tokens.length > 500) throw new Error("Unsupported numeric expression");
  let index = 0, depth = 0;
  const atom = (): number => {
    if (++depth > 64) throw new Error("Expression depth exceeded");
    const token = tokens[index++]; let value: number;
    if (token === "(" ) { value = sum(); if (tokens[index++] !== ")") throw new Error("Unclosed expression"); }
    else if (token === "-") value = -atom();
    else if (token === "+") value = atom();
    else { if (!token || !/^[\d.]/.test(token)) throw new Error("Missing number"); value = Number(token); }
    depth--; if (!Number.isFinite(value)) throw new Error("Nonfinite expression"); return value;
  };
  const product = (): number => { let value = atom(); while (["*", "/"].includes(tokens[index] ?? "")) { const op = tokens[index++], right = atom(); value = op === "*" ? value * right : value / right; } return value; };
  const sum = (): number => { let value = product(); while (["+", "-"].includes(tokens[index] ?? "")) { const op = tokens[index++], right = product(); value = op === "+" ? value + right : value - right; } return value; };
  const value = sum(); if (index !== tokens.length || !Number.isFinite(value)) throw new Error("Invalid numeric expression"); return value;
}

const numericTypes = new Set(["borderRadius", "dimension", "fontSizes", "letterSpacing", "number", "opacity", "rotation", "sizing", "spacing", "borderWidth"]);
const supportedTypes = new Set([...numericTypes, "color", "fontFamilies", "fontWeights", "textDecoration", "textCase", "typography", "shadow"]);
/** Catalog order is authoritative; theme membership does not reorder sets. No live API is touched. */
export function resolveDeclaredTokens(catalog: Pick<ProjectionCatalog, "sets">, selectedSets: string[]): ResolvedDeclaredToken[] {
 if (!catalog || !Array.isArray(catalog.sets) || catalog.sets.length > 1000 || !Array.isArray(selectedSets) || new Set(selectedSets).size !== selectedSets.length) throw new Error("Invalid token projection catalog or membership");
 const names = new Set<string>(); let count = 0;
 for (const set of catalog.sets) {
  if (!set || typeof set.name !== "string" || !set.name || names.has(set.name) || !Array.isArray(set.tokens)) throw new Error("Token sets need unique names and token arrays");
  names.add(set.name); const tokens = new Set<string>();
  for (const token of set.tokens) {
   if (++count > 10000) throw new Error("Projection token budget exceeded");
   if (!token || typeof token.name !== "string" || !token.name || tokens.has(token.name) || typeof token.type !== "string" || !("value" in token)) throw new Error("Ambiguous or malformed token declaration");
   tokens.add(token.name);
  }
 }
 if (selectedSets.some(name => !names.has(name))) throw new Error("Selected theme references a missing token set");
 const effective = new Map(catalog.sets.filter(set => selectedSets.includes(set.name)).flatMap(set => set.tokens.map(token => [token.name, token] as const)));
 let resolutionWork = 0;
 const resolve = (name: string, visiting = new Set<string>()): unknown => {
  if (++resolutionWork > 100000) throw new Error("Projection resolution budget exceeded");
  if (visiting.has(name) || visiting.size >= 64) throw new Error("Cyclic or over-deep reference");
  const token = effective.get(name); if (!token) throw new Error("Missing referenced token: " + name);
  if (!supportedTypes.has(token.type)) throw new Error("Unsupported token type: " + token.type);
  const next = new Set(visiting); next.add(name); let members = 0;
  const value = (input: unknown, depth = 0): unknown => {
   if (++resolutionWork > 100000) throw new Error("Projection resolution budget exceeded");
   if (++members > 10000 || depth > 64) throw new Error("Composite projection budget exceeded");
   if (typeof input === "string") {
    if (input.length > 10000) throw new Error("Token value length budget exceeded");
    const alias = /^\{([^{}]+)\}$/.exec(input); if (alias) return resolve(alias[1]!, next);
    return input.replace(/\{([^{}]+)\}/g, (_match, reference: string) => {
     const resolved = resolve(reference, next); if (typeof resolved !== "number" && typeof resolved !== "string") throw new Error("Composite interpolation unsupported"); return String(resolved);
    });
   }
   if (Array.isArray(input)) return input.map(entry => value(entry, depth + 1));
   if (input && typeof input === "object") return Object.fromEntries(Object.entries(input).map(([key, entry]) => [key, value(entry, depth + 1)]));
   if (input === null || typeof input === "boolean" || typeof input === "number" && Number.isFinite(input)) return input;
   throw new Error("Unsupported/nonfinite token value");
  };
  const resolved = value(token.value);
  return numericTypes.has(token.type) ? typeof resolved === "number" ? resolved : numericExpression(String(resolved)) : resolved;
 };
 return [...effective.values()].map(token => { try { return { name: token.name, type: token.type, value: resolve(token.name) }; } catch (error) { return { name: token.name, type: token.type, unknown: error instanceof Error ? error.message : String(error) }; } });
}
export interface ProjectedThemePreview {
 schemaVersion: 1; kind: "projected-theme-preview"; sourceHash: string;
 theme: { id: string | null; group: string; name: string };
 sets: Array<{ id: string | null; name: string; order: number }>;
 resolved: Array<{ name: string; type: string; value: unknown }>;
 unknowns: Array<{ name: string; type: string; reason: string }>;
 complete: boolean; nativeBindings: false;
}
export function projectTheme(catalog: ProjectionCatalog, themeName: string): ProjectedThemePreview {
 if (!catalog || !Array.isArray(catalog.themes) || catalog.themes.length > 1000 || typeof themeName !== "string" || !themeName) throw new Error("Projection needs a catalog and explicit theme name");
 for (const theme of catalog.themes) if (!theme || typeof theme.name !== "string" || typeof theme.group !== "string" || !Array.isArray(theme.sets)) throw new Error("Malformed declared theme");
 const matches = catalog.themes.filter(theme => theme.name === themeName || `${theme.group}/${theme.name}` === themeName);
 if (matches.length !== 1) throw new Error("Theme name is missing or ambiguous; use a unique group/name");
 const theme = matches[0]!, values = resolveDeclaredTokens(catalog, theme.sets);
 const resolved: ProjectedThemePreview["resolved"] = [], unknowns: ProjectedThemePreview["unknowns"] = [];
 for (const token of values) if (token.unknown) unknowns.push({ name: token.name, type: token.type, reason: token.unknown }); else resolved.push({ name: token.name, type: token.type, value: token.value });
 return { schemaVersion: 1, kind: "projected-theme-preview", sourceHash: observationHash(catalog), theme: { id: theme.id ?? null, group: theme.group, name: theme.name }, sets: catalog.sets.flatMap((set, order) => theme.sets.includes(set.name) ? [{ id: set.id ?? null, name: set.name, order }] : []), resolved, unknowns, complete: unknowns.length === 0, nativeBindings: false };
}
