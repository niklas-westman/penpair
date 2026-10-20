import { mkdtemp, readFile, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { PenpotToolClient } from "../src/client.js";
import { exportBaselines, pngSize, reflectionCases, validateBaselines } from "../src/baselines.js";
import { ConfigError, validateProjectConfig } from "../src/instance/config.js";

const reply = (result: unknown) => ({ text: JSON.stringify({ result, log: "" }), isError: false });
const fail = (message: string): never => {
  throw new ConfigError(message);
};
const config = { page: "Candidate", root: "tests/baselines", frames: [
  { frame: "F / candidates", id: "candidates-desktop", route: "candidates" },
  { frame: "F tablet / candidates", id: "candidates-tablet", route: "candidates" },
  { frame: "F / my work", id: "my-work" },
] };

/** A PNG header with the given size (the rest is padding), enough for the size reader and for byte comparison. */
const png = (width: number, height: number, tag = ""): Buffer => {
  const head = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(head);
  head.write("IHDR", 12, "ascii");
  head.writeUInt32BE(width, 16);
  head.writeUInt32BE(height, 20);
  return Buffer.concat([head, Buffer.from(tag)]);
};

interface Fake { frames: { id: string; name: string; width: number; height: number }[]; images: Record<string, Buffer[]> }
function penpot(fake: Fake): PenpotToolClient {
  const exportsDone: Record<string, number> = {};
  return {
    async callTool(_name, args) {
      const code = String((args as { code: string }).code);
      const id = /"id":"([^"]+)"/.exec(code)?.[1];
      if (id && code.includes("export({")) {
        const sequence = fake.images[id]!;
        const n = (exportsDone[id] = (exportsDone[id] ?? 0) + 1);
        const image = sequence[Math.min(n - 1, sequence.length - 1)]!;
        return reply({ ok: true, base64: image.toString("base64"), length: image.length });
      }
      return reply({ ok: true, file: "Brand", revn: 7, page: "Candidate", frames: fake.frames });
    },
    async close() {},
  };
}
const fast = { sleep: async () => undefined, settleMs: 0 };
const frames = [
  { id: "a1", name: "F / candidates", width: 1512, height: 982 },
  { id: "b2", name: "F tablet / candidates", width: 834, height: 1194 },
  { id: "c3", name: "F / my work", width: 1512, height: 982 },
];
const settled = (w: number, h: number, tag: string): Buffer[] => [png(w, h, tag), png(w, h, tag)];
const images = { a1: settled(1512, 982, "a"), b2: settled(834, 1194, "b"), c3: settled(1512, 982, "c") };
const project = (): Promise<string> => mkdtemp(path.join(os.tmpdir(), "penpair-baselines-"));

describe("the baselines configuration", () => {
  it("is validated inside penpair.config.json", () => {
    const external = { instance: "x", profile: { type: "external", origin: "https://design.penpot.app" } };
    expect(() => validateProjectConfig({ ...external, baselines: config })).not.toThrow();
    expect(() => validateProjectConfig({ ...external, baselines: { ...config, root: "../out" } })).toThrow(/inside the project/);
    expect(() => validateProjectConfig({ ...external, baselines: { ...config, frames: [] } })).toThrow(/at least one/);
    expect(() => validateProjectConfig({ ...external, baselines: { ...config, frames: [{ frame: "a", id: "x" }, { frame: "b", id: "x" }] } })).toThrow(/used twice/);
    expect(() => validateProjectConfig({ ...external, baselines: { ...config, frames: [{ frame: "a", id: "../evil" }] } })).toThrow(/lowercase/);
    expect(() => validateBaselines({ ...config, threshold: 2 }, fail)).toThrow(/0 to 1/);
  });
});

