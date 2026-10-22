import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkKits, coreKit, loadKits } from "../src/kit.js";
import { prepareFileScript, runFileScript } from "../src/run-file.js";
import { runKitSmoke } from "../src/kit-smoke.js";
import { runCommand } from "../src/cli-main.js";
import * as deepChecks from "../src/deep-check.js";
import * as probes from "../src/probe.js";
import * as kitSmoke from "../src/kit-smoke.js";
import * as transport from "../src/client.js";
import * as endpoints from "../src/endpoint.js";
import type { PenpotToolClient } from "../src/client.js";
import { kitFixture } from "./helpers/kit-fixture.js";
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const folder = () => mkdtemp(path.join(os.tmpdir(), "penpair-kit-"));
function clientFor(penpot: unknown): PenpotToolClient {
  return {
    async callTool(_name, args) {
      const result = await new AsyncFunction("penpot", String(args.code))(penpot);
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
}
afterEach(() => vi.restoreAllMocks());
describe("explicit kit loading and opt-in scratch probe", () => {
  it("loads only the core for ordinary checking/listing and keeps unrelated extensions unexecuted", async () => {
    const root = await folder();
    await writeFile(
      path.join(root, "penpair.config.json"),
      JSON.stringify({
        instance: "demo",
        profile: {
          type: "external",
          origin: "https://example.test",
        },
        adapters: [
          "./extension.mjs",
        ],
      }),
    );
    await writeFile(path.join(root, "extension.mjs"), "throw new Error('must not import');");
    expect(await loadKits(root)).toEqual([
      coreKit,
    ]);
    vi.spyOn(process, "cwd").mockReturnValue(root);
    expect(
      await runCommand([
        "kit",
        "check",
      ]),
    ).toMatchObject({
      exitCode: 0,
      data: {
        valid: true,
      },
    });
    expect(
      await runCommand([
        "recipes",
      ]),
    ).toMatchObject({
      exitCode: 0,
      data: {
        recipes: [
          {
            name: "hello-card",
          },
        ],
      },
    });
    const connect = vi
      .spyOn(transport, "connect")
      .mockResolvedValue(clientFor(kitFixture().penpot));
    vi.spyOn(endpoints, "resolveEndpoint").mockResolvedValue({
      url: "https://example.test/mcp",
      description: {
        source: "env",
        origin: "https://example.test",
        pathname: "/mcp",
      },
    });
    await writeFile(
      path.join(root, "read.js"),
      "// penpair: read\nreturn {ok:true,recipes:pp.recipes()};",
    );
    expect(
      await runCommand([
        "run-file",
        "read.js",
        "--include",
        "@kit",
      ]),
    ).toMatchObject({
      exitCode: 0,
      data: {
        data: {
          recipes: [
            {
              name: "hello-card",
            },
          ],
        },
      },
    });
    connect.mockClear();
    expect(
      (
        await runCommand([
          "probe",
          "--kit",
        ])
      ).exitCode,
    ).toBe(1);
    expect(connect).not.toHaveBeenCalled();
    vi.spyOn(probes, "probe").mockResolvedValue({} as never);
    vi.spyOn(deepChecks, "runDeepCheck").mockResolvedValue({
      tag: "failed-check",
      steps: [],
      cleanup: [],
      leftovers: [],
      ok: false,
    });
    const kitProbe = vi.spyOn(kitSmoke, "runKitSmoke");
    expect(
      (
        await runCommand([
          "probe",
          "--deep",
          "--write",
          "--kit",
        ])
      ).exitCode,
    ).toBe(1);
    expect(kitProbe).not.toHaveBeenCalled();
  });
  it("loads requested adapter aliases, checks dependency order, and compiles combined sources before execution", async () => {
    const root = await folder();
    await writeFile(
      path.join(root, "penpair.config.json"),
      JSON.stringify({
        instance: "demo",
        profile: {
          type: "external",
          origin: "https://example.test",
        },
        adapters: [
          "./extension.mjs",
        ],
      }),
    );
    await writeFile(
      path.join(root, "extension.mjs"),
      `export default {name:'fixture',commands:[],kits:[{include:'@fixture-kit',requires:['@kit'],recipes:[{name:'fixture',description:'fixture recipe'}],source:'// penpair: read\\npp.defineRecipe("fixture",(parent,props)=>pp.box(parent,props));'}]};`,
    );
    await expect(
      loadKits(root, [
        "@fixture-kit",
        "@kit",
      ]),
    ).rejects.toThrow(/requires earlier/);
    const selected = await loadKits(root, [
      "@kit",
      "@fixture-kit",
    ]);
    await writeFile(
      path.join(root, "read.js"),
      "// penpair: read\nreturn {ok:true,recipes:pp.recipes()};",
    );
    const prepared = await prepareFileScript(root, "read.js", {
      include: selected.map((value) => value.include),
      virtualIncludes: Object.fromEntries(
        selected.map((value) => [
          value.include,
          value.source,
        ]),
      ),
    });
    expect((await runFileScript(clientFor({}), prepared)).data).toMatchObject({
      recipes: [
        {
          name: "hello-card",
        },
        {
          name: "fixture",
        },
      ],
    });
    expect(
      checkKits([
        {
          ...coreKit,
          source: "// penpair: read\nconst pp = (",
        },
      ]).valid,
    ).toBe(false);
    expect(
      checkKits([
        coreKit,
        {
          ...coreKit,
          include: "@other",
        },
      ]).problems.join(" "),
    ).toMatch(/Duplicate recipe|declared/);
  });
  it("builds, reads bindings, exports twice and independently removes only the created scratch root", async () => {
    const f = kitFixture();
    const root = await folder();
    const client = clientFor(f.penpot);
    const existing = f.penpot.createBoard();
    existing.name = "Existing content";
    existing.width = 150;
    const before = f.root.children.map((shape) => shape.id);
    const report = await runKitSmoke(client, root, {
      apply: true,
    });
    expect(report).toMatchObject({
      verified: true,
      journal: {
        state: "verified",
      },
      preview: {
        visualApproval: false,
        bytes: 14,
      },
    });
    expect(f.root.children.map((shape) => shape.id)).toEqual(before);
    expect(JSON.stringify(report)).not.toContain("previewBase64");
    expect(
      await readFile(
        (
          report as {
            preview: {
              path: string;
            };
          }
        ).preview.path,
        "utf8",
      ),
    ).toBe("fixture pixels");
    const resumed = await runKitSmoke(client, root, {
      apply: true,
      journal: {
        root,
        runId: report.journal!.runId,
        resume: true,
      },
    });
    expect(resumed.verified).toBe(true);
    expect(f.root.children.map((shape) => shape.id)).toEqual(before);
  });
  it("keeps lost-acknowledgment smoke uncertain until an explicit clean-state resume", async () => {
    const f = kitFixture();
    const root = await folder();
    const base = clientFor(f.penpot);
    let lost = false;
    let runId = "";
    const client: PenpotToolClient = {
      ...base,
      async callTool(name, args, options) {
        const result = await base.callTool(name, args, options);
        if (!lost && String(args.code).includes("root=penpot.createBoard()")) {
          lost = true;
          throw new Error("lost smoke response");
        }
        return result;
      },
    };
    try {
      await runKitSmoke(client, root, {
        apply: true,
      });
    } catch (error) {
      runId = (
        error as {
          runId: string;
        }
      ).runId;
    }
    expect(runId).toBeTruthy();
    expect(f.root.children).toEqual([]);
    const report = await runKitSmoke(client, root, {
      apply: true,
      journal: {
        root,
        runId,
        resume: true,
      },
    });
    expect(report.verified).toBe(true);
    expect(f.root.children).toEqual([]);
  });
  it("retains redacted probe evidence as incomplete without publishing a preview", async () => {
    const f = kitFixture();
    const root = await folder();
    const report = await runKitSmoke(clientFor(f.penpot), root, {
      apply: true,
      redact: (text) => text.replaceAll("Hello, card", "[REDACTED]"),
    });
    expect(report).toMatchObject({
      complete: false,
      verified: false,
      redacted: true,
    });
    expect(report).not.toHaveProperty("preview");
    expect(JSON.stringify(report)).not.toContain("previewBase64");
    expect(f.root.children).toEqual([]);
  });
  it("runs the documented example through inspect/apply/readback and repeated builds preserve its IDs", async () => {
    const f = kitFixture();
    const root = await folder();
    const client = clientFor(f.penpot);
    await cp(
      fileURLToPath(new URL("../../../examples/hello-card/", import.meta.url)),
      path.join(root, "example"),
      {
        recursive: true,
      },
    );
    const prepared = await prepareFileScript(root, "example/build.js", {
      inspect: "example/inspect.js",
      readback: "example/readback.js",
      include: [
        "@kit",
        "example/helpers.js",
      ],
      virtualIncludes: {
        "@kit": coreKit.source,
      },
      page: "Candidate",
      params: {
        name: "Hello example",
        marker: "owned-example",
        typo: "body",
        color: "ink",
        space: "space",
        radius: "radius",
      },
    });
    expect(await runFileScript(client, prepared)).toMatchObject({
      phase: "inspected",
      verified: false,
    });
    expect(f.root.children).toEqual([]);
    expect(
      await runFileScript(client, prepared, {
        apply: true,
        journal: {
          root,
        },
      }),
    ).toMatchObject({
      verified: true,
    });
    const ids = f.shapes.map((shape) => shape.id);
    expect(
      await runFileScript(client, prepared, {
        apply: true,
        journal: {
          root,
        },
      }),
    ).toMatchObject({
      verified: true,
    });
    expect(f.shapes.map((shape) => shape.id)).toEqual(ids);
    f.root.children[0]!.name = "Renamed by a designer";
    await expect(runFileScript(client, prepared)).rejects.toThrow(/marker moved/);
    expect(f.root.children).toHaveLength(1);
  });
  it("removes its own root after a failed export and refuses an unsupported token context before creating one", async () => {
    const f = kitFixture();
    const root = await folder();
    f.Shape.prototype.export = async () => {
      throw new Error("export failed");
    };
    await expect(
      runKitSmoke(clientFor(f.penpot), root, {
        apply: true,
      }),
    ).rejects.toThrow(/verification failed/);
    expect(f.root.children).toEqual([]);
    const empty = kitFixture();
    empty.sets[0]!.tokens = [];
    await expect(
      runKitSmoke(clientFor(empty.penpot), await folder(), {
        apply: true,
      }),
    ).rejects.toThrow(/active color token/);
    expect(empty.root.children).toEqual([]);
  });
});
