import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { computeExpectation } from "../src/commands.js";
import { readMarwesSettings } from "../src/config.js";
import { applyPlan, compareToPenpot, planPush, readLive } from "../src/penpot.js";
import { readSnapshot, writeSnapshot } from "../src/snapshot-file.js";
import { fixture, fakePenpot } from "./helpers.js";

const extras = [{ name: "Acme · Page", tokens: [{ name: "page-card-radius", type: "borderRadius", value: "{mw-ui-radius} * 2", description: "Project card radius" }] }];
async function setup() {
  const f = await fixture();
  const raw = JSON.parse(await readFile(path.join(f.root, "penpair.config.json"), "utf8"));
  raw.marwes.extras = extras;
  await writeFile(path.join(f.root, "penpair.config.json"), JSON.stringify(raw));
  return { f, raw, snapshot: (await computeExpectation(f.root, raw, "acme")).fresh };
}
describe("declared project-owned extras", () => {
  it("records versioned ownership, retains formulas and appends extras to both themes", async () => {
    const { snapshot } = await setup();
    expect(snapshot).toMatchObject({ schemaVersion: 2, ownership: { "Acme · Page": "project", "Marwes · Core": "adapter" } });
    expect(snapshot.sets.at(-1)).toEqual(extras[0]);
    expect(snapshot.themes.every(theme => theme.sets.at(-1) === "Acme · Page")).toBe(true);
    const f = fakePenpot();
    const report = await applyPlan(f.client, snapshot, planPush(snapshot, await readLive(f.client)));
    expect(report.verified).toBe(true);
    expect(compareToPenpot(snapshot, await readLive(f.client)).inSync).toBe(true);
    const project = f.sets.find(set => set.name === "Acme · Page")!;
    project.tokens[0]!.value = "99";
    expect(compareToPenpot(snapshot, await readLive(f.client)).sets.find(set => set.set === project.name)?.tokens[0]).toMatchObject({ name: "page-card-radius", kind: "value" });
    expect((await applyPlan(f.client, snapshot, planPush(snapshot, await readLive(f.client)))).verified).toBe(true);
  });
  it("changes the snapshot expectation when an extra changes and never hides invalid declarations", async () => {
    const { f, raw, snapshot } = await setup();
    raw.marwes.extras = [{ ...extras[0], tokens: [{ ...extras[0]!.tokens[0], value: "{mw-ui-radius} * 3" }] }];
    expect((await computeExpectation(f.root, raw, "acme")).fresh.hash).not.toBe(snapshot.hash);
    for (const bad of [{}, [extras[0], extras[0]], [{ name: "Bad", tokens: [extras[0]!.tokens[0], extras[0]!.tokens[0]] }], [{ name: "Bad", tokens: [{ name: "x", type: "invalid", value: "1" }] }]]) {
      expect(() => readMarwesSettings({ marwes: { extras: bad } }, "acme")).toThrow();
    }
    raw.marwes.extras = [{ ...extras[0], name: "Marwes · Core" }];
    await expect(computeExpectation(f.root, raw, "acme")).rejects.toThrow(/collides/);
  });
  it("reads legacy version 1 for review and writes schema 2 atomically; refuses future or malformed ownership", async () => {
    const { f, snapshot } = await setup();
    const file = "design/marwes-tokens.snapshot.json";
    await writeSnapshot(f.root, file, snapshot);
    expect((await readSnapshot(f.root, file))?.schemaVersion).toBe(2);
    const legacy = { ...snapshot, schemaVersion: 1, ownership: undefined };
    await writeFile(path.join(f.root, file), JSON.stringify(legacy));
    expect((await readSnapshot(f.root, file))?.schemaVersion).toBe(1);
    for (const bad of [{ ...snapshot, schemaVersion: 3 }, { ...snapshot, ownership: {} }]) {
      await writeFile(path.join(f.root, file), JSON.stringify(bad));
      await expect(readSnapshot(f.root, file)).rejects.toThrow(/snapshot|ownership/);
    }
  });
});
