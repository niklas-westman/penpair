import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig, readRawConfig, type AdapterContext } from "@penpair/core";
import {
  componentProperties,
  componentSourceHash,
  componentTokenCandidates,
  componentsCommand,
  diffComponentSnapshots,
  measureComponentPilot,
  readComponentPilot,
  validateComponentSnapshot,
  type ComponentPilot,
} from "../src/components.js";
import { computeExpectation } from "../src/commands.js";
import { fixture } from "./helpers.js";
const pilot: ComponentPilot = {
  schemaVersion: 1,
  renderer: "renderer.mjs",
  sources: [
    "fixture.tsx",
  ],
  snapshot: "design/components.json",
  cases: (
    [
      "Button",
      "Card",
      "StatTile",
    ] as const
  ).flatMap((component) =>
    (
      [
        "light",
        "dark",
      ] as const
    ).map((theme) => ({
      id: `${component}-${theme}`,
      component,
      theme,
      viewport: {
        width: 1000,
        height: 800,
      },
      state: "default",
      selector: `[data-pilot="${component}"]`,
    })),
  ),
};
const observed = (cases: ComponentPilot["cases"]) =>
  cases.map((c) => ({
    id: c.id,
    parts: {
      root: Object.fromEntries(
        componentProperties.map((p) => [
          p,
          p === "borderRadius" ? "8px" : "0px",
        ]),
      ),
    },
    environment: {
      browser: "offline-stub",
      fontsReady: true,
    },
  }));
async function session() {
  const f = await fixture();
  await writeFile(path.join(f.root, "fixture.tsx"), "// project fixture");
  await writeFile(
    path.join(f.root, "renderer.mjs"),
    `export async function measure(cases) { return cases.map(c => ({ id: c.id, parts: { root: Object.fromEntries(${JSON.stringify(componentProperties)}.map(p => [p, '8px'])) }, environment: { browser: 'stub', fontsReady: true } })); }`,
  );
  const raw = await readRawConfig(f.root);
  (raw.marwes as Record<string, unknown>).components = pilot;
  const tokens = (await computeExpectation(f.root, raw, "acme")).fresh;
  const context: AdapterContext = {
    root: f.root,
    rawConfig: raw,
    config: await loadConfig(f.root),
    log() {},
    output: {
      log() {},
      error() {},
      result() {},
    },
    withPenpot() {
      throw new Error("No Penpot writes permitted by pilot");
    },
  };
  return {
    f,
    raw,
    tokens,
    context,
  };
}
describe("three-component measurement pilot", () => {
  it("requires explicit distinct contexts and coverage before invoking trusted code", () => {
    expect(() =>
      readComponentPilot({
        marwes: {
          components: {
            ...pilot,
            cases: pilot.cases.slice(1),
          },
        },
      }),
    ).toThrow(/requires Button/);
    expect(() =>
      readComponentPilot({
        marwes: {
          components: {
            ...pilot,
            cases: [
              ...pilot.cases,
              pilot.cases[0],
            ],
          },
        },
      }),
    ).toThrow(/Duplicate/);
  });
  it("records anatomy drift, unknowns and ambiguity without claiming token semantics or native parity", async () => {
    const { tokens } = await session();
    const matches = componentTokenCandidates(
      {
        borderRadius: "8px",
      },
      tokens,
      "dark",
    );
    expect(matches.borderRadius!.length).toBeGreaterThan(0);
    const one = await measureComponentPilot(pilot, tokens, "a".repeat(64), async (c) =>
      observed(c),
    );
    expect(validateComponentSnapshot(one)).toEqual(one);
    const two = await measureComponentPilot(pilot, tokens, "a".repeat(64), async (c) => {
      const data = observed(c);
      data[0]!.parts.root!.height = "41px";
      return data;
    });
    expect(diffComponentSnapshots(one, two)).toMatchObject({
      identical: false,
      sourceChanged: false,
      changes: [
        {
          id: "Button-light",
        },
      ],
      instanceOverrides: "not-tested",
    });
    expect(() =>
      validateComponentSnapshot({
        ...one,
        sourceHash: "b".repeat(64),
      }),
    ).toThrow(/hash mismatch/);
    await expect(
      measureComponentPilot(pilot, tokens, "a".repeat(64), async () => []),
    ).rejects.toThrow(/exactly one/);
  });
  it("invalidates source-only CI checks on fixture edits and preserves prior snapshot on incomplete evidence", async () => {
    const { f, context, tokens } = await session();
    expect(
      await componentsCommand(context, [
        "snapshot",
        "--write",
      ]),
    ).toBe(0);
    expect(
      await componentsCommand(context, [
        "check",
      ]),
    ).toBe(0);
    const before = await readFile(path.join(f.root, pilot.snapshot), "utf8");
    const hash = await componentSourceHash(f.root, pilot, tokens);
    await writeFile(path.join(f.root, "fixture.tsx"), "// changed anatomy without changing tokens");
    expect(await componentSourceHash(f.root, pilot, tokens)).not.toBe(hash);
    expect(
      await componentsCommand(context, [
        "check",
      ]),
    ).toBe(2);
    await writeFile(
      path.join(f.root, "renderer.mjs"),
      "export async function measure() { return []; }",
    );
    await expect(
      componentsCommand(context, [
        "snapshot",
        "--write",
      ]),
    ).rejects.toThrow();
    expect(await readFile(path.join(f.root, pilot.snapshot), "utf8")).toBe(before);
    await expect(
      componentsCommand(context, [
        "build",
      ]),
    ).rejects.toThrow(/preserved text\/style/);
  });
});
