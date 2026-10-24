import { recordApproval } from "../src/approvals.js";
import { exportShapePng } from "../src/export.js";
import { mkdir, mkdtemp, readFile, readdir, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { PenpotToolClient } from "../src/client.js";
import { exportBaselines, pngSize, reflectionCases, validateBaselines } from "../src/baselines.js";
import { ConfigError, validateProjectConfig } from "../src/instance/config.js";

const reply = (result: unknown) => ({
  text: JSON.stringify({
    result,
    log: "",
  }),
  isError: false,
});
const fail = (message: string): never => {
  throw new ConfigError(message);
};
const config = {
  page: "Candidate",
  root: "tests/baselines",
  frames: [
    {
      frame: "F / candidates",
      id: "candidates-desktop",
      route: "candidates",
    },
    {
      frame: "F tablet / candidates",
      id: "candidates-tablet",
      route: "candidates",
    },
    {
      frame: "F / my work",
      id: "my-work",
    },
  ],
};

/** A PNG header with the given size (the rest is padding), enough for the size reader and for byte comparison. */
const png = (width: number, height: number, tag = ""): Buffer => {
  const head = Buffer.alloc(24);
  Buffer.from([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
  ]).copy(head);
  head.write("IHDR", 12, "ascii");
  head.writeUInt32BE(width, 16);
  head.writeUInt32BE(height, 20);
  return Buffer.concat([
    head,
    Buffer.from(tag),
  ]);
};

interface FakeShape {
  id: string;
  name: string;
  type: string;
  width: number;
  height: number;
  children?: FakeShape[];
}
interface Fake {
  roots?: FakeShape[];
  activeThemeIds?: string[];
  revision?: number;
  fileId?: string;
  onExport?(): void;
  frames: {
    id: string;
    name: string;
    width: number;
    height: number;
  }[];
  images: Record<string, Buffer[]>;
}
function penpot(fake: Fake): PenpotToolClient {
  const exportsDone: Record<string, number> = {};
  return {
    async callTool(_name, args) {
      const code = String(
        (
          args as {
            code: string;
          }
        ).code,
      );
      if (code.includes("const geometry = [], stack")) {
        return reply({
          ok: true,
          fileId: fake.fileId ?? "file",
          pageId: "page",
          native: true,
          geometry: [
            [
              "root",
              0,
              0,
              10,
              10,
              null,
              0,
            ],
          ],
          truncated: false,
        });
      }
      if (fake.roots && code.includes("const boards = []")) {
        const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
        const page = {
          id: "page",
          name: "Candidate",
          root: {
            children: fake.roots,
          },
        };
        return reply(
          await new AsyncFunction("penpot", code)({
            currentPage: page,
            currentFile: {
              id: fake.fileId ?? "file",
              name: "Brand",
              revn: fake.revision ?? 7,
              pages: [
                page,
              ],
            },
          }),
        );
      }
      const id = /"id":"([^"]+)"/.exec(code)?.[1];
      if (id && code.includes("export({")) {
        fake.onExport?.();
        const sequence = fake.images[id]!;
        const n = (exportsDone[id] = (exportsDone[id] ?? 0) + 1);
        const image = sequence[Math.min(n - 1, sequence.length - 1)]!;
        return reply({
          ok: true,
          base64: image.toString("base64"),
          length: image.length,
          capture: {
            designSize: {
              width: fake.frames.find((frame) => frame.id === id)!.width,
              height: fake.frames.find((frame) => frame.id === id)!.height,
            },
            activeThemeIds: fake.activeThemeIds ?? [],
            fileId: fake.fileId ?? "file",
            pageId: "page",
            frameId: id,
            revision: fake.revision ?? 7,
            scale: 1,
            penpotApiVersion: "test",
            renderEnvironment: null,
            activeThemes: [],
          },
        });
      }
      return reply({
        ok: true,
        file: "Brand",
        fileId: fake.fileId ?? "file",
        pageId: "page",
        revn: fake.revision ?? 7,
        page: "Candidate",
        frames: fake.frames,
      });
    },
    async close() {},
  };
}
const fast = {
  sleep: async () => undefined,
  settleMs: 0,
};
const frames = [
  {
    id: "a1",
    name: "F / candidates",
    width: 1512,
    height: 982,
  },
  {
    id: "b2",
    name: "F tablet / candidates",
    width: 834,
    height: 1194,
  },
  {
    id: "c3",
    name: "F / my work",
    width: 1512,
    height: 982,
  },
];
const settled = (w: number, h: number, tag: string): Buffer[] => [
  png(w, h, tag),
  png(w, h, tag),
];
const images = {
  a1: settled(1512, 982, "a"),
  b2: settled(834, 1194, "b"),
  c3: settled(1512, 982, "c"),
};
const project = (): Promise<string> => mkdtemp(path.join(os.tmpdir(), "penpair-baselines-"));

