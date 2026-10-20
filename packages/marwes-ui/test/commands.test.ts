import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig, readRawConfig, type AdapterContext } from "@penpair/core";
import adapter, { checkTokenSnapshot, marwesCommand } from "../src/index.js";
import { fakePenpot, fixture, tradientThemes, type FakePenpot, type Fixture } from "./helpers.js";

afterEach(() => vi.restoreAllMocks());

async function session() {
  const f = await fixture();
  const penpot = fakePenpot([{ id: "s1", type: "board", name: "Dashboard", x: 0, y: 0, width: 1440, height: 900, tokens: { fill: "mw-color-primary-base" } }]);
  return { f, penpot, run: runner(f, penpot) };
}

function runner(f: Fixture, penpot: FakePenpot) {
  return async (...args: string[]): Promise<{ code: number; out: string; err: string }> => {
    const out: string[] = [];
    const err: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...m) => void out.push(m.join(" ")));
    vi.spyOn(console, "error").mockImplementation((...m) => void err.push(m.join(" ")));
    const context: AdapterContext = {
      root: f.root,
      config: await loadConfig(f.root),
      rawConfig: await readRawConfig(f.root),
      log: () => undefined,
      withPenpot: (work) => work(penpot.client),
    };
    const code = await marwesCommand.run(context, ["tokens", ...args]);
    vi.restoreAllMocks();
    return { code, out: out.join("\n"), err: err.join("\n") };
  };
}

describe("the adapter", () => {
  it("is what penpair loads: a default export with the marwes command", () => {
    expect(adapter.name).toBe("@penpair/marwes-ui");
    expect(adapter.commands.map((c) => c.name)).toEqual(["marwes"]);
  });

  it("refuses what it does not know", async () => {
    const { run } = await session();
    expect((await run("nonsense")).code).toBe(1);
  });
});

describe("the snapshot", () => {
  it("is missing at first, written on request, and current afterwards", async () => {
    const { f, run } = await session();
    const first = await run("snapshot");
    expect(first.code).toBe(2);
    expect(first.out).toMatch(/There is no snapshot yet/);
    expect((await run("snapshot", "--write")).code).toBe(0);
    const saved = JSON.parse(await readFile(path.join(f.root, "design/marwes-tokens.snapshot.json"), "utf8"));
    expect(saved).toMatchObject({ marwesVersion: "1.11.0", project: "Tradient", generatedBy: expect.stringMatching(/^@penpair\/marwes-ui@/) });
    expect(saved.sets.map((s: { name: string }) => s.name)).toEqual(["Marwes · Core", "Marwes · Dark", "Tradient · Light", "Tradient · Dark"]);
    expect((await run("snapshot")).out).toMatch(/is current/);
  });
});

