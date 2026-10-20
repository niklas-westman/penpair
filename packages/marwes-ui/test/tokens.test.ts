import { describe, expect, it } from "vitest";
import { buildSnapshot, canonical, coreSetName, darkSetName, normalizeValue, toHexColor, tokensAbove } from "../src/tokens.js";
import { loadInstalledMarwes, familyProblems, MarwesError } from "../src/marwes.js";
import { loadThemeInput } from "../src/theme-input.js";
import { readMarwesSettings, MarwesConfigError } from "../src/config.js";
import { diffSnapshots, formatDiff } from "../src/snapshot-file.js";
import { fixture, acmeThemes } from "./helpers.js";
import path from "node:path";

async function snapshotFor(version = "1.11.0", themes: { light?: Record<string, unknown>; dark?: Record<string, unknown> } | null = acmeThemes) {
  const f = await fixture(version);
  const installed = await loadInstalledMarwes(path.join(f.root, "packages/app"));
  return { f, installed, snapshot: buildSnapshot({ core: installed.core, version: installed.version, name: "Acme", project: themes ?? undefined, generatedBy: "test" }) };
}

describe("the expected Penpot tokens", () => {
  it("put Marwes's light values in the core set, only what differs in dark in the dark set, and the project's choices in overlays", async () => {
    const { snapshot } = await snapshotFor();
    expect(snapshot.sets.map((s) => s.name)).toEqual([coreSetName, darkSetName, "Acme · Light", "Acme · Dark"]);
    const core = snapshot.sets[0]!.tokens;
    expect(core.find((t) => t.name === "mw-color-primary-base")).toMatchObject({ type: "color", value: "#2F31FC" });
    expect(core.find((t) => t.name === "mw-color-border-low")?.value).toBe("#00000026");
    expect(core.find((t) => t.name === "mw-spacing-sp-4")).toMatchObject({ type: "spacing", value: "4" });
    expect(core.filter((t) => t.type === "spacing").map((t) => t.value)).toEqual(["0", "4", "8"]);
    expect(core.find((t) => t.name === "mw-typography-h1")).toMatchObject({ type: "typography", value: { fontFamilies: "Instrument Sans", fontSize: "44", fontWeight: "700", lineHeight: "1.1", letterSpacing: "-1" } });
    expect(core.find((t) => t.name === "mw-typography-paragraph")?.value).toMatchObject({ fontWeight: "400", letterSpacing: "0" });
    expect(snapshot.sets[1]!.tokens.map((t) => t.name)).toEqual(["mw-color-background", "mw-color-primary-base", "mw-color-text"]);
    expect(snapshot.sets[2]!.tokens.map((t) => [t.name, t.value])).toEqual([["mw-color-primary-base", "#006633"], ["mw-ui-radius", "4"]]);
    expect(snapshot.sets[3]!.tokens.map((t) => [t.name, t.value])).toEqual([["mw-color-primary-base", "#2BA36B"], ["mw-ui-radius", "4"]]);
  });

  it("compose themes so that the project's sets come last and win", async () => {
    const { snapshot } = await snapshotFor();
    expect(snapshot.themes).toEqual([
      { group: "Mode", name: "Light", sets: [coreSetName, "Acme · Light"] },
      { group: "Mode", name: "Dark", sets: [coreSetName, darkSetName, "Acme · Dark"] },
    ]);
  });

  it("have no overlay when the project says nothing Marwes does not already say", async () => {
    const { snapshot } = await snapshotFor("1.11.0", { light: { mode: "light" }, dark: { mode: "dark" } });
    expect(snapshot.sets.map((s) => s.name)).toEqual([coreSetName, darkSetName]);
    expect(snapshot.themes[0]!.sets).toEqual([coreSetName]);
    expect((await snapshotFor("1.11.0", null)).snapshot.sets).toHaveLength(2);
  });

  it("are exactly reproducible, and their hash moves with a value, a version or a theme, never with who generated them", async () => {
    const a = (await snapshotFor()).snapshot;
    const b = (await snapshotFor()).snapshot;
    expect(b.hash).toBe(a.hash);
    expect(canonical(b)).toBe(canonical(a));
    expect((await snapshotFor("1.12.0")).snapshot.hash).not.toBe(a.hash);
    expect((await snapshotFor("1.11.0", { ...acmeThemes, light: { ...acmeThemes.light, color: { primary: "#007744" } } })).snapshot.hash).not.toBe(a.hash);
    const f = await fixture();
    const installed = await loadInstalledMarwes(path.join(f.root, "packages/app"));
    const other = buildSnapshot({ core: installed.core, version: "1.11.0", name: "Acme", project: acmeThemes, generatedBy: "another tool 9.9" });
    expect(other.hash).toBe(a.hash);
  });

  it("describe where every value came from, including the Marwes version", async () => {
    const { snapshot } = await snapshotFor();
    expect(snapshot.sets[0]!.tokens[0]!.description).toMatch(/\(Marwes 1\.11\.0\)$/);
    expect(snapshot.sets[2]!.tokens[0]!.description).toMatch(/Acme light theme \(Marwes 1\.11\.0\)$/);
  });
});

