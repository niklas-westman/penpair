import { expect, it } from "vitest";
import { projectTheme, resolveDeclaredTokens, type ProjectionCatalog } from "../src/token-projection.js";
const catalog = (): ProjectionCatalog => ({ sets: [
 { id: "base", name: "Base", tokens: [{ name: "ink", type: "color", value: "#000000" }, { name: "gap", type: "spacing", value: "4" }, { name: "twice", type: "spacing", value: "{gap} * 2" }, { name: "type", type: "typography", value: { fontFamilies: "Example", fontSize: "{twice}", fontWeight: "400" } }] },
 { id: "night", name: "Night", tokens: [{ name: "ink", type: "color", value: "#FFFFFF" }, { name: "gap", type: "spacing", value: "8" }] },
], themes: [{ id: "light", group: "Mode", name: "Light", sets: ["Base"] }, { id: "dark", group: "Mode", name: "Dark", sets: ["Night", "Base"] }] });
it("projects two themes deterministically in catalog order without mutating source selections or values", () => {
 const input = catalog(), before = JSON.stringify(input);
 const light = projectTheme(input, "Light"), dark = projectTheme(input, "Mode/Dark");
 expect(light).toMatchObject({ kind: "projected-theme-preview", nativeBindings: false, complete: true, theme: { id: "light" }, resolved: expect.arrayContaining([{ name: "ink", type: "color", value: "#000000" }, { name: "twice", type: "spacing", value: 8 }]) });
 expect(dark.resolved).toEqual(expect.arrayContaining([{ name: "ink", type: "color", value: "#FFFFFF" }, { name: "twice", type: "spacing", value: 16 }]));
 expect(projectTheme(input, "Light")).toEqual(light); expect(JSON.stringify(input)).toBe(before);
 expect(dark.sets.map(set => set.id)).toEqual(["base", "night"]);
});
it("keeps cycles, missing aliases, unsupported expressions and nested composite values explicit", () => {
 const input = catalog(); input.sets[0]!.tokens.push({ name: "cycle", type: "spacing", value: "{cycle}" }, { name: "missing", type: "color", value: "{gone}" }, { name: "unit", type: "spacing", value: "4rem" }, { name: "nested", type: "shadow", value: [{ color: "{ink}", offsetX: "2" }] }, { name: "unknown", type: "unsupported", value: 1 });
 const result = projectTheme(input, "Light");
 expect(result.complete).toBe(false); expect(result.unknowns.map(token => token.name)).toEqual(["cycle", "missing", "unit", "unknown"]);
 expect(result.resolved).toContainEqual({ name: "nested", type: "shadow", value: [{ color: "#000000", offsetX: "2" }] });
});
it("rejects ambiguous themes and malformed/missing set dependencies", () => {
 const input = catalog(); input.themes.push({ group: "Brand", name: "Light", sets: ["Base"] });
 expect(() => projectTheme(input, "Light")).toThrow(/ambiguous/);
 expect(projectTheme(input, "Mode/Light").complete).toBe(true);
 expect(() => projectTheme(input, "gone")).toThrow(/missing/);
 input.themes[0]!.sets.push("gone"); expect(() => projectTheme(input, "Mode/Light")).toThrow(/missing token set/);
 expect(() => resolveDeclaredTokens({ sets: [input.sets[0]!, input.sets[0]!] }, ["Base"])).toThrow(/unique/);
 input.sets[0]!.tokens.push(input.sets[0]!.tokens[0]!); expect(() => projectTheme(input, "Mode/Light")).toThrow(/Ambiguous/);
});
it("bounds adversarial recursive alias expansion", () => {
 const tokens = [{ name: "a0", type: "shadow", value: {} as unknown }];
 for (let i = 1; i < 25; i++) tokens.push({ name: `a${i}`, type: "shadow", value: { a: `{a${i-1}}`, b: `{a${i-1}}` } });
 const result = resolveDeclaredTokens({ sets: [{ name: "Base", tokens }] }, ["Base"]);
 expect(result.some(token => token.unknown?.includes("budget"))).toBe(true);
});
