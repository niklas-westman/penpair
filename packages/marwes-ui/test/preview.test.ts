import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, it } from "vitest";
import { loadConfig, readRawConfig, type AdapterContext } from "@penpair/core";
import { computeExpectation, marwesCommand } from "../src/commands.js";
import { writeSnapshot } from "../src/snapshot-file.js";
import { fixture } from "./helpers.js";
it("runs an offline preview from the retained snapshot without changing it or opening Penpot", async () => {
  const f = await fixture();
  const rawConfig = await readRawConfig(f.root);
  const expected = await computeExpectation(f.root, rawConfig, "acme");
  await writeSnapshot(f.root, expected.settings.snapshot, expected.fresh);
  const before = await readFile(path.join(f.root, expected.settings.snapshot), "utf8");
  let result: unknown;
  const context: AdapterContext = {
    root: f.root,
    config: await loadConfig(f.root),
    rawConfig,
    log() {},
    withPenpot() {
      throw new Error("Must remain offline");
    },
    output: {
      log() {},
      error() {},
      result(value) {
        result = value;
      },
    },
  };
  const args = [
    "tokens",
    "preview",
    "--from",
    expected.settings.snapshot,
    "--theme",
    expected.fresh.themes[0]!.name,
  ];
  expect(await marwesCommand.run(context, args)).toBe(0);
  expect(result).toMatchObject({
    schemaVersion: 1,
    kind: "projected-theme-preview",
    nativeBindings: false,
    sourceSnapshotHash: expected.fresh.hash,
  });
  expect(
    await marwesCommand.run(context, [
      ...args,
      "--out",
      "design/light-preview.json",
    ]),
  ).toBe(0);
  expect(
    JSON.parse(await readFile(path.join(f.root, "design/light-preview.json"), "utf8")),
  ).toEqual(result);
  expect(await readFile(path.join(f.root, expected.settings.snapshot), "utf8")).toBe(before);
  for (const flags of [
    [
      "--apply",
    ],
    [
      "--out",
      "../escape.json",
    ],
    [
      "--out",
      expected.settings.snapshot,
    ],
    [
      "--out",
      "design/light-preview.json",
    ],
  ]) {
    await expect(
      marwesCommand.run(context, [
        ...args,
        ...flags,
      ]),
    ).rejects.toThrow();
  }
  await expect(
    marwesCommand.run(context, [
      "tokens",
      "preview",
      "--from",
      expected.settings.snapshot,
    ]),
  ).rejects.toThrow(/--theme/);
});