async function approvedPath(root: string, id: string): Promise<string> {
  const manifest = JSON.parse(
    await readFile(path.join(root, config.root, "penpair-baselines.json"), "utf8"),
  );
  return path.join(
    root,
    config.root,
    manifest.frames.find((entry: { id: string }) => entry.id === id).file,
  );
}

describe("the baselines configuration", () => {
  it("is validated inside penpair.config.json", () => {
    const external = {
      instance: "x",
      profile: {
        type: "external",
        origin: "https://design.penpot.app",
      },
    };
    expect(() =>
      validateProjectConfig({
        ...external,
        baselines: config,
      }),
    ).not.toThrow();
    expect(() =>
      validateProjectConfig({
        ...external,
        baselines: {
          ...config,
          root: "../out",
        },
      }),
    ).toThrow(/inside the project/);
    expect(() =>
      validateProjectConfig({
        ...external,
        baselines: {
          ...config,
          frames: [],
        },
      }),
    ).toThrow(/at least one/);
    expect(() =>
      validateProjectConfig({
        ...external,
        baselines: {
          ...config,
          frames: [
            {
              frame: "a",
              id: "x",
            },
            {
              frame: "b",
              id: "x",
            },
          ],
        },
      }),
    ).toThrow(/used twice/);
    expect(() =>
      validateProjectConfig({
        ...external,
        baselines: {
          ...config,
          frames: [
            {
              frame: "a",
              id: "../evil",
            },
          ],
        },
      }),
    ).toThrow(/lowercase/);
    expect(() =>
      validateBaselines(
        {
          ...config,
          threshold: 2,
        },
        fail,
      ),
    ).toThrow(/0 to 1/);
  });
});

