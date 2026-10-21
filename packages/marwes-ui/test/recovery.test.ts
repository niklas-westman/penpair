import path from "node:path";
import { describe, expect, it } from "vitest";
import { PenpairError, readJournal } from "@penpair/core";
import { applyPlan, planPush, readLive } from "../src/penpot.js";
import { buildSnapshot } from "../src/tokens.js";
import { loadInstalledMarwes } from "../src/marwes.js";
import { fakePenpot, fixture, acmeThemes } from "./helpers.js";

async function setup() {
  const f = await fixture();
  const installed = await loadInstalledMarwes(path.join(f.root, "packages/app"));
  const snapshot = buildSnapshot({ core: installed.core, version: installed.version, name: "Acme", project: acmeThemes, generatedBy: "test" });
  const penpot = fakePenpot();
  const plan = planPush(snapshot, await readLive(penpot.client));
  return { f, snapshot, penpot, plan, options: { journal: { root: f.root, runId: "recover-test" } } };
}

describe("token push recovery through actual plugin snippets", () => {
  it("refuses a stale CLI plan and a source edit immediately before mutation", async () => {
    const { snapshot, penpot, plan, options } = await setup();
    const stale = { sets: [], themes: [{ group: "changed", name: "changed", active: false, sets: [] }] };
    await expect(applyPlan(penpot.client, snapshot, plan, undefined, { ...options, expectedLive: stale })).rejects.toThrow(/source changed/);
    const original = penpot.client.callTool.bind(penpot.client);
    let changed = false;
    penpot.client.callTool = async (name, args) => {
      if (!changed && String(args.code).includes("set.addToken")) {
        changed = true; penpot.sets[0]!.name = "Designer renamed this";
      }
      return original(name, args);
    };
    await expect(applyPlan(penpot.client, snapshot, plan, undefined, options)).rejects.toThrow(/source changed before mutation/);
    expect(penpot.sets[0]!.tokens).toHaveLength(0);
  });
  it("recovers acknowledgment loss at every actual fresh-push batch boundary", async () => {
    const reference = await setup();
    await applyPlan(reference.penpot.client, reference.snapshot, reference.plan, undefined, reference.options);
    const count = (await readJournal(reference.f.root, "recover-test")).steps.length;
    expect(count).toBeGreaterThan(5);
    for (let boundary = 0; boundary < count; boundary++) {
      const { snapshot, penpot, plan, options } = await setup();
      const original = penpot.client.callTool.bind(penpot.client);
      let index = -1, lost = false;
      penpot.client.callTool = async (name, args) => {
        const result = await original(name, args);
        const code = String(args.code);
        if (/\.addSet\(|\.addToken\(|\.addTheme\(|\.toggleActive\(/.test(code) && ++index === boundary) {
          lost = true; throw new PenpairError("mcp-unavailable", "response lost after batch");
        }
        return result;
      };
      await expect(applyPlan(penpot.client, snapshot, plan, undefined, options)).rejects.toMatchObject({ outcome: "uncertain" });
      expect(lost).toBe(true);
      expect((await applyPlan(penpot.client, snapshot, [], undefined, { journal: { ...options.journal, resume: true } })).verified).toBe(true);
      for (const set of penpot.sets) expect(new Set(set.tokens.map((token) => token.name)).size).toBe(set.tokens.length);
    }
  });
  it("reconciles a fully executed batch after its acknowledgment was lost", async () => {
    const { f, snapshot, penpot, plan, options } = await setup();
    const original = penpot.client.callTool.bind(penpot.client);
    let lost = false;
    penpot.client.callTool = async (name, args) => {
      const result = await original(name, args);
      if (!lost && String(args.code).includes("set.addToken")) { lost = true; throw new PenpairError("mcp-unavailable", "response lost"); }
      return result;
    };
    await expect(applyPlan(penpot.client, snapshot, plan, undefined, options)).rejects.toMatchObject({ outcome: "uncertain" });
    const report = await applyPlan(penpot.client, snapshot, [], undefined, { journal: { ...options.journal, resume: true } });
    expect(report).toMatchObject({ verified: true, journal: { state: "verified" } });
    expect((await readJournal(f.root, "recover-test")).steps.every((step) => step.state === "completed")).toBe(true);
    for (const set of penpot.sets) expect(new Set(set.tokens.map((token) => token.name)).size).toBe(set.tokens.length);
  });

  it("rebuilds only residual tokens after a partially rejected batch", async () => {
    const { snapshot, penpot, plan, options } = await setup();
    const rejected = snapshot.sets[0]!.tokens[2]!.name;
    penpot.rejectToken(rejected);
    await expect(applyPlan(penpot.client, snapshot, plan, undefined, options)).rejects.toMatchObject({ outcome: "failed" });
    const savedNames = penpot.sets[0]!.tokens.map((token) => token.name);
    expect(savedNames.length).toBeGreaterThan(0);
    penpot.allowToken(rejected);
    expect((await applyPlan(penpot.client, snapshot, [], undefined, { journal: { ...options.journal, resume: true } })).verified).toBe(true);
    expect(penpot.sets[0]!.tokens.filter((token) => token.name === rejected)).toHaveLength(1);
    for (const name of savedNames) expect(penpot.sets[0]!.tokens.filter((token) => token.name === name)).toHaveLength(1);
  });

  it("stops on a designer's third value and refuses a changed desired snapshot", async () => {
    const { snapshot, penpot, plan, options } = await setup();
    const rejected = snapshot.sets[0]!.tokens[2]!.name;
    penpot.rejectToken(rejected);
    await expect(applyPlan(penpot.client, snapshot, plan, undefined, options)).rejects.toMatchObject({ outcome: "failed" });
    penpot.allowToken(rejected);
    const changed = structuredClone(snapshot);
    changed.sets[0]!.tokens[0]!.value = "#ABCDEF";
    await expect(applyPlan(penpot.client, changed, [], undefined, { journal: { ...options.journal, resume: true } })).rejects.toThrow(/inputs/);
    const original = penpot.sets[0]!.tokens[0]!;
    original.value = "unexplained value";
    await expect(applyPlan(penpot.client, snapshot, [], undefined, { journal: { ...options.journal, resume: true } })).rejects.toMatchObject({ outcome: "conflict" });
    expect(original.value).toBe("unexplained value");
  });
});
