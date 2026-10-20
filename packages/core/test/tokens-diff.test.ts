import { describe, expect, it } from "vitest";
import { diffEffective, effectiveValues, type TokenDump } from "../src/tokens-diff.js";

const dump = (override: string[]): TokenDump => ({
  sets: [
    { order: 0, name: "Base", active: true, tokens: ["color-a=#111", "color-b=#222", "shadow=[object Object]"] },
    { order: 1, name: "Brand", active: true, tokens: override },
  ],
  themes: [{ group: "Mode", name: "Light", active: true, sets: ["Base", "Brand"] }],
});

describe("effective token values", () => {
  it("lets a later set win", () => {
    const values = effectiveValues(dump(["color-a=#999"]), "Light");
    expect(values.get("color-a")).toBe("#999");
    expect(values.get("color-b")).toBe("#222");
  });

  it("shows no difference when a value moves between sets without changing", () => {
    const before = effectiveValues(dump(["color-a=#999"]), "Light");
    const moved: TokenDump = { ...dump([]), sets: [{ order: 0, name: "Base", active: true, tokens: ["color-a=#999", "color-b=#222", "shadow=[object Object]"] }, { order: 1, name: "Brand", active: true, tokens: [] }] };
    expect(diffEffective(before, effectiveValues(moved, "Light"))).toEqual({ added: [], removed: [], changed: [] });
  });

  it("lists what was added, removed and changed, and compares object-valued tokens by name only", () => {
    const before = effectiveValues(dump(["color-a=#999"]), "Light");
    const after = effectiveValues(dump(["color-a=#888", "color-c=#333"]), "Light");
    const diff = diffEffective(before, after);
    expect(diff.added).toEqual(["color-c"]);
    expect(diff.changed).toEqual([{ name: "color-a", before: "#999", after: "#888" }]);
    expect(diff.removed).toEqual([]);
  });

  it("refuses an unknown theme", () => {
    expect(() => effectiveValues(dump([]), "Dark")).toThrow(/no theme/);
  });
});