describe("exporting baselines", () => {
  it("only looks without --apply, and says what it found", async () => {
    const root = await project();
    const report = await exportBaselines(penpot({ frames, images }), root, config, fast);
    expect(report.results.map((r) => [r.id, r.status, r.written])).toEqual([["candidates-desktop", "new", false], ["candidates-tablet", "new", false], ["my-work", "new", false]]);
    expect(report.wrote).toEqual([]);
    expect(await readdir(root)).toEqual([]);
  });

  it("writes new images, a manifest and Reflection cases that match the image sizes", async () => {
    const root = await project();
    const report = await exportBaselines(penpot({ frames, images }), root, config, { ...fast, apply: true });
    expect(report.wrote).toEqual(expect.arrayContaining(["tests/baselines/candidates-desktop.png", "tests/baselines/penpair-baselines.json", "tests/baselines/reflection-cases.json"]));
    expect(pngSize(await readFile(path.join(root, "tests/baselines/candidates-tablet.png")))).toEqual({ width: 834, height: 1194 });
    const manifest = JSON.parse(await readFile(path.join(root, "tests/baselines/penpair-baselines.json"), "utf8"));
    expect(manifest).toMatchObject({ penpotFile: "Brand", page: "Candidate", revn: 7 });
    expect(manifest.frames).toHaveLength(3);
    const cases = JSON.parse(await readFile(path.join(root, "tests/baselines/reflection-cases.json"), "utf8"));
    expect(cases.routes.candidates.viewports).toEqual([{ name: "design-1512x982", width: 1512, height: 982 }, { name: "design-834x1194", width: 834, height: 1194 }]);
    expect(cases.visualSmoke).toHaveLength(2);
    expect(cases.visualSmoke[0]).toMatchObject({ id: "candidates-desktop", route: "candidates", viewport: "design-1512x982", baselineRoot: "tests/baselines", baseline: "candidates-desktop.png", strict: false, ref: "penpair:candidates-desktop", threshold: { maxDiffPixelRatio: 0.05 } });
  });

  it("does not turn a changed design into the new reference unless asked", async () => {
    const root = await project();
    await exportBaselines(penpot({ frames, images }), root, config, { ...fast, apply: true });
    const changed = { ...images, a1: settled(1512, 982, "a-edited") };
    const again = await exportBaselines(penpot({ frames, images: changed }), root, config, { ...fast, apply: true });
    expect(again.results.find((r) => r.id === "candidates-desktop")).toMatchObject({ status: "changed", written: false });
    expect(again.results.find((r) => r.id === "candidates-tablet")).toMatchObject({ status: "same" });
    expect((await readFile(path.join(root, "tests/baselines/candidates-desktop.png"))).toString("latin1")).toContain("a");
    expect((await readFile(path.join(root, "tests/baselines/candidates-desktop.png"))).toString("latin1")).not.toContain("edited");
    const approved = await exportBaselines(penpot({ frames, images: changed }), root, config, { ...fast, apply: true, update: true });
    expect(approved.results.find((r) => r.id === "candidates-desktop")).toMatchObject({ status: "changed", written: true });
    expect((await readFile(path.join(root, "tests/baselines/candidates-desktop.png"))).toString("latin1")).toContain("edited");
  });

  it("describes the image on disk, not the new design, when a changed design was not approved", async () => {
    const root = await project();
    await exportBaselines(penpot({ frames, images }), root, config, { ...fast, apply: true });
    const resized = { ...images, a1: settled(1600, 1000, "a-big") };
    await exportBaselines(penpot({ frames: frames.map((f) => (f.id === "a1" ? { ...f, width: 1600, height: 1000 } : f)), images: resized }), root, config, { ...fast, apply: true });
    const cases = JSON.parse(await readFile(path.join(root, "tests/baselines/reflection-cases.json"), "utf8"));
    expect(cases.visualSmoke[0].viewport).toBe("design-1512x982");
  });

  it("reports a frame that is missing and an export that never settles, and writes neither", async () => {
    const root = await project();
    const unstable = { ...images, c3: [png(1, 1, "1"), png(1, 1, "2"), png(1, 1, "3"), png(1, 1, "4"), png(1, 1, "5")] };
    const report = await exportBaselines(penpot({ frames: frames.filter((f) => f.id !== "b2"), images: unstable }), root, config, { ...fast, apply: true });
    expect(report.results.map((r) => [r.id, r.status])).toEqual([["candidates-desktop", "new"], ["candidates-tablet", "missing"], ["my-work", "unstable"]]);
    expect(await readdir(path.join(root, "tests/baselines"))).not.toContain("my-work.png");
  });

  it("refuses an ambiguous frame name", async () => {
    const root = await project();
    const twice = [...frames, { id: "z9", name: "F / candidates", width: 10, height: 10 }];
    await expect(exportBaselines(penpot({ frames: twice, images }), root, config, fast)).rejects.toThrow(/more than one/);
  });
});

describe("Reflection cases", () => {
  it("leave out frames without a route and take the threshold from the config", () => {
    const cases = reflectionCases({ ...config, threshold: 0.02 }, [
      { id: "my-work", frame: "F / my work", file: "my-work.png", status: "same", written: false, imageWidth: 100, imageHeight: 100 },
      { id: "candidates-desktop", frame: "F / candidates", file: "candidates-desktop.png", status: "same", written: false, imageWidth: 100, imageHeight: 80 },
    ]);
    expect(cases.visualSmoke).toHaveLength(1);
    expect(cases.visualSmoke[0]).toMatchObject({ threshold: { maxDiffPixelRatio: 0.02 }, viewport: "design-100x80" });
  });
});

describe("the PNG size reader", () => {
  it("reads the header and ignores anything else", () => {
    expect(pngSize(png(5, 7))).toEqual({ width: 5, height: 7 });
    expect(pngSize(Buffer.from("not a png at all, just text........"))).toBeUndefined();
  });
});

