import { cp, mkdtemp } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { kitFixture } from "./helpers/kit-fixture.js";
import { prepareFileScript, runFileScript } from "../src/run-file.js";
import { projectTheme } from "../src/token-projection.js";
import type { PenpotToolClient } from "../src/client.js";
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
it("applies isolated projected colors to owned roots without touching global tokens or other bindings", async () => {
  const f = kitFixture();
  const root = await mkdtemp(path.join(os.tmpdir(), "penpair-projection-"));
  await cp(
    fileURLToPath(new URL("../../../examples/theme-preview", import.meta.url)),
    path.join(root, "preview"),
    {
      recursive: true,
    },
  );
  const client: PenpotToolClient = {
    async callTool(_name, args) {
      return {
        text: JSON.stringify({
          result: await new AsyncFunction("penpot", String(args.code))(f.penpot),
          log: "",
        }),
        isError: false,
      };
    },
    async close() {},
  };
  const catalog = {
    sets: [
      {
        name: "Light",
        tokens: [
          {
            name: "surface",
            type: "color",
            value: "#FFFFFF",
          },
        ],
      },
      {
        name: "Dark",
        tokens: [
          {
            name: "surface",
            type: "color",
            value: "#000000",
          },
        ],
      },
    ],
    themes: [
      {
        name: "Light",
        group: "Mode",
        sets: [
          "Light",
        ],
      },
      {
        name: "Dark",
        group: "Mode",
        sets: [
          "Dark",
        ],
      },
    ],
  };
  const unrelated = f.penpot.createBoard();
  unrelated.name = "Unrelated";
  const original = JSON.stringify({
    sets: f.sets,
    themes: f.library.tokens.themes,
  });
  const ids = [];
  for (const theme of [
    "Light",
    "Dark",
  ]) {
    const board = f.penpot.createBoard();
    ids.push(board.id);
    board.setSharedPluginData("penpair", "owner", "scratch");
    board.tokens = {
      typography: "body",
      rowGap: "space",
      borderRadiusTopLeft: "radius",
      fill: "surface",
    };
    let fills: unknown[] = [];
    Object.defineProperty(board, "fills", {
      get: () => fills,
      set: (value) => {
        fills = value;
        delete board.tokens.fill;
      },
    });
    const prepared = await prepareFileScript(root, "preview/apply.js", {
      page: "Candidate",
      include: [
        "preview/helpers.js",
      ],
      inspect: "preview/inspect.js",
      readback: "preview/readback.js",
      params: {
        preview: JSON.stringify(projectTheme(catalog, theme)),
        color: "surface",
        rootId: board.id,
        marker: "scratch",
      },
    });
    expect(
      await runFileScript(client, prepared, {
        apply: true,
      }),
    ).toMatchObject({
      verified: true,
    });
    expect(
      await runFileScript(client, prepared, {
        apply: true,
      }),
    ).toMatchObject({
      verified: true,
    });
    expect(board.tokens).toEqual({
      typography: "body",
      rowGap: "space",
      borderRadiusTopLeft: "radius",
    });
    expect(JSON.parse(board.getSharedPluginData("penpair", "projection"))).toMatchObject({
      kind: "projected-theme-preview",
      nativeBindings: false,
      theme: {
        name: theme,
      },
    });
    board.setSharedPluginData("penpair", "owner", "someone-else");
    await expect(runFileScript(client, prepared)).rejects.toThrow(/owned scratch/);
  }
  expect(f.root.children.map((shape) => shape.id)).toEqual([
    unrelated.id,
    ...ids,
  ]);
  expect(
    JSON.stringify({
      sets: f.sets,
      themes: f.library.tokens.themes,
    }),
  ).toBe(original);
});