describe("values", () => {
  it("convert Marwes colours to Penpot hex, and refuse what they cannot", () => {
    expect(toHexColor("rgba(0, 0, 0, 0.5)")).toBe("#00000080");
    expect(toHexColor("transparent")).toBe("#00000000");
    expect(toHexColor("#abcdef")).toBe("#ABCDEF");
    expect(() => toHexColor("hsl(1, 2%, 3%)")).toThrow(/Unsupported colour/);
  });

  it("compare typography the way Penpot stores it", () => {
    const expected = normalizeValue("typography", { fontFamilies: "Inter", fontSize: "16" });
    expect(normalizeValue("typography", { fontFamily: ["Inter"], fontSize: "16" })).toBe(expected);
    expect(normalizeValue("typography", { fontFamily: ["Inter"], fontSize: "18" })).not.toBe(expected);
    expect(normalizeValue("color", "#aabbcc")).toBe("#AABBCC");
  });

  it("compare a font family the way Penpot stores it: as a list", () => {
    expect(normalizeValue("fontFamilies", ["Instrument Sans"])).toBe(normalizeValue("fontFamilies", "Instrument Sans"));
    expect(normalizeValue("fontFamilies", ["Helvetica"])).not.toBe(normalizeValue("fontFamilies", "Inter"));
  });

  it("tokensAbove keeps only what a base does not already say", () => {
    const token = (name: string, value: string) => ({ name, type: "color" as const, value, description: "" });
    expect(tokensAbove([token("a", "#111111"), token("b", "#222222")], [token("a", "#111111"), token("b", "#333333"), token("c", "#444444")]).map((t) => t.name)).toEqual(["b", "c"]);
  });
});

describe("the installed Marwes", () => {
  it("is found from the package that uses it, with the versions of the packages that go together", async () => {
    const f = await fixture("1.11.0");
    const installed = await loadInstalledMarwes(path.join(f.root, "packages/app"));
    expect(installed.version).toBe("1.11.0");
    expect(installed.versions).toEqual({ react: "1.11.0", core: "1.11.0", presets: "1.11.0" });
    expect(familyProblems(installed)).toEqual([]);
  });

  it("notices a half-finished upgrade", async () => {
    const f = await fixture("1.11.0");
    await f.installMarwes("1.11.0", { react: "1.10.1" });
    expect(familyProblems(await loadInstalledMarwes(path.join(f.root, "packages/app")))[0]).toMatch(/different versions[\s\S]*react 1\.10\.1/);
  });

  it("says where to point it when Marwes is not installed there", async () => {
    const f = await fixture();
    await expect(loadInstalledMarwes(f.root)).rejects.toThrow(MarwesError);
    await expect(loadInstalledMarwes(f.root)).rejects.toThrow(/marwes\.project/);
  });

  it("is accepted when its exports arrive as a default export, and refused when it lacks what the adapter needs", async () => {
    // A fresh project for each case: Node keeps a module it has already loaded.
    const withCore = async (source: string): Promise<string> => {
      const f = await fixture();
      await f.writeCore(source);
      return path.join(f.root, "packages/app");
    };
    const all = `const core = { resolveThemeInput: (i) => i, themeToCSSVars: () => ({}), mwThemeVars: { spacing: {} } };\nmodule.exports = core;\n`;
    expect((await loadInstalledMarwes(await withCore(all))).core.mwThemeVars.spacing).toEqual({});
    await expect(loadInstalledMarwes(await withCore("exports.resolveThemeInput = (i) => i;\n"))).rejects.toThrow(/does not export themeToCSSVars/);
    await expect(loadInstalledMarwes(await withCore("exports.resolveThemeInput = (i) => i; exports.themeToCSSVars = () => ({});\n"))).rejects.toThrow(/mwThemeVars\.spacing/);
  });
});

describe("the project's theme", () => {
  it("is loaded from the file the app itself uses, TypeScript included", async () => {
    const f = await fixture();
    const loaded = await loadThemeInput(f.root, { module: "packages/app/src/theme.ts", export: "acmeLight" });
    expect(loaded.input).toMatchObject({ mode: "light", color: { primary: "#006633" } });
    expect(loaded.fileHash).toMatch(/^[0-9a-f]{12}$/);
  });

  it("explains a missing file or export", async () => {
    const f = await fixture();
    await expect(loadThemeInput(f.root, { module: "packages/app/src/nope.ts", export: "x" })).rejects.toThrow(/does not exist/);
    await expect(loadThemeInput(f.root, { module: "packages/app/src/theme.ts", export: "nope" })).rejects.toThrow(/no object export named nope/);
  });
});

