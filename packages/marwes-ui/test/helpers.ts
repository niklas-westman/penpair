import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { PenpotToolClient } from "@penpair/core";

/** A stand-in for @marwes-ui/core: the same three exports the adapter uses, with a few real-looking tokens. */
const fakeCore = `
const light = {
  "--mw-color-background": "#FFFFFF", "--mw-color-text": "#141414", "--mw-color-primary-base": "#2F31FC", "--mw-color-border-low": "rgba(0, 0, 0, 0.15)",
  "--mw-density-input-height": "40px", "--mw-ui-radius": "8px", "--mw-ui-radius-button": "8px",
  "--mw-font-primary": "'Instrument Sans', sans-serif", "--mw-font-secondary": "'Instrument Sans', sans-serif", "--mw-font-mono": "'JetBrains Mono', monospace",
  "--mw-typography-h1-font-size": "44px", "--mw-typography-h1-line-height": "1.1", "--mw-typography-h1-font-weight": "700", "--mw-typography-h1-letter-spacing": "-1px",
  "--mw-typography-paragraph-font-size": "16px", "--mw-typography-paragraph-line-height": "1.5",
};
const dark = { ...light, "--mw-color-background": "#141414", "--mw-color-text": "#FFFFFF", "--mw-color-primary-base": "#7A7CFF" };
exports.resolveThemeInput = (input) => ({ ...input });
exports.themeToCSSVars = (theme) => {
  const vars = { ...(theme.mode === "dark" ? dark : light) };
  if (theme.color && theme.color.primary) vars["--mw-color-primary-base"] = theme.color.primary;
  if (theme.color && theme.color.background) vars["--mw-color-background"] = theme.color.background;
  if (theme.ui && theme.ui.radius !== undefined) vars["--mw-ui-radius"] = theme.ui.radius + "px";
  if (theme.font && theme.font.primary) vars["--mw-font-primary"] = theme.font.primary;
  return vars;
};
exports.mwThemeVars = { spacing: { a: "var(--mw-spacing-sp-0)", b: "var(--mw-spacing-sp-8)", c: "var(--mw-spacing-sp-4)" } };
`;

export interface Fixture {
  root: string;
  /** Re-installs the fake Marwes at another version, as a Marwes bump would. */
  installMarwes(version: string, versions?: Partial<Record<"react" | "core" | "presets", string>>): Promise<void>;
  /** Replaces the source of the installed @marwes-ui/core. */
  writeCore(source: string): Promise<void>;
  writeConfig(extra?: Record<string, unknown>): Promise<void>;
  writeTheme(light: Record<string, unknown>, dark?: Record<string, unknown>): Promise<void>;
}

export const acmeThemes = {
  light: { mode: "light", color: { primary: "#006633" }, ui: { radius: 4 } },
  dark: { mode: "dark", color: { primary: "#2BA36B" }, ui: { radius: 4 } },
};

/** A project folder with Marwes "installed" in an app package, a theme file written in TypeScript, and a penpair.config.json. */
export async function fixture(version = "1.11.0"): Promise<Fixture> {
  const root = await mkdtemp(path.join(os.tmpdir(), "penpair-marwes-"));
  const app = path.join(root, "packages/app");
  await mkdir(path.join(app, "src"), { recursive: true });
  await writeFile(path.join(app, "package.json"), JSON.stringify({ name: "app", private: true }));
  const installMarwes = async (v: string, versions: Partial<Record<"react" | "core" | "presets", string>> = {}): Promise<void> => {
    for (const name of ["react", "core", "presets"] as const) {
      const directory = path.join(app, "node_modules/@marwes-ui", name);
      await mkdir(directory, { recursive: true });
      await writeFile(path.join(directory, "package.json"), JSON.stringify({ name: `@marwes-ui/${name}`, version: versions[name] ?? v, main: "index.js" }));
      await writeFile(path.join(directory, "index.js"), name === "core" ? fakeCore : `module.exports = {};\n`);
    }
  };
  const writeConfig = async (extra: Record<string, unknown> = {}): Promise<void> => {
    await writeFile(
      path.join(root, "penpair.config.json"),
      JSON.stringify({
        instance: "acme",
        profile: { type: "external", origin: "https://design.penpot.app" },
        adapters: ["@penpair/marwes-ui"],
        marwes: { project: "packages/app", themes: { light: { module: "packages/app/src/theme.ts", export: "acmeLight" }, dark: { module: "packages/app/src/theme.ts", export: "acmeDark" } } },
        ...extra,
      }),
    );
  };
  const writeTheme = async (light: Record<string, unknown>, dark: Record<string, unknown> = acmeThemes.dark): Promise<void> => {
    await writeFile(
      path.join(app, "src/theme.ts"),
      `import type { ThemeInput } from "@marwes-ui/react";\nexport const acmeLight: ThemeInput = ${JSON.stringify(light)};\nexport const acmeDark: ThemeInput = ${JSON.stringify(dark)};\n`,
    );
  };
  const writeCore = async (source: string): Promise<void> => void (await writeFile(path.join(app, "node_modules/@marwes-ui/core/index.js"), source));
  await installMarwes(version);
  await writeConfig();
  await writeTheme(acmeThemes.light);
  return { root, installMarwes, writeCore, writeConfig, writeTheme };
}

