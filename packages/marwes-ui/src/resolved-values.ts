import { canonical, normalizeValue, toHexColor, type TokenSnapshot } from "./tokens.js";

export interface ResolvedExpectation { name: string; type: string; value?: unknown; unknown?: string }
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
export function expectedResolved(snapshot: TokenSnapshot, theme: { sets: string[] }): ResolvedExpectation[] {
  const effective = new Map(snapshot.sets.filter(set => theme.sets.includes(set.name)).flatMap(set => set.tokens.map(token => [token.name, token] as const)));
  const resolve = (name: string, visiting = new Set<string>()): unknown => {
    if (visiting.has(name) || visiting.size >= 64) throw new Error("Cyclic or over-deep reference");
    const token = effective.get(name); if (!token) throw new Error("Missing referenced token: " + name);
    const next = new Set(visiting); next.add(name);
    const value = (input: unknown): unknown => {
      if (typeof input === "string") {
        const alias = /^\{([^{}]+)\}$/.exec(input); if (alias) return resolve(alias[1]!, next);
        return input.replace(/\{([^{}]+)\}/g, (_match, reference: string) => {
          const resolved = resolve(reference, next); if (typeof resolved !== "number" && typeof resolved !== "string") throw new Error("Composite interpolation unsupported"); return String(resolved);
        });
      }
      if (input && typeof input === "object" && !Array.isArray(input)) return Object.fromEntries(Object.entries(input).map(([key, entry]) => [key, value(entry)]));
      return input;
    };
    const resolved = value(token.value);
    return numericTypes.has(token.type) ? typeof resolved === "number" ? resolved : numericExpression(String(resolved)) : resolved;
  };
  return [...effective.values()].map(token => { try { return { name: token.name, type: token.type, value: resolve(token.name) }; } catch (error) { return { name: token.name, type: token.type, unknown: String((error as Error).message) }; } });
}
export function compareResolved(wanted: ResolvedExpectation, actual: unknown): { equal?: boolean; unknown?: string } {
  if (wanted.unknown) return { unknown: wanted.unknown };
  if (actual === undefined || actual === null) return { unknown: "API resolvedValue is unavailable" };
  try {
    if (numericTypes.has(wanted.type)) { const value = typeof actual === "number" ? actual : numericExpression(String(actual)); return { equal: typeof wanted.value === "number" && Math.abs(value - wanted.value) <= 1e-9 * Math.max(1, Math.abs(wanted.value)) }; }
    if (wanted.type === "color") {
      const color = (value: unknown): string => { if (typeof value !== "string") throw new Error("Unsupported resolved color"); const expanded = /^#[0-9a-f]{3,4}$/i.test(value) ? "#" + value.slice(1).split("").map(c => c + c).join("") : value; const hex = toHexColor(expanded); return hex.length === 9 && hex.endsWith("FF") ? hex.slice(0, -2) : hex; };
      return { equal: color(wanted.value) === color(actual) };
    }
    if (wanted.type === "fontFamilies" && Array.isArray(actual) && !actual.every(value => typeof value === "string")) return { unknown: "Unsupported nested font resolution" };
    if (wanted.type === "shadow") return { unknown: "Composite shadow resolution has no supported comparison model" };
    if (wanted.type === "typography") {
      const normalize = (input: unknown): Record<string, unknown> => {
        const object = Array.isArray(input) ? input.length === 1 ? input[0] : undefined : input;
        if (!object || typeof object !== "object" || Array.isArray(object)) throw new Error("Unsupported typography resolution");
        const aliases: Record<string, string> = { fontFamilies: "fontFamily", fontSizes: "fontSize", fontWeights: "fontWeight" };
        return Object.fromEntries(Object.entries(object).map(([key, value]) => {
          key = aliases[key] ?? key;
          if (key === "fontFamily") { const family = Array.isArray(value) ? value : [value]; if (!family.every(v => typeof v === "string")) throw new Error("Unsupported nested font resolution"); return [key, family]; }
          return [key, ["fontSize", "letterSpacing", "lineHeight"].includes(key) ? String(numericExpression(String(value))) : String(value)];
        }));
      };
      const expected = normalize(wanted.value), observed = normalize(actual);
      return { equal: Object.keys(expected).every(key => canonical(expected[key]) === canonical(observed[key])) };
    }
    return { equal: normalizeValue(wanted.type, wanted.value) === normalizeValue(wanted.type, actual) };
  } catch (error) { return { unknown: String((error as Error).message) }; }
}
