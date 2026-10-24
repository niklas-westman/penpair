import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { baselineCoverage, readBaselineCoverage } from "../src/baseline-coverage.js";
import { reflectionCases, type BaselineResult } from "../src/baselines.js";
import {
  validateBaselines,
  type BaselineCase,
  type BaselinesConfig,
  type CoverageRequirement,
} from "../src/baselines-config.js";
import { runCommand } from "../src/cli-main.js";
import * as client from "../src/client.js";
const fail = (message: string): never => {
  throw new Error(message);
};
const viewport = {
  width: 1440,
  height: 900,
};
const mobile = {
  width: 390,
  height: 844,
};
const designCase = (size = viewport, theme = "light", state = "default"): BaselineCase => ({
  viewport: size,
  theme,
  state,
  fixture: "fixture-v1",
  fonts: [
    "Test Sans 400",
  ],
  activeThemeIds: [],
});
function matrix() {
  const required: CoverageRequirement[] = [
    viewport,
    mobile,
  ].flatMap((size) =>
    [
      "light",
      "dark",
    ].flatMap((theme) =>
      [
        "default",
        "empty",
      ].map((state) => ({
        route: "home",
        viewport: size,
        theme,
        state,
        fixture: "fixture-v1",
      })),
    ),
  );
  const config: BaselinesConfig = {
    page: "Candidate",
    root: "design/baselines",
    coverage: {
      required,
      unsupported: [
        {
          ...required[7]!,
          reason: "Mobile dark empty fixture is not yet designed",
        },
      ],
    },
    frames: [
      {
        id: "desktop-light",
        frame: "Desktop Light",
        route: "home",
        case: designCase(),
      },
      {
        id: "desktop-dark",
        frame: "Desktop Dark",
        route: "home",
        case: designCase(viewport, "dark"),
      },
      {
        id: "mobile-empty",
        frame: "Mobile Empty",
        route: "home",
        case: designCase(mobile, "light", "empty"),
      },
    ],
  };
  return {
    config,
    required,
  };
}
function result(id = "desktop-light", value = designCase()): BaselineResult {
  const evidence = {
    case: value,
    fileId: "file",
    pageId: "page",
    frameId: id + "-frame",
    revision: 1,
    scale: 1,
    penpotApiVersion: "fixture",
    renderEnvironment: "fixture-renderer",
    activeThemes: [],
    activeThemeIds: [],
    designSize: value.viewport,
    sha256: "hash",
    capturedAt: "2026-10-21T00:00:00Z",
    toolVersion: "0.1.3",
    file: id + ".png",
  };
  return {
    id,
    frame: id,
    frameId: evidence.frameId,
    file: evidence.file,
    case: value,
    captured: evidence,
    approved: evidence,
    sha256: evidence.sha256,
    imageWidth: value.viewport.width,
    imageHeight: value.viewport.height,
    status: "same",
    written: false,
  };
}
const png = (width: number, height: number) => {
  const bytes = Buffer.alloc(24);
  Buffer.from([
    137,
    80,
    78,
    71,
    13,
    10,
    26,
    10,
  ]).copy(bytes);
  bytes.write("IHDR", 12);
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
};
afterEach(() => vi.restoreAllMocks());
describe("explicit design-case matrix", () => {
  it("includes desktop/mobile, light/dark and a non-happy state with missing/unsupported cases visible", () => {
    const { config } = matrix();
    const report = baselineCoverage(config, [
      result(),
    ]);
    expect(report).toMatchObject({
      configured: true,
      designCasesComplete: false,
      browserVerification: "not-run",
      accessibility: "not-assessed",
    });
    expect(report.rows).toHaveLength(8);
    expect(report.rows.map((row) => row.status)).toEqual([
      "approved-design-intent",
      "missing-case",
      "missing-capture",
      "missing-case",
      "missing-case",
      "missing-capture",
      "missing-case",
      "unsupported",
    ]);
    expect(report.unknown[0]?.fields).toContain("font loading/version not observed");
  });
  it("can record complete approved design intent without claiming browser or accessibility verification", () => {
    const { required } = matrix();
    const config: BaselinesConfig = {
      page: "Candidate",
      root: "design",
      coverage: {
        required,
      },
      frames: required.map((value, index) => ({
        id: "case-" + index,
        frame: "Frame " + index,
        route: value.route,
        case: {
          viewport: value.viewport,
          theme: value.theme,
          state: value.state,
          fixture: value.fixture,
        },
      })),
    };
    const report = baselineCoverage(
      config,
      config.frames.map((frame) => result(frame.id, frame.case)),
    );
    expect(report.designCasesComplete).toBe(true);
    expect(report.browserVerification).toBe("not-run");
    expect(report.accessibility).toBe("not-assessed");
  });
  it("refuses legacy/mismatched metadata, native-theme assertions and changed unapproved captures as covered", () => {
    const { config } = matrix();
    const legacy = result();
    legacy.approved = {
      legacy: true,
      sha256: "hash",
    };
    expect(
      baselineCoverage(config, [
        legacy,
      ]).rows[0]?.status,
    ).toBe("unapproved-metadata");
    const wrong = result();
    wrong.approved = {
      ...wrong.captured!,
      case: {
        ...designCase(),
        state: "error",
      },
    };
    expect(
      baselineCoverage(config, [
        wrong,
      ]).rows[0]?.status,
    ).toBe("unapproved-metadata");
    const changed = result();
    changed.status = "changed";
    changed.captured = {
      ...changed.captured!,
      sha256: "new-hash",
    };
    expect(
      baselineCoverage(config, [
        changed,
      ]).rows[0]?.status,
    ).toBe("changed-unapproved");
    const ids = result();
    config.frames[0]!.case!.activeThemeIds = [
      "theme-light",
    ];
    ids.approved = {
      ...(ids.approved as typeof ids.captured),
      case: config.frames[0]!.case,
    } as never;
    expect(
      baselineCoverage(config, [
        ids,
      ]).rows[0]?.status,
    ).toBe("unapproved-metadata");
  });
  it("keeps explicit state/fixture cases pending a provider mapping instead of generating false default browser checks", () => {
    const { config } = matrix();
    const cases = reflectionCases(config, [
      result(),
    ]);
    expect(cases.visualSmoke).toEqual([]);
    expect(cases.pendingCases).toHaveLength(1);
    expect(cases.pendingCases[0]).toMatchObject({
      approvedMetadata: true,
      case: {
        theme: "light",
        state: "default",
        fixture: "fixture-v1",
      },
      browserVerification: "not-run",
    });
  });
  it("validates bounded explicit metadata and case requirements while retaining legacy configuration", () => {
    const { config } = matrix();
    expect(() => validateBaselines(config, fail)).not.toThrow();
    expect(() =>
      validateBaselines(
        {
          ...config,
          coverage: {
            required: [
              ...config.coverage!.required,
              config.coverage!.required[0],
            ],
          },
        },
        fail,
      ),
    ).toThrow(/Duplicate/);
    expect(() =>
      validateBaselines(
        {
          ...config,
          frames: [
            {
              ...config.frames[0],
              case: {
                ...designCase(),
                viewport: {
                  width: 0,
                  height: 20,
                },
              },
            },
          ],
        },
        fail,
      ),
    ).toThrow(/viewport/);
    expect(() =>
      validateBaselines(
        {
          ...config,
          frames: [
            {
              ...config.frames[0],
              case: {
                ...designCase(),
                typo: "ignored",
              },
            },
          ],
        },
        fail,
      ),
    ).toThrow(/Unknown/);
    expect(() =>
      validateBaselines(
        {
          ...config,
          threshold: NaN,
        },
        fail,
      ),
    ).toThrow(/0 to 1/);
    expect(() =>
      validateBaselines(
        {
          page: "P",
          root: "design",
          frames: [
            {
              id: "old",
              frame: "Old",
            },
          ],
        },
        fail,
      ),
    ).not.toThrow();
    expect(
      baselineCoverage({
        page: "P",
        root: "design",
        frames: [
          {
            id: "old",
            frame: "Old",
          },
        ],
      }).unknown[0]?.fields,
    ).toContain("state");
  });
  it("validates approved PNG bytes offline and makes corruption, missing files and wrong pins visible", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "penpair-coverage-"));
    const { config } = matrix();
    const evidence = result();
    const bytes = png(1440, 900);
    evidence.sha256 = createHash("sha256").update(bytes).digest("hex");
    evidence.approved!.sha256 = evidence.sha256;
    await mkdir(path.join(root, config.root), {
      recursive: true,
    });
    await writeFile(path.join(root, config.root, evidence.file), bytes);
    await writeFile(
      path.join(root, config.root, "penpair-baselines.json"),
      JSON.stringify({
        schemaVersion: 2,
        fileId: "file",
        frames: [
          evidence,
        ],
      }),
    );
    expect((await readBaselineCoverage(root, config, "file")).rows[0]?.status).toBe(
      "approved-design-intent",
    );
    await writeFile(path.join(root, config.root, evidence.file), "corrupt");
    expect((await readBaselineCoverage(root, config, "file")).rows[0]).toMatchObject({
      status: "unapproved-metadata",
      reason: expect.stringMatching(/PNG bytes/),
    });
    await expect(readBaselineCoverage(root, config, "another-file")).rejects.toThrow(
      /different pinned file/,
    );
    vi.spyOn(process, "cwd").mockReturnValue(root);
    await writeFile(
      path.join(root, "penpair.config.json"),
      JSON.stringify({
        instance: "demo",
        profile: {
          type: "external",
          origin: "https://example.test",
        },
        baselines: config,
      }),
    );
    const connect = vi.spyOn(client, "connect");
    expect(
      (
        await runCommand([
          "baselines",
          "coverage",
        ])
      ).exitCode,
    ).toBe(3);
    expect(connect).not.toHaveBeenCalled();
  });
  it("never follows an external baseline-folder symlink while checking coverage", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "penpair-coverage-link-"));
    const outside = await mkdtemp(path.join(os.tmpdir(), "penpair-coverage-outside-"));
    await symlink(outside, path.join(root, "design"));
    await expect(
      readBaselineCoverage(root, {
        page: "P",
        root: "design",
        frames: [
          {
            id: "x",
            frame: "X",
          },
        ],
      }),
    ).rejects.toThrow(/outside/);
  });
});