describe("the check, which CI runs without Penpot", () => {
  it("passes when the snapshot is current, and fails when Marwes moved, the theme changed, or a Marwes package is left behind", async () => {
    const { f, run } = await session();
    await run("snapshot", "--write");
    expect((await run("check")).code).toBe(0);
    expect(await checkTokenSnapshot(f.root).then((c) => c.current)).toBe(true);

    await f.installMarwes("1.12.0");
    const bumped = await run("check");
    expect(bumped.code).toBe(2);
    expect(bumped.out).toMatch(/Marwes 1\.11\.0 -> 1\.12\.0/);
    expect(bumped.out).toMatch(/committed snapshot is stale: it was made from Marwes 1\.11\.0 and the installed Marwes is 1\.12\.0/);
    expect(await checkTokenSnapshot(f.root).then((c) => c.current)).toBe(false);

    await run("snapshot", "--write");
    expect((await run("check")).code).toBe(0);

    await f.installMarwes("1.12.0", { react: "1.11.0" });
    const mixed = await run("check");
    expect(mixed.code).toBe(1);
    expect(mixed.out).toMatch(/different versions/);
  });

  it("notices a theme edit that was not followed by a new snapshot", async () => {
    const { f, run } = await session();
    await run("snapshot", "--write");
    await f.writeTheme({ ...tradientThemes.light, color: { primary: "#007744" } });
    const result = await run("check");
    expect(result.code).toBe(2);
    expect(result.out).toMatch(/mw-color-primary-base #006633 -> #007744/);
    expect(result.out).toMatch(/the installed Marwes or the project's theme has changed since it was made/);
  });

  it("can be asked for JSON", async () => {
    const { run } = await session();
    await run("snapshot", "--write");
    expect(JSON.parse((await run("check", "--json")).out)).toMatchObject({ current: true, installed: { core: "1.11.0" } });
  });
});

describe("the drift story, from a first push to a Marwes bump", () => {
  it("diff and push: an empty Penpot, a push, a hand edit, a theme edit, a bump", async () => {
    const { f, penpot, run } = await session();
    await run("snapshot", "--write");

    const empty = await run("diff");
    expect(empty.code).toBe(2);
    expect(empty.out).toMatch(/Marwes · Core: missing in Penpot/);

    const look = await run("push");
    expect(look.code).toBe(0);
    expect(look.out).toMatch(/Plan:[\s\S]*create set Marwes · Core[\s\S]*create theme Mode\/Light[\s\S]*Nothing was written/);
    expect(penpot.sets).toHaveLength(0);

    const pushed = await run("push", "--apply");
    expect(pushed.code).toBe(0);
    expect(pushed.out).toMatch(/verified: Penpot now matches the snapshot and no shape moved/);
    expect((await run("diff")).out).toMatch(/Penpot matches/);
    expect((await run("push")).out).toMatch(/nothing to write/);

    // Someone edits a token in Penpot by hand: Marwes is authoritative, and the diff says what it reaches.
    penpot.sets[0]!.tokens.find((t) => t.name === "mw-color-primary-base")!.value = "#FF0000";
    const drifted = await run("diff");
    expect(drifted.code).toBe(2);
    expect(drifted.out).toMatch(/mw-color-primary-base is #FF0000, expected #2F31FC \(used by 1 shape\)/);
    expect((await run("push", "--apply")).code).toBe(0);
    expect(penpot.sets[0]!.tokens.find((t) => t.name === "mw-color-primary-base")!.value).toBe("#2F31FC");

    // The theme changes: Penpot is behind, and push refuses until the snapshot has been regenerated and committed.
    await f.writeTheme({ ...tradientThemes.light, color: { primary: "#007744" } });
    const stale = await run("push", "--apply");
    expect(stale.code).toBe(2);
    expect(stale.err).toMatch(/STOP the committed snapshot is stale/);
    await run("snapshot", "--write");
    const update = await run("push", "--apply");
    expect(update.code).toBe(0);
    expect(update.out).toMatch(/update 1 token\(s\) in Tradient · Light/);
    expect(penpot.sets.find((s) => s.name === "Tradient · Light")!.tokens.find((t) => t.name === "mw-color-primary-base")!.value).toBe("#007744");

    // Marwes itself is bumped: the version recorded in every description follows.
    await f.installMarwes("1.12.0");
    await run("snapshot", "--write");
    const bumped = await run("diff");
    expect(bumped.out).toMatch(/carry an old description/);
    expect((await run("push", "--apply")).code).toBe(0);
    expect(penpot.sets[0]!.tokens[0]!.description).toMatch(/\(Marwes 1\.12\.0\)$/);
    expect((await run("diff")).code).toBe(0);
  });

  it("keeps a token added by hand, and removes it only with --prune", async () => {
    const { penpot, run } = await session();
    await run("snapshot", "--write");
    await run("push", "--apply");
    penpot.sets[0]!.addToken({ type: "color", name: "my-own", value: "#123456" });
    expect((await run("diff")).out).toMatch(/not in the expectation \(added by hand\?\): my-own/);
    expect((await run("push")).out).toMatch(/nothing to write|kept unless you add --prune/);
    expect(penpot.sets[0]!.tokens.some((t) => t.name === "my-own")).toBe(true);
    expect((await run("push", "--apply", "--prune")).code).toBe(0);
    expect(penpot.sets[0]!.tokens.some((t) => t.name === "my-own")).toBe(false);
  });

  it("does not push without a snapshot, and says so", async () => {
    const { run } = await session();
    const result = await run("push", "--apply");
    expect(result.code).toBe(1);
    expect(result.err).toMatch(/no snapshot yet/);
  });
});

describe("the status", () => {
  it("is one screen: the installed Marwes, the snapshot and Penpot", async () => {
    const { run } = await session();
    await run("snapshot", "--write");
    const before = await run("status");
    expect(before.code).toBe(2);
    expect(before.out).toMatch(/Marwes installed: react 1\.11\.0, core 1\.11\.0[\s\S]*ok\s+the snapshot is current[\s\S]*FAIL Penpot differs/);
    await run("push", "--apply");
    const after = await run("status");
    expect(after.code).toBe(0);
    expect(after.out).toMatch(/ok\s+Penpot matches the snapshot/);
  });
});