describe("exporting baselines", () => {
  it("only looks without --apply, and says what it found", async () => {
    const root = await project();
    const report = await exportBaselines(
      penpot({
        frames,
        images,
      }),
      root,
      config,
      fast,
    );
    expect(
      report.results.map((r) => [
        r.id,
        r.status,
        r.written,
      ]),
    ).toEqual([
      [
        "candidates-desktop",
        "new",
        false,
      ],
      [
        "candidates-tablet",
        "new",
        false,
      ],
      [
        "my-work",
        "new",
        false,
      ],
    ]);
    expect(report.wrote).toEqual([]);
    expect(await readdir(root)).toEqual([]);
  });

  it("writes new images, a manifest and Reflection cases that match the image sizes", async () => {
    const root = await project();
    const report = await exportBaselines(
      penpot({
        frames,
        images,
      }),
      root,
      config,
      {
        ...fast,
        apply: true,
      },
    );
    expect(report.wrote).toEqual(
      expect.arrayContaining([
        "tests/baselines/penpair-baselines.json",
        "tests/baselines/reflection-cases.json",
      ]),
    );
    expect(pngSize(await readFile(await approvedPath(root, "candidates-tablet")))).toEqual({
      width: 834,
      height: 1194,
    });
    const manifest = JSON.parse(
      await readFile(path.join(root, "tests/baselines/penpair-baselines.json"), "utf8"),
    );
    expect(manifest).toMatchObject({
      penpotFile: "Brand",
      page: "Candidate",
      capturedRevision: 7,
    });
    expect(manifest.frames).toHaveLength(3);
    const cases = JSON.parse(
      await readFile(path.join(root, "tests/baselines/reflection-cases.json"), "utf8"),
    );
    expect(cases.routes.candidates.viewports).toEqual([
      {
        name: "design-1512x982",
        width: 1512,
        height: 982,
      },
      {
        name: "design-834x1194",
        width: 834,
        height: 1194,
      },
    ]);
    expect(cases.visualSmoke).toHaveLength(2);
    expect(cases.visualSmoke[0]).toMatchObject({
      id: "candidates-desktop",
      route: "candidates",
      viewport: "design-1512x982",
      baselineRoot: "tests/baselines",
      baseline: expect.stringMatching(/^captures\//),
      strict: false,
      ref: "penpair:candidates-desktop",
      threshold: {
        maxDiffPixelRatio: 0.05,
      },
    });
  });

  it("does not turn a changed design into the new reference unless asked", async () => {
    const root = await project();
    await exportBaselines(
      penpot({
        frames,
        images,
      }),
      root,
      config,
      {
        ...fast,
        apply: true,
      },
    );
    const changed = {
      ...images,
      a1: settled(1512, 982, "a-edited"),
    };
    const again = await exportBaselines(
      penpot({
        frames,
        images: changed,
      }),
      root,
      config,
      {
        ...fast,
        apply: true,
      },
    );
    expect(again.results.find((r) => r.id === "candidates-desktop")).toMatchObject({
      status: "changed",
      written: false,
    });
    expect(again.results.find((r) => r.id === "candidates-tablet")).toMatchObject({
      status: "same",
    });
    expect(
      (await readFile(await approvedPath(root, "candidates-desktop"))).toString("latin1"),
    ).toContain("a");
    expect(
      (await readFile(await approvedPath(root, "candidates-desktop"))).toString("latin1"),
    ).not.toContain("edited");
    await expect(
      exportBaselines(
        penpot({
          frames,
          images: changed,
        }),
        root,
        config,
        {
          ...fast,
          apply: true,
          update: true,
        },
      ),
    ).rejects.toThrow(/owner words/);
    await recordApproval(
      root,
      await exportShapePng(
        penpot({
          frames,
          images: changed,
        }),
        "a1",
        {
          ...fast,
          page: config.page,
          stable: true,
        },
      ),
      {
        note: "Approved changed layout (offline fixture)",
        by: "Fixture owner",
      },
    );
    const approved = await exportBaselines(
      penpot({
        frames,
        images: changed,
      }),
      root,
      config,
      {
        ...fast,
        apply: true,
        update: true,
      },
    );
    expect(approved.results.find((r) => r.id === "candidates-desktop")).toMatchObject({
      status: "changed",
      written: true,
    });
    expect(
      (await readFile(await approvedPath(root, "candidates-desktop"))).toString("latin1"),
    ).toContain("edited");
  });

  it("can replace a forced reference with exact owner evidence without changing pixels", async () => {
    const root = await project();
    await exportBaselines(
      penpot({
        frames,
        images,
      }),
      root,
      config,
      {
        ...fast,
        apply: true,
      },
    );
    const changed = {
      ...images,
      a1: settled(1512, 982, "forced"),
    };
    const forced = await exportBaselines(
      penpot({
        frames,
        images: changed,
      }),
      root,
      config,
      {
        ...fast,
        apply: true,
        update: true,
        forceReason: "Offline experiment only",
      },
    );
    expect(forced.results[0]!.approved).toMatchObject({
      approval: {
        kind: "forced-reference",
      },
    });
    await recordApproval(
      root,
      await exportShapePng(
        penpot({
          frames,
          images: changed,
        }),
        "a1",
        {
          ...fast,
          page: config.page,
          stable: true,
        },
      ),
      {
        note: "Approved the reviewed exact frame (fixture)",
        by: "Fixture owner",
      },
    );
    const approved = await exportBaselines(
      penpot({
        frames,
        images: changed,
      }),
      root,
      config,
      {
        ...fast,
        apply: true,
        update: true,
      },
    );
    expect(approved.results[0]).toMatchObject({
      status: "same",
      written: true,
      approved: {
        approval: {
          kind: "owner-words",
        },
      },
    });
  });

  it("describes the image on disk, not the new design, when a changed design was not approved", async () => {
    const root = await project();
    await exportBaselines(
      penpot({
        frames,
        images,
      }),
      root,
      config,
      {
        ...fast,
        apply: true,
      },
    );
    const resized = {
      ...images,
      a1: settled(1600, 1000, "a-big"),
    };
    await exportBaselines(
      penpot({
        frames: frames.map((f) =>
          f.id === "a1"
            ? {
                ...f,
                width: 1600,
                height: 1000,
              }
            : f,
        ),
        images: resized,
      }),
      root,
      config,
      {
        ...fast,
        apply: true,
      },
    );
    const cases = JSON.parse(
      await readFile(path.join(root, "tests/baselines/reflection-cases.json"), "utf8"),
    );
    expect(cases.visualSmoke[0].viewport).toBe("design-1512x982");
  });

  it("reports a frame that is missing and an export that never settles, and writes neither", async () => {
    const root = await project();
    const unstable = {
      ...images,
      c3: [
        png(1, 1, "1"),
        png(1, 1, "2"),
        png(1, 1, "3"),
        png(1, 1, "4"),
        png(1, 1, "5"),
      ],
    };
    const report = await exportBaselines(
      penpot({
        frames: frames.filter((f) => f.id !== "b2"),
        images: unstable,
      }),
      root,
      config,
      {
        ...fast,
        apply: true,
      },
    );
    expect(
      report.results.map((r) => [
        r.id,
        r.status,
      ]),
    ).toEqual([
      [
        "candidates-desktop",
        "new",
      ],
      [
        "candidates-tablet",
        "missing",
      ],
      [
        "my-work",
        "unstable",
      ],
    ]);
    expect(report.complete).toBe(false);
    expect(report.wrote).toEqual([]);
    expect(await readdir(root)).toEqual([]);
  });

  it("keeps original approval provenance when a new capture is not approved", async () => {
    const root = await project();
    await exportBaselines(
      penpot({
        frames,
        images,
      }),
      root,
      config,
      {
        ...fast,
        apply: true,
      },
    );
    const manifestPath = path.join(root, config.root, "penpair-baselines.json");
    const original = JSON.parse(await readFile(manifestPath, "utf8"));
    await exportBaselines(
      penpot({
        frames,
        revision: 8,
        images: {
          ...images,
          a1: settled(1512, 982, "edited"),
        },
      }),
      root,
      config,
      {
        ...fast,
        apply: true,
      },
    );
    const updated = JSON.parse(await readFile(manifestPath, "utf8"));
    expect(updated.frames[0].approved).toEqual(original.frames[0].approved);
    expect(updated.frames[0].approved.revision).toBe(7);
    expect(updated.frames[0].captured.revision).toBe(8);
    expect(updated.frames[0].captured.sha256).not.toBe(updated.frames[0].approved.sha256);
    expect(updated.frames[1].approved).toEqual(original.frames[1].approved);
    expect(updated.capturedRevision).toBe(8);
  });

  it.each([
    "revision",
    "file",
  ])("preserves the prior manifest after a mid-capture %s change", async (change) => {
    const root = await project();
    await exportBaselines(
      penpot({
        frames,
        images,
      }),
      root,
      config,
      {
        ...fast,
        apply: true,
      },
    );
    const manifestPath = path.join(root, config.root, "penpair-baselines.json");
    const original = await readFile(manifestPath);
    const fake: Fake = {
      frames,
      images,
      onExport: () => {
        if (change === "revision") {
          fake.revision = 8;
        } else {
          fake.fileId = "other";
        }
      },
    };
    await expect(
      exportBaselines(penpot(fake), root, config, {
        ...fast,
        apply: true,
      }),
    ).rejects.toThrow(/source changed/);
    expect(await readFile(manifestPath)).toEqual(original);
  });

  it("preserves a complete prior manifest after missing output, export failure or cancellation", async () => {
    const root = await project();
    await exportBaselines(
      penpot({
        frames,
        images,
      }),
      root,
      config,
      {
        ...fast,
        apply: true,
      },
    );
    const manifestPath = path.join(root, config.root, "penpair-baselines.json");
    const original = await readFile(manifestPath);
    const missing = await exportBaselines(
      penpot({
        frames: frames.slice(0, 2),
        images,
      }),
      root,
      config,
      {
        ...fast,
        apply: true,
      },
    );
    expect(missing).toMatchObject({
      complete: false,
      wrote: [],
    });
    const client = penpot({
      frames,
      images,
    });
    const call = client.callTool.bind(client);
    client.callTool = async (name, args) => {
      if (String(args.code).includes('"id":"b2"')) {
        throw new Error("render failed");
      }
      return call(name, args);
    };
    await expect(
      exportBaselines(client, root, config, {
        ...fast,
        apply: true,
        attempts: 1,
      }),
    ).rejects.toThrow(/render failed/);
    const controller = new AbortController();
    await expect(
      exportBaselines(
        penpot({
          frames,
          images,
        }),
        root,
        config,
        {
          ...fast,
          apply: true,
          signal: controller.signal,
          onStep: (message) => {
            if (message.startsWith("staging")) {
              controller.abort();
            }
          },
        },
      ),
    ).rejects.toThrow();
    expect(await readFile(manifestPath)).toEqual(original);
  });

  it("refuses an ambiguous frame name", async () => {
    const root = await project();
    const twice = [
      ...frames,
      {
        id: "z9",
        name: "F / candidates",
        width: 10,
        height: 10,
      },
    ];
    await expect(
      exportBaselines(
        penpot({
          frames: twice,
          images,
        }),
        root,
        config,
        fast,
      ),
    ).rejects.toThrow(/more than one/);
  });
});

describe("Reflection cases", () => {
  it("leave out frames without a route and take the threshold from the config", () => {
    const cases = reflectionCases(
      {
        ...config,
        threshold: 0.02,
      },
      [
        {
          id: "my-work",
          frame: "F / my work",
          file: "my-work.png",
          status: "same",
          written: false,
          imageWidth: 100,
          imageHeight: 100,
        },
        {
          id: "candidates-desktop",
          frame: "F / candidates",
          file: "candidates-desktop.png",
          status: "same",
          written: false,
          imageWidth: 100,
          imageHeight: 80,
        },
      ],
    );
    expect(cases.visualSmoke).toHaveLength(1);
    expect(cases.visualSmoke[0]).toMatchObject({
      threshold: {
        maxDiffPixelRatio: 0.02,
      },
      viewport: "design-100x80",
    });
  });
});

describe("the PNG size reader", () => {
  it("reads the header and ignores anything else", () => {
    expect(pngSize(png(5, 7))).toEqual({
      width: 5,
      height: 7,
    });
    expect(pngSize(Buffer.from("not a png at all, just text........"))).toBeUndefined();
  });
});

describe("explicit baseline case provenance", () => {
  const designCase = {
    viewport: {
      width: 1512,
      height: 982,
    },
    theme: "light",
    state: "default",
    fixture: "fixture-v1",
    fonts: [
      "Test Sans",
    ],
    activeThemeIds: [
      "light-id",
    ],
  };
  const rich = () => ({
    ...config,
    frames: [
      {
        ...config.frames[0]!,
        case: designCase,
      },
    ],
  });
  it("requires approval of changed case intent even when PNG bytes are identical", async () => {
    const root = await project();
    const initial = rich();
    await exportBaselines(
      penpot({
        frames,
        images,
        activeThemeIds: [
          "light-id",
        ],
      }),
      root,
      initial,
      {
        ...fast,
        apply: true,
      },
    );
    const next = {
      ...initial,
      frames: [
        {
          ...initial.frames[0]!,
          case: {
            ...designCase,
            fixture: "fixture-v2",
          },
        },
      ],
    };
    const report = await exportBaselines(
      penpot({
        frames,
        images,
        activeThemeIds: [
          "light-id",
        ],
      }),
      root,
      next,
      {
        ...fast,
        apply: true,
      },
    );
    expect(report.results[0]).toMatchObject({
      status: "changed",
      written: false,
      captured: {
        case: {
          fixture: "fixture-v2",
        },
      },
      approved: {
        case: {
          fixture: "fixture-v1",
        },
      },
    });
    const approved = await exportBaselines(
      penpot({
        frames,
        images,
        activeThemeIds: [
          "light-id",
        ],
      }),
      root,
      next,
      {
        ...fast,
        apply: true,
        update: true,
        forceReason: "Offline case-migration fixture",
      },
    );
    expect(approved.results[0]).toMatchObject({
      written: true,
      approved: {
        case: {
          fixture: "fixture-v2",
        },
      },
    });
  });
  it("pins case metadata before asynchronous capture instead of approving a caller's later mutation", async () => {
    const root = await project();
    const initial = rich();
    initial.frames[0]!.case = structuredClone(designCase);
    const report = await exportBaselines(
      penpot({
        frames,
        images,
        activeThemeIds: [
          "light-id",
        ],
        onExport: () => {
          initial.frames[0]!.case.fixture = "changed-during-capture";
        },
      }),
      root,
      initial,
      {
        ...fast,
        apply: true,
      },
    );
    expect(report.results[0]?.approved).toMatchObject({
      case: {
        fixture: "fixture-v1",
      },
    });
  });
  it("preserves the prior generation when declared viewport or active theme IDs mismatch", async () => {
    const root = await project();
    const initial = rich();
    await exportBaselines(
      penpot({
        frames,
        images,
        activeThemeIds: [
          "light-id",
        ],
      }),
      root,
      initial,
      {
        ...fast,
        apply: true,
      },
    );
    const file = path.join(root, config.root, "penpair-baselines.json");
    const before = await readFile(file, "utf8");
    const report = await exportBaselines(
      penpot({
        frames,
        images,
        activeThemeIds: [
          "dark-id",
        ],
      }),
      root,
      initial,
      {
        ...fast,
        apply: true,
        update: true,
        forceReason: "Offline active-theme refusal fixture",
      },
    );
    expect(report).toMatchObject({
      complete: false,
      wrote: [],
      results: [
        {
          status: "case-mismatch",
          problems: [
            expect.stringMatching(/theme IDs/),
          ],
        },
      ],
    });
    expect(await readFile(file, "utf8")).toBe(before);
    const mismatch = {
      ...initial,
      frames: [
        {
          ...initial.frames[0]!,
          case: {
            ...designCase,
            viewport: {
              width: 100,
              height: 80,
            },
          },
        },
      ],
    };
    expect(
      (
        await exportBaselines(
          penpot({
            frames,
            images,
            activeThemeIds: [
              "light-id",
            ],
          }),
          root,
          mismatch,
          {
            ...fast,
            apply: true,
          },
        )
      ).results[0],
    ).toMatchObject({
      status: "case-mismatch",
    });
    expect(await readFile(file, "utf8")).toBe(before);
  });
  it("keeps approval tied to its source identity when pixels happen to match another file", async () => {
    const root = await project();
    const initial = rich();
    await exportBaselines(
      penpot({
        frames,
        images,
        activeThemeIds: [
          "light-id",
        ],
      }),
      root,
      initial,
      {
        ...fast,
        apply: true,
      },
    );
    const report = await exportBaselines(
      penpot({
        frames,
        images,
        fileId: "another-file",
        activeThemeIds: [
          "light-id",
        ],
      }),
      root,
      initial,
      {
        ...fast,
        apply: true,
      },
    );
    expect(report.results[0]).toMatchObject({
      status: "changed",
      written: false,
      captured: {
        fileId: "another-file",
      },
      approved: {
        fileId: "file",
      },
    });
  });
  it("refuses a capture-generation symlink that would publish outside the project", async () => {
    const root = await project();
    const outside = await project();
    await mkdir(path.join(root, config.root), {
      recursive: true,
    });
    await symlink(outside, path.join(root, config.root, "captures"));
    await expect(
      exportBaselines(
        penpot({
          frames,
          images,
        }),
        root,
        config,
        {
          ...fast,
          apply: true,
        },
      ),
    ).rejects.toThrow(/outside/);
    expect(await readdir(outside)).toEqual([]);
  });
});

describe("baseline frame IDs", () => {
  const frameId = "10216397-acdf-805e-8008-d69b71f841d4";
  const secondId = "20216397-acdf-805e-8008-d69b71f841d4";
  const nested = [
    {
      id: frameId,
      name: "Desktop",
      width: 1512,
      height: 982,
      type: "board",
    },
    {
      id: secondId,
      name: "Tablet",
      width: 834,
      height: 1194,
      type: "board",
    },
  ];
  const roots = [
    {
      id: "section",
      name: "Section",
      type: "board",
      width: 2000,
      height: 2000,
      children: nested,
    },
  ];
  const fixture = (): Fake => ({
    roots,
    frames: [
      ...nested,
    ],
    images: {
      [frameId]: images.a1,
      [secondId]: images.b2,
    },
  });
  const byId = {
    ...config,
    frames: [
      {
        id: "desktop",
        frameId,
      },
      {
        id: "tablet",
        frameId: secondId,
        frame: "Tablet",
      },
    ],
  };

  it("accepts name, ID or both and rejects missing, invalid and duplicate IDs", () => {
    expect(validateBaselines(byId, fail)).toEqual(byId);
    for (const entry of [
      {
        id: "x",
      },
      {
        id: "x",
        frameId: "bad",
      },
      {
        id: "x",
        frame: "",
        frameId,
      },
    ]) {
      expect(() =>
        validateBaselines(
          {
            ...config,
            frames: [
              entry,
            ],
          },
          fail,
        ),
      ).toThrow();
    }
    expect(() =>
      validateBaselines(
        {
          ...config,
          frames: [
            {
              id: "a",
              frameId,
            },
            {
              id: "b",
              frameId: frameId.toUpperCase(),
            },
          ],
        },
        fail,
      ),
    ).toThrow(/used twice/);
    expect(() =>
      validateBaselines(
        {
          ...config,
          frames: Array.from(
            {
              length: 1001,
            },
            (_, index) => ({
              id: `f-${index}`,
              frame: "Desktop",
            }),
          ),
        },
        fail,
      ),
    ).toThrow(/1000/);
  });

  it("captures every configured nested board by ID through the real listing snippet", async () => {
    const root = await project();
    const report = await exportBaselines(penpot(fixture()), root, byId, {
      ...fast,
      apply: true,
    });
    expect(report.complete).toBe(true);
    expect(
      report.results.map((result) => [
        result.frameId,
        result.frame,
        result.written,
      ]),
    ).toEqual([
      [
        frameId,
        "Desktop",
        true,
      ],
      [
        secondId,
        "Tablet",
        true,
      ],
    ]);
    const manifest = JSON.parse(
      await readFile(path.join(root, config.root, "penpair-baselines.json"), "utf8"),
    );
    expect(manifest.frames.map((entry: { frameId: string }) => entry.frameId)).toEqual([
      frameId,
      secondId,
    ]);
  });

  it("reports a stale expected name as renamed without exporting or writing", async () => {
    const root = await project();
    const fake = fixture();
    fake.onExport = () => {
      throw new Error("must not export renamed frame");
    };
    const report = await exportBaselines(
      penpot(fake),
      root,
      {
        ...config,
        frames: [
          {
            id: "desktop",
            frameId,
            frame: "Old name",
          },
        ],
      },
      {
        ...fast,
        apply: true,
      },
    );
    expect(report).toMatchObject({
      complete: false,
      wrote: [],
      results: [
        {
          frameId,
          status: "renamed",
          written: false,
          problems: [
            expect.stringContaining("Desktop"),
          ],
        },
      ],
    });
    expect(await readdir(root)).toEqual([]);
  });

  it("does not fall back to a name for a missing ID or select a nested name-only frame", async () => {
    const report = await exportBaselines(
      penpot(fixture()),
      await project(),
      {
        ...config,
        frames: [
          {
            id: "missing-id",
            frameId: "30216397-acdf-805e-8008-d69b71f841d4",
            frame: "Desktop",
          },
          {
            id: "nested-name",
            frame: "Tablet",
          },
        ],
      },
      fast,
    );
    expect(report.results.map((entry) => entry.status)).toEqual([
      "missing",
      "missing",
    ]);
  });

  it("keeps name-only matching top-level even in a mixed ID configuration", async () => {
    const fake = fixture();
    fake.roots = [
      ...roots,
      {
        ...nested[0]!,
        id: "top",
        children: [],
      },
    ];
    fake.frames.push({
      ...nested[0]!,
      id: "top",
    });
    fake.images.top = images.a1;
    const report = await exportBaselines(
      penpot(fake),
      await project(),
      {
        ...config,
        frames: [
          {
            id: "by-name",
            frame: "Desktop",
          },
          byId.frames[1]!,
        ],
      },
      fast,
    );
    expect(report.results.map((entry) => entry.frameId)).toEqual([
      "top",
      secondId,
    ]);
  });

  it("rejects truncated listings before capture and preserves publication after a truncated recheck", async () => {
    const root = await project();
    const fake = fixture();
    fake.roots = Array.from(
      {
        length: 10001,
      },
      (_, index) => ({
        ...roots[0]!,
        id: `section-${index}`,
        children: [],
      }),
    );
    await expect(
      exportBaselines(penpot(fake), root, byId, {
        ...fast,
        apply: true,
      }),
    ).rejects.toThrow(/truncated/);
    expect(await readdir(root)).toEqual([]);
    const client = penpot(fixture());
    const call = client.callTool.bind(client);
    let listings = 0;
    client.callTool = async (name, args) => {
      if (String(args.code).includes("const boards = []") && ++listings === 2) {
        return reply({
          ok: true,
          truncated: true,
        });
      }
      return call(name, args);
    };
    await expect(
      exportBaselines(client, root, byId, {
        ...fast,
        apply: true,
      }),
    ).rejects.toThrow(/source changed/);
    expect(await readdir(root)).toEqual([]);
  });

  it("matches owner approval for a nested frame by exact capture identity", async () => {
    const root = await project();
    const designCase = {
      viewport: {
        width: 1512,
        height: 982,
      },
      theme: "light",
      state: "default",
      fixture: "nested",
    };
    const rich = {
      ...config,
      frames: [
        {
          id: "desktop",
          frameId,
          route: "login",
          case: designCase,
        },
      ],
      coverage: {
        required: [
          {
            route: "login",
            ...designCase,
          },
        ],
      },
    };
    await exportBaselines(penpot(fixture()), root, rich, {
      ...fast,
      apply: true,
    });
    const changed = fixture();
    changed.images[frameId] = settled(1512, 982, "changed");
    await recordApproval(
      root,
      await exportShapePng(penpot(changed), frameId, {
        ...fast,
        page: config.page,
        stable: true,
      }),
      {
        note: "Approved nested frame (offline fixture)",
        by: "Fixture owner",
      },
      designCase,
    );
    const report = await exportBaselines(penpot(changed), root, rich, {
      ...fast,
      apply: true,
      update: true,
    });
    expect(report.results[0]?.approved).toMatchObject({
      frameId,
      approval: {
        kind: "owner-words",
      },
    });
    expect(report.coverage.designCasesComplete).toBe(true);
  });
});