// ---- A small in-memory Penpot: the token API the adapter uses, with the quirks found on the real one. ----

interface FakeShape { id: string; type: string; name: string; x: number; y: number; width: number; height: number; tokens?: Record<string, string>; children?: FakeShape[] }

export interface FakePenpot {
  client: PenpotToolClient;
  sets: FakeSet[];
  themes: FakeTheme[];
  shapes: FakeShape[];
  calls: string[];
  /** Makes the next addToken of this name throw, as Penpot does for a value it rejects. */
  rejectToken(name: string): void;
  allowToken(name: string): void;
}

class FakeToken {
  constructor(public name: string, public type: string, public value: unknown, public description: string, private owner: FakeSet) {}
  remove(): void {
    this.owner.tokens = this.owner.tokens.filter((t) => t !== this);
  }
}

class FakeSet {
  active = false;
  tokens: FakeToken[] = [];
  constructor(public name: string, private reject: Set<string>) {}
  toggleActive(): void {
    this.active = !this.active;
  }
  addToken(spec: { type: string; name: string; value: unknown; description?: string }): FakeToken {
    if (this.reject.has(spec.name)) throw new Error("value rejected: " + spec.name);
    let value = spec.value;
    // Penpot normalises a typography token when it is created: the family becomes a list under `fontFamily`.
    if (spec.type === "typography" && typeof value === "object" && value !== null) {
      const { fontFamilies, fontFamily, ...rest } = value as Record<string, unknown>;
      const family = fontFamilies ?? fontFamily;
      value = { ...(family === undefined ? {} : { fontFamily: Array.isArray(family) ? family : [family] }), ...rest };
    }
    // The same for a font family token: Penpot reads it back as a list.
    if (spec.type === "fontFamilies") value = Array.isArray(value) ? value : [value];
    const token = new FakeToken(spec.name, spec.type, value, spec.description ?? "", this);
    this.tokens.push(token);
    return token;
  }
  remove(): void {}
}

class FakeTheme {
  active = false;
  activeSets: FakeSet[] = [];
  constructor(public group: string, public name: string) {}
  addSet(set: FakeSet): void {
    if (!this.activeSets.includes(set)) this.activeSets.push(set);
  }
  removeSet(set: FakeSet): void {
    this.activeSets = this.activeSets.filter((s) => s !== set);
  }
  toggleActive(): void {
    this.active = !this.active;
  }
}

export function fakePenpot(shapes: FakeShape[] = []): FakePenpot {
  const reject = new Set<string>();
  const state: Pick<FakePenpot, "sets" | "themes" | "shapes" | "calls"> = { sets: [], themes: [], shapes, calls: [] };
  const root = { id: "fixture-root", x: 0, y: 0, width: 0, height: 0, children: shapes };
  const page = { id: "fixture-page", name: "Page 1", root };
  const penpot = {
    currentPage: page,
    waitForLayoutUpdate: async () => undefined,
    library: {
      local: {
        tokens: {
          get sets() {
            return state.sets;
          },
          get themes() {
            return state.themes;
          },
          addSet({ name }: { name: string }) {
            const set = new FakeSet(name, reject);
            state.sets.push(set);
            return set;
          },
          addTheme({ group, name }: { group: string; name: string }) {
            const theme = new FakeTheme(group, name);
            state.themes.push(theme);
            return theme;
          },
        },
      },
    },
    currentFile: { id: "fixture-file", revn: 1, pages: [page] },
  };
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (...args: string[]) => (penpot: unknown) => Promise<unknown>;
  const client: PenpotToolClient = {
    async callTool(_name, args) {
      const code = String((args as { code: string }).code);
      state.calls.push(/const CFG[^;]*;\n?try \{\n([\s\S]{0,60})/.exec(code)?.[1]?.trim().slice(0, 40) ?? "");
      const result = await new AsyncFunction("penpot", code)(penpot);
      return { text: JSON.stringify({ result, log: "" }), isError: false };
    },
    async close() {},
  };
  return { client, ...state, rejectToken: (name) => void reject.add(name), allowToken: (name) => void reject.delete(name) };
}
