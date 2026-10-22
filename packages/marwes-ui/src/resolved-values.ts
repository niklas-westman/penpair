import { canonical, normalizeValue, toHexColor, type TokenSnapshot } from "./tokens.js";

import { numericExpression, resolveDeclaredTokens, type ResolvedDeclaredToken } from "@penpair/core";
export { numericExpression } from "@penpair/core";
export type ResolvedExpectation = ResolvedDeclaredToken;
const numericTypes = new Set(["borderRadius", "dimension", "fontSizes", "letterSpacing", "number", "opacity", "rotation", "sizing", "spacing", "borderWidth"]);
export function expectedResolved(snapshot: TokenSnapshot, theme: { sets: string[] }): ResolvedExpectation[] { return resolveDeclaredTokens(snapshot, theme.sets); }
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