it.each([
  {
    width: 1439.9999999999995,
    height: 900.0000000000001,
    imageWidth: 2880,
    imageHeight: 1800,
    covered: true,
  },
  {
    width: 1441,
    height: 900,
    imageWidth: 2880,
    imageHeight: 1800,
    covered: false,
  },
  {
    width: 1440,
    height: 901,
    imageWidth: 2880,
    imageHeight: 1800,
    covered: false,
  },
  {
    width: 1439.9999999999995,
    height: 900,
    imageWidth: 2881,
    imageHeight: 1800,
    covered: false,
  },
  {
    width: 1440,
    height: 900.0000000000001,
    imageWidth: 2880,
    imageHeight: 1801,
    covered: false,
  },
])(
  "coverage tolerates only geometry noise and keeps scaled pixels exact: $width x $height / $imageWidth x $imageHeight",
  (size) => {
    const { config } = matrix();
    const capture = result();
    const evidence = {
      ...capture.captured!,
      designSize: {
        width: size.width,
        height: size.height,
      },
      scale: 2,
    };
    capture.captured = evidence;
    capture.approved = evidence;
    capture.imageWidth = size.imageWidth;
    capture.imageHeight = size.imageHeight;

    expect(
      baselineCoverage(config, [
        capture,
      ]).rows[0]?.status,
    ).toBe(size.covered ? "approved-design-intent" : "unapproved-metadata");
  },
);