describe("the marwes settings in penpair.config.json", () => {
  it("have defaults, and a name taken from the instance", () => {
    expect(readMarwesSettings({}, "acme")).toEqual({ name: "Acme", project: ".", themes: {}, snapshot: "design/marwes-tokens.snapshot.json" });
  });

  it.each([
    [{ marwes: { project: "../outside" } }, /marwes\.project/],
    [{ marwes: { snapshot: "/abs.json" } }, /marwes\.snapshot/],
    [{ marwes: { themes: { light: { module: "a.ts" } } } }, /themes\.light/],
    [{ marwes: { name: "<bad>" } }, /marwes\.name/],
    [{ marwes: "x" }, /must be an object/],
  ])("reject %j", (raw, message) => {
    expect(() => readMarwesSettings(raw as Record<string, unknown>, "x")).toThrow(MarwesConfigError);
    expect(() => readMarwesSettings(raw as Record<string, unknown>, "x")).toThrow(message);
  });
});

describe("the difference between two expectations", () => {
  it("is empty for the same one, and says what a Marwes bump or a theme edit changed", async () => {
    const before = (await snapshotFor("1.11.0")).snapshot;
    expect(diffSnapshots(before, before).identical).toBe(true);
    const bumped = (await snapshotFor("1.12.0", { ...acmeThemes, light: { ...acmeThemes.light, color: { primary: "#007744" } } })).snapshot;
    const diff = diffSnapshots(before, bumped);
    expect(diff.identical).toBe(false);
    expect(diff.versionChange).toEqual({ before: "1.11.0", after: "1.12.0" });
    expect(diff.sets.find((s) => s.set === "Acme · Light")?.changed).toEqual([{ name: "mw-color-primary-base", before: "#006633", after: "#007744" }]);
    expect(formatDiff(diff).join("\n")).toMatch(/Marwes 1\.11\.0 -> 1\.12\.0[\s\S]*mw-color-primary-base #006633 -> #007744/);
  });

  it("calls a missing snapshot new, and a removed set no longer expected", async () => {
    const { snapshot } = await snapshotFor();
    expect(diffSnapshots(undefined, snapshot).sets.every((s) => s.setAdded)).toBe(true);
    const smaller = { ...snapshot, sets: snapshot.sets.slice(0, 2), themes: snapshot.themes.map((t) => ({ ...t, sets: t.sets.slice(0, 2) })) };
    expect(diffSnapshots(snapshot, smaller).sets.filter((s) => s.setRemoved).map((s) => s.set)).toEqual(["Acme · Light", "Acme · Dark"]);
  });
});

describe("variables the adapter does not turn into tokens", () => {
  it("are listed in the snapshot, so a new kind of Marwes variable cannot slip by unseen", async () => {
    const f = await fixture();
    await f.writeCore(`exports.resolveThemeInput = (i) => i;
exports.themeToCSSVars = (t) => ({ "--mw-color-text": "#141414", "--mw-density-input-height": "40px", "--mw-density-mode": "comfortable", "--mw-shadow-card": "0 1px 2px #000", "--mw-ui-radius": "8px", "--mw-ui-radius-button": "8px", "--mw-font-primary": "Inter", "--mw-font-secondary": "Inter", "--mw-font-mono": "Mono" });
exports.mwThemeVars = { spacing: {} };\n`);
    const installed = await loadInstalledMarwes(path.join(f.root, "packages/app"));
    const snapshot = buildSnapshot({ core: installed.core, version: "1.12.0", name: "Acme", generatedBy: "test" });
    expect(snapshot.unmapped).toEqual(["--mw-density-mode", "--mw-shadow-card"]);
    const without = buildSnapshot({ core: { ...installed.core, themeToCSSVars: (t) => Object.fromEntries(Object.entries(installed.core.themeToCSSVars(t)).filter(([k]) => k !== "--mw-shadow-card")) }, version: "1.12.0", name: "Acme", generatedBy: "test" });
    expect(without.hash).not.toBe(snapshot.hash);
    const diff = diffSnapshots(without, snapshot);
    expect(diff.identical).toBe(false);
    expect(diff.unmapped.added).toEqual(["--mw-shadow-card"]);
    expect(formatDiff(diff).join("\n")).toMatch(/NEW Marwes variables that are not tokens[\s\S]*--mw-shadow-card/);
  });
});
