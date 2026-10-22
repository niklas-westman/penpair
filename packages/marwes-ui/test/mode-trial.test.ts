import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  collectCommand,
  loadConfig,
  readRawConfig,
  type AdapterContext,
  type PenpotToolClient,
} from "@penpair/core";
import { computeExpectation, marwesCommand } from "../src/commands.js";
import { fixture as projectFixture } from "./helpers.js";
import { runModeTrial } from "../src/mode-trial.js";
import type { TokenSnapshot } from "../src/tokens.js";

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const themeSnapshot = (): TokenSnapshot => ({
  schemaVersion: 2,
  marwesVersion: "1",
  generatedBy: "test",
  project: "Acme",
  hash: "expected",
  unmapped: [],
  ownership: {
    Core: "adapter",
    Dark: "adapter",
  },
  sets: [
    {
      name: "Core",
      tokens: [
        {
          name: "color",
          type: "color",
          value: "#FFFFFF",
          description: "",
        },
        {
          name: "radius",
          type: "borderRadius",
          value: "8",
          description: "",
        },
      ],
    },
    {
      name: "Dark",
      tokens: [
        {
          name: "color",
          type: "color",
          value: "#141414",
          description: "",
        },
      ],
    },
  ],
  themes: [
    {
      group: "Mode",
      name: "Light",
      sets: [
        "Core",
      ],
    },
    {
      group: "Mode",
      name: "Dark",
      sets: [
        "Core",
        "Dark",
      ],
    },
  ],
});
function fixture(expected = themeSnapshot()) {
  const sets: Set[] = [];
  const themes: Theme[] = [];
  let revision = 1;
  let selections = 0;
  let lose = false;
  let refuseRestore = false;
  let afterSelect: (() => void) | undefined;
  class Token {
    constructor(
      public name: string,
      public type: string,
      public value: string,
      public description = "",
    ) {}
    get resolvedValue(): unknown {
      const last = sets
        .filter((set) => set.active)
        .flatMap((set) => set.tokens)
        .filter((token) => token.name === this.name)
        .at(-1);
      if (!last) {
        return undefined;
      }
      return [
        "borderRadius",
        "number",
      ].includes(last.type)
        ? Number(last.value)
        : last.value;
    }
  }
  class Set {
    active = false;
    tokens: Token[];
    id: string;
    constructor(
      public name: string,
      tokens: Token[],
    ) {
      this.id = "set-" + name.toLowerCase();
      this.tokens = tokens;
    }
    toggleActive() {
      this.active = !this.active;
      for (const theme of themes) {
        theme.active = false;
      }
      revision++;
    }
  }
  class Theme {
    active = false;
    id: string;
    constructor(
      public group: string,
      public name: string,
      public activeSets: Set[],
    ) {
      this.id = "theme-" + name.toLowerCase();
    }
    toggleActive() {
      this.active = !this.active;
      if (this.active) {
        for (const theme of themes) {
          if (theme !== this && theme.group === this.group) {
            theme.active = false;
          }
        }
      }
      for (const set of this.activeSets) {
        set.active =
          this.active || themes.some((theme) => theme.active && theme.activeSets.includes(set));
      }
      revision++;
    }
  }
  const core = new Set(
    expected.sets[0]!.name,
    expected.sets[0]!.tokens.map((token) => new Token(token.name, token.type, String(token.value))),
  );
  const dark = new Set(
    expected.sets[1]!.name,
    expected.sets[1]!.tokens.map((token) => new Token(token.name, token.type, String(token.value))),
  );
  const density = new Set("Density", [
    new Token("density", "number", "1"),
  ]);
  sets.push(core, dark, density);
  const lightTheme = new Theme("Mode", "Light", [
    core,
  ]);
  const darkTheme = new Theme("Mode", "Dark", [
    core,
    dark,
  ]);
  const denseTheme = new Theme("Density", "Compact", [
    density,
  ]);
  themes.push(lightTheme, darkTheme, denseTheme);
  lightTheme.toggleActive();
  denseTheme.toggleActive();
  const shape = {
    id: "frame",
    type: "board",
    name: "Frame",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    children: [],
    export: async () => new TextEncoder().encode(darkTheme.active ? "dark pixels" : "light pixels"),
  };
  const page = {
    id: "page",
    name: "Candidate",
    root: {
      id: "root",
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      children: [
        shape,
      ],
    },
    getShapeById: (id: string) => (id === shape.id ? shape : undefined),
  };
  const file = {
    id: "file",
    name: "Fixture",
    get revn() {
      return revision;
    },
    pages: [
      page,
    ],
  };
  const penpot = {
    currentFile: file,
    currentPage: page,
    library: {
      local: {
        tokens: {
          sets,
          themes,
        },
      },
    },
    waitForLayoutUpdate: async () => {},
  };
  const selection = () => ({
    sets: sets.map((set) => [
      set.id,
      set.active,
    ]),
    themes: themes.map((theme) => [
      theme.id,
      theme.active,
    ]),
  });
  const original = JSON.stringify(selection());
  const client: PenpotToolClient = {
    async callTool(_name, args) {
      const code = String(args.code);
      const mutation = code.includes("Direct set changes disable themes");
      if (mutation && refuseRestore && code.includes('"id":"set-density","active":true')) {
        throw new Error("restoration unavailable");
      }
      const result = await new AsyncFunction("penpot", code)(penpot);
      if (mutation) {
        selections++;
        afterSelect?.();
        if (lose) {
          lose = false;
          throw new Error("lost selection acknowledgment");
        }
      }
      return {
        text: JSON.stringify({
          result,
          log: "",
        }),
        isError: false,
      };
    },
    async close() {},
  };
  return {
    client,
    sets,
    themes,
    original,
    selection,
    get selections() {
      return selections;
    },
    loseNext() {
      lose = true;
    },
    failRestore() {
      refuseRestore = true;
    },
    afterSelect(callback: () => void) {
      afterSelect = callback;
    },
  };
}
const root = () => mkdtemp(path.join(os.tmpdir(), "penpair-modes-"));
describe("resolved mode trials and complete selection restoration", () => {
  it("inspects without mutation then measures actual light/dark values and restores all original groups", async () => {
    const f = fixture();
    const project = await root();
    const preview = await runModeTrial(f.client, themeSnapshot(), {
      root: project,
    });
    expect(preview).toMatchObject({
      phase: "inspected",
      complete: true,
      verified: false,
      plannedStates: [
        {
          name: "Light",
          activeSets: [
            "Core",
          ],
        },
        {
          name: "Dark",
          activeSets: [
            "Core",
            "Dark",
          ],
        },
      ],
    });
    expect(f.selections).toBe(0);
    const report = await runModeTrial(f.client, themeSnapshot(), {
      root: project,
      apply: true,
    });
    expect(report).toMatchObject({
      complete: true,
      verified: true,
      restoration: {
        verified: true,
      },
      journal: {
        state: "verified",
      },
    });
    expect(report.modes[1]?.values.find((value) => value.name === "color")).toMatchObject({
      actual: "#141414",
      expected: "#141414",
      equal: true,
    });
    expect(JSON.stringify(f.selection())).toBe(f.original);
  });
  it("restores custom active sets with no active themes", async () => {
    const f = fixture();
    for (const theme of f.themes) {
      theme.active = false;
    }
    f.sets[0]!.active = true;
    f.sets[1]!.active = true;
    f.sets[2]!.active = false;
    const before = JSON.stringify(f.selection());
    const report = await runModeTrial(f.client, themeSnapshot(), {
      root: await root(),
      apply: true,
      sleep: async () => {},
    });
    expect(report.verified).toBe(true);
    expect(JSON.stringify(f.selection())).toBe(before);
  });
  it("detects global set-order mistakes independently of theme membership", async () => {
    const f = fixture();
    [f.sets[0], f.sets[1]] = [
      f.sets[1]!,
      f.sets[0]!,
    ];
    const report = await runModeTrial(f.client, themeSnapshot(), {
      root: await root(),
      apply: true,
    });
    expect(report.complete).toBe(true);
    expect(report.verified).toBe(false);
    expect(report.modes[1]).toMatchObject({
      orderMatches: false,
      matches: false,
    });
    expect(report.restoration.verified).toBe(true);
  });
  it("restores after uncertain activation without replaying that activation", async () => {
    const f = fixture();
    f.loseNext();
    const report = await runModeTrial(f.client, themeSnapshot(), {
      root: await root(),
      apply: true,
    });
    expect(report).toMatchObject({
      complete: false,
      uncertain: true,
      restoration: {
        verified: true,
      },
    });
    expect(f.selections).toBe(2); // one delivered activation and a distinct restoration
    expect(JSON.stringify(f.selection())).toBe(f.original);
  });
  it("reports restoration failure even when every measured mode matched and preserves prior artifacts", async () => {
    const f = fixture();
    const project = await root();
    f.failRestore();
    await mkdir(path.join(project, "design/modes"), {
      recursive: true,
    });
    await writeFile(path.join(project, "design/modes/manifest.json"), "prior");
    const report = await runModeTrial(f.client, themeSnapshot(), {
      root: project,
      apply: true,
      sleep: async () => {},
      frame: {
        id: "frame",
        page: "Candidate",
        out: "design/modes",
      },
    });
    expect(report.modes.every((mode) => mode.matches)).toBe(true);
    expect(report).toMatchObject({
      complete: false,
      verified: false,
      restoration: {
        verified: false,
        error: expect.any(String),
      },
    });
    expect(await readFile(path.join(project, "design/modes/manifest.json"), "utf8")).toBe("prior");
  });
  it("runs bounded cleanup after cancellation without hiding the cancelled command", async () => {
    const f = fixture();
    const project = await root();
    const controller = new AbortController();
    f.afterSelect(() => {
      if (!controller.signal.aborted) {
        controller.abort(new Error("cancelled"));
      }
    });
    let restoration = false;
    const result = await collectCommand(
      "modes",
      async () => {
        const report = await runModeTrial(f.client, themeSnapshot(), {
          root: project,
          apply: true,
        });
        restoration = report.restoration.verified;
        return report.uncertain ? 4 : 130;
      },
      {
        signal: controller.signal,
      },
    );
    expect(restoration).toBe(true);
    expect([
      4,
      130,
    ]).toContain(result.exitCode);
    expect(JSON.stringify(f.selection())).toBe(f.original);
  });
  it("keeps missing resolved values incomplete and refuses unsupported identities before changing selection", async () => {
    const f = fixture();
    for (const set of f.sets) {
      for (const token of set.tokens) {
        Object.defineProperty(token, "resolvedValue", {
          get: () => undefined,
        });
      }
    }
    const report = await runModeTrial(f.client, themeSnapshot(), {
      root: await root(),
      apply: true,
      sleep: async () => {},
    });
    expect(report).toMatchObject({
      complete: false,
      verified: false,
      restoration: {
        verified: true,
      },
    });
    expect(report.modes[0]?.values.every((value) => !!value.unknown)).toBe(true);
    const unsupported = fixture();
    unsupported.sets[0]!.id = "";
    await expect(
      runModeTrial(unsupported.client, themeSnapshot(), {
        root: await root(),
        apply: true,
      }),
    ).rejects.toThrow(/Stable/);
    expect(unsupported.selections).toBe(0);
  });
  it("does not pass an ignored activation and restores after the measured failure", async () => {
    const f = fixture();
    f.themes[1]!.toggleActive = () => {};
    const report = await runModeTrial(f.client, themeSnapshot(), {
      root: await root(),
      apply: true,
      sleep: async () => {},
    });
    expect(report).toMatchObject({
      complete: false,
      verified: false,
      error: expect.stringMatching(/activation/),
      restoration: {
        verified: true,
      },
    });
    expect(JSON.stringify(f.selection())).toBe(f.original);
  });
  it("preserves a concurrent declaration edit and reports that selection restoration needs inspection", async () => {
    const f = fixture();
    let changed = false;
    f.afterSelect(() => {
      if (!changed) {
        changed = true;
        f.sets[0]!.tokens[0]!.value = "#000000";
      }
    });
    const report = await runModeTrial(f.client, themeSnapshot(), {
      root: await root(),
      apply: true,
      sleep: async () => {},
    });
    expect(report.restoration.verified).toBe(false);
    expect(report.complete).toBe(false);
    expect(f.sets[0]!.tokens[0]!.value).toBe("#000000");
  });
  it("does not publish apparently complete evidence after journal redaction", async () => {
    const f = fixture();
    const project = await root();
    f.sets[0]!.tokens[0]!.description = "SENSITIVE";
    const report = await runModeTrial(f.client, themeSnapshot(), {
      root: project,
      apply: true,
      sleep: async () => {},
      redact: (value) => value.replaceAll("SENSITIVE", "[REDACTED]"),
      frame: {
        id: "frame",
        page: "Candidate",
        out: "design/modes",
      },
    });
    expect(report).toMatchObject({
      complete: false,
      verified: false,
      redacted: true,
      restoration: {
        verified: true,
      },
    });
    await expect(readFile(path.join(project, "design/modes/manifest.json"))).rejects.toThrow();
  });
  it("wires adapter CLI inspection and applied resolution through the same service", async () => {
    const project = await projectFixture();
    await project.writeCore(
      `exports.resolveThemeInput=input=>input;exports.themeToCSSVars=input=>({"--mw-color-background":input.mode==="dark"?"#141414":"#FFFFFF"});exports.mwThemeVars={spacing:{}};`,
    );
    await project.writeConfig({
      marwes: {
        project: "packages/app",
      },
    });
    const rawConfig = await readRawConfig(project.root);
    const desired = (await computeExpectation(project.root, rawConfig, "acme")).fresh;
    const f = fixture(desired);
    const output: unknown[] = [];
    const context: AdapterContext = {
      root: project.root,
      rawConfig,
      config: await loadConfig(project.root),
      log: () => {},
      withPenpot: (work) => work(f.client),
      output: {
        log: () => {},
        error: () => {},
        result: (data) => {
          output.push(data);
        },
      },
    };
    expect(
      await marwesCommand.run(context, [
        "tokens",
        "snapshot",
        "--write",
      ]),
    ).toBe(0);
    expect(
      await marwesCommand.run(context, [
        "tokens",
        "diff",
        "--resolved",
      ]),
    ).toBe(0);
    expect(f.selections).toBe(0);
    expect(
      await marwesCommand.run(context, [
        "tokens",
        "diff",
        "--resolved",
        "--apply",
      ]),
    ).toBe(0);
    expect(output.at(-1)).toMatchObject({
      verified: true,
      restoration: {
        verified: true,
      },
    });
    await expect(
      marwesCommand.run(context, [
        "tokens",
        "diff",
        "--apply",
      ]),
    ).rejects.toThrow(/require diff --resolved/);
  });
  it("publishes coherent per-mode images only after restoration and retains capture identities", async () => {
    const f = fixture();
    const project = await root();
    const report = await runModeTrial(f.client, themeSnapshot(), {
      root: project,
      apply: true,
      sleep: async () => {},
      frame: {
        id: "frame",
        page: "Candidate",
        out: "design/modes",
      },
    });
    expect(report.verified).toBe(true);
    const pointer = JSON.parse(
      await readFile(path.join(project, "design/modes/manifest.json"), "utf8"),
    );
    const directory = path.join(project, "design/modes", pointer.generation);
    expect(await readFile(path.join(directory, "1.png"), "utf8")).toBe("light pixels");
    expect(await readFile(path.join(directory, "2.png"), "utf8")).toBe("dark pixels");
    const manifest = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8"));
    expect(manifest).toMatchObject({
      restoration: {
        verified: true,
      },
      modes: [
        {
          image: {
            capture: {
              fileId: "file",
              frameId: "frame",
            },
          },
        },
        {
          image: {
            capture: {
              activeThemes: [
                "Mode/Dark",
              ],
            },
          },
        },
      ],
    });
  });
});
