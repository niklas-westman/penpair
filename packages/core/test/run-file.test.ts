import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareFileScript, runFileScript } from "../src/run-file.js";
import type { PenpotToolClient } from "../src/client.js";
import * as transport from "../src/client.js";
import * as endpoint from "../src/endpoint.js";
import { runCommand } from "../src/cli-main.js";
import { readJournal } from "../src/journal.js";

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "penpair-run-file-"));
  const page = {
    id: "page",
    name: "P",
    root: {
      id: "root",
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      children: [] as unknown[],
    },
  };
  const penpot = {
    value: 0,
    writes: 0,
    currentFile: {
      id: "file",
      revn: 1,
      pages: [
        page,
      ],
    },
    currentPage: page,
    waitForLayoutUpdate: async () => {},
  };
  let lose = false;
  const client: PenpotToolClient = {
    async callTool(_name, args) {
      const code = String(args.code);
      const result = await new AsyncFunction("penpot", code)(penpot);
      if (lose && code.includes("penpot.writes++")) {
        lose = false;
        throw new Error("response lost");
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
  const write = async (name: string, body: string) => {
    const target = path.join(root, name);
    await mkdir(path.dirname(target), {
      recursive: true,
    });
    await writeFile(target, body);
  };
  await write(
    "penpair.config.json",
    JSON.stringify({
      instance: "demo",
      profile: {
        type: "external",
        origin: "https://example.test",
      },
      file: {
        id: "file",
      },
    }),
  );
  return {
    root,
    client,
    penpot,
    write,
    loseNext() {
      lose = true;
    },
  };
}
const reviewed = async (f: Awaited<ReturnType<typeof fixture>>) => {
  await f.write(
    "write.js",
    "// penpair: write\n// penpair: idempotent\nif(penpot.value!==Number(CFG.value)){penpot.value=Number(CFG.value);penpot.writes++;}return {ok:true};",
  );
  await f.write(
    "inspect.js",
    "// penpair: read\nreturn {ok:true,value:penpot.value,desired:Number(CFG.value)};",
  );
  await f.write(
    "readback.js",
    "// penpair: read\nreturn {ok:true,verification:{expected:{value:Number(CFG.value)},actual:{value:penpot.value}}};",
  );
  return {
    inspect: "inspect.js",
    readback: "readback.js",
    params: {
      value: "7",
    },
    page: "P",
  };
};
afterEach(() => vi.restoreAllMocks());
describe("explicit trusted script files", () => {
  it("compiles and includes helpers in caller order without importing host code", async () => {
    const f = await fixture();
    await f.write("a.js", "// penpair: read\nconst parts=['a'];");
    await f.write("b.js", "// penpair: read\nparts.push('b');");
    await f.write("read.js", "// penpair: read\nreturn {ok:true,parts:[...parts,CFG.label]};");
    const prepared = await prepareFileScript(f.root, "read.js", {
      include: [
        "a.js",
        "b.js",
      ],
      params: {
        label: "c",
      },
      page: "P",
    });
    expect((await runFileScript(f.client, prepared)).data).toMatchObject({
      parts: [
        "a",
        "b",
        "c",
      ],
    });
    expect(prepared.source.map((source) => source.file)).toEqual([
      "a.js",
      "b.js",
      "read.js",
    ]);
  });
  it("refuses undeclared writes and untrusted include phases before executing anything", async () => {
    const f = await fixture();
    await f.write("unknown.js", "penpot.value=10;return {ok:true};");
    await expect(prepareFileScript(f.root, "unknown.js")).rejects.toThrow(/write.*idempotent/i);
    await f.write("read.js", "// penpair: read\nreturn {ok:true};");
    await expect(
      prepareFileScript(f.root, "read.js", {
        include: [
          "unknown.js",
        ],
      }),
    ).rejects.toThrow(/Include/);
    const params = await reviewed(f);
    await f.write("write.js", "// penpair: write\npenpot.value=10;return {ok:true};");
    await expect(prepareFileScript(f.root, "write.js", params)).rejects.toThrow(/idempotent/);
    expect(f.penpot.value).toBe(0);
  });
  it("inspects reviewed writes by default and uses independent positive evidence on apply", async () => {
    const f = await fixture();
    const options = await reviewed(f);
    const prepared = await prepareFileScript(f.root, "write.js", options);
    expect(await runFileScript(f.client, prepared)).toMatchObject({
      phase: "inspected",
      verified: false,
    });
    expect(f.penpot.writes).toBe(0);
    const report = await runFileScript(f.client, prepared, {
      apply: true,
      journal: {
        root: f.root,
      },
    });
    expect(report).toMatchObject({
      phase: "applied",
      verified: true,
      journal: {
        state: "verified",
      },
    });
    expect(f.penpot.value).toBe(7);
    await f.write("readback.js", "// penpair: read\nreturn {ok:true,problems:[]};");
    const noEvidence = await prepareFileScript(f.root, "write.js", options);
    expect(
      await runFileScript(f.client, noEvidence, {
        apply: true,
        layout: false,
      }),
    ).toMatchObject({
      verified: false,
    });
  });
  it("recovers acknowledgment loss without replaying a satisfied nontransactional operation", async () => {
    const f = await fixture();
    const options = await reviewed(f);
    const prepared = await prepareFileScript(f.root, "write.js", options);
    f.loseNext();
    let runId = "";
    try {
      await runFileScript(f.client, prepared, {
        apply: true,
        journal: {
          root: f.root,
        },
      });
    } catch (error) {
      runId = (
        error as {
          runId: string;
        }
      ).runId;
    }
    expect(runId).toBeTruthy();
    expect(f.penpot.writes).toBe(1);
    expect(
      await runFileScript(f.client, prepared, {
        apply: true,
        journal: {
          root: f.root,
          runId,
          resume: true,
        },
      }),
    ).toMatchObject({
      verified: true,
    });
    expect(f.penpot.writes).toBe(1);
    await f.write(
      "write.js",
      "// penpair: write\n// penpair: idempotent\npenpot.value=20;return {ok:true};",
    );
    await expect(
      runFileScript(f.client, await prepareFileScript(f.root, "write.js", options), {
        apply: true,
        journal: {
          root: f.root,
          runId,
          resume: true,
        },
      }),
    ).rejects.toThrow(/inputs|implementation/);
  });
  it("enforces UTF-8 wrapped size, syntax and real project boundaries offline", async () => {
    const f = await fixture();
    await f.write(
      "large.js",
      "// penpair: read\nreturn {ok:true,text:'" + "😀".repeat(23000) + "'};",
    );
    await expect(prepareFileScript(f.root, "large.js")).rejects.toThrow(/90 KB|bytes/);
    await f.write("bad.js", "// penpair: read\nreturn {ok:true");
    await expect(prepareFileScript(f.root, "bad.js")).rejects.toThrow(/invalid plugin/);
    await expect(prepareFileScript(f.root, "../escape.js")).rejects.toThrow(/inside/);
    const outside = await mkdtemp(path.join(os.tmpdir(), "penpair-script-outside-"));
    await writeFile(path.join(outside, "outside.js"), "// penpair: read\nreturn {ok:true};");
    await symlink(path.join(outside, "outside.js"), path.join(f.root, "link.js"));
    await expect(prepareFileScript(f.root, "link.js")).rejects.toThrow(/outside/);
    await f.write("small.js", "// penpair: read\nreturn {ok:true};");
    await expect(
      prepareFileScript(f.root, "small.js", {
        params: {
          text: "é".repeat(46000),
        },
      }),
    ).rejects.toThrow(/bytes/);
  });
  it("checks the selected page before any included top-level effects", async () => {
    const f = await fixture();
    await f.write("helper.js", "// penpair: read\npenpot.value=99;"); // Deliberately dishonest: the guard must still precede this source.
    await f.write("read.js", "// penpair: read\nreturn {ok:true};");
    const prepared = await prepareFileScript(f.root, "read.js", {
      include: [
        "helper.js",
      ],
      page: "Other",
    });
    await expect(
      runFileScript(f.client, prepared, {
        settleMs: 0,
        sleep: async () => {},
      }),
    ).rejects.toThrow();
    expect(f.penpot.value).toBe(0);
  });
  it("runs through the CLI without importing unrelated extensions and rejects missing contracts before connecting", async () => {
    const f = await fixture();
    await reviewed(f);
    await f.write("read.js", "// penpair: read\nreturn {ok:true,value:CFG.value};");
    await f.write("extension.mjs", "throw new Error('extension must not execute');");
    const config = JSON.parse(await readFile(path.join(f.root, "penpair.config.json"), "utf8"));
    config.adapters = [
      "./extension.mjs",
    ];
    await f.write("penpair.config.json", JSON.stringify(config));
    vi.spyOn(process, "cwd").mockReturnValue(f.root);
    const connect = vi.spyOn(transport, "connect").mockResolvedValue(f.client);
    vi.spyOn(endpoint, "resolveEndpoint").mockResolvedValue({
      url: "https://example.test/mcp",
      description: {
        source: "env",
        origin: "https://example.test",
        pathname: "/mcp",
      },
    });
    const read = await runCommand([
      "run-file",
      "read.js",
      "--param",
      "value=hello",
    ]);
    expect(read).toMatchObject({
      exitCode: 0,
      data: {
        kind: "declared-read",
        data: {
          value: "hello",
        },
      },
    });
    connect.mockClear();
    expect(
      (
        await runCommand([
          "run-file",
          "write.js",
          "--apply",
        ])
      ).exitCode,
    ).toBe(1);
    expect(connect).not.toHaveBeenCalled();
    const board = {
      ...f.penpot.currentPage.root,
      id: "board",
      children: [],
    };
    const otherBoard = {
      ...board,
      id: "other-board",
    };
    f.penpot.currentPage.root.children = [
      board,
      otherBoard,
      ...Array.from(
        {
          length: 11000,
        },
        (_, index) => ({
          ...board,
          id: `archive-${index}`,
        }),
      ),
    ];
    Object.assign(f.penpot.currentPage, {
      getShapeById: (id: string) =>
        id === "board" ? board : id === "other-board" ? otherBoard : null,
    });
    const applied = await runCommand([
      "run-file",
      "write.js",
      "--inspect",
      "inspect.js",
      "--readback",
      "readback.js",
      "--param",
      "value=7",
      "--page",
      "P",
      "--layout-root",
      "board",
      "--layout-root",
      "other-board",
      "--layout-max-nodes",
      "20",
      "--apply",
    ]);
    expect(applied).toMatchObject({
      exitCode: 0,
      data: {
        verified: true,
        layout: {
          rootIds: [
            "board",
            "other-board",
          ],
          nodeCount: 2,
          maxNodes: 20,
          truncated: false,
        },
      },
    });
    const data = applied.data as {
      journal: {
        runId: string;
      };
    };
    const record = await readJournal(f.root, data.journal.runId);
    expect(record.steps[0]!.after).toMatchObject({
      layout: {
        rootIds: [
          "board",
          "other-board",
        ],
        nodeCount: 2,
        maxNodes: 20,
      },
    });
  });
});
