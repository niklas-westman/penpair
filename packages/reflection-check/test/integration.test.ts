import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  type ArtifactProvenance,
  type BaselineResult,
  type BaselinesConfig,
  type AdapterContext,
  loadConfig,
} from "@penpair/core";
import adapter, {
  planImplementationCases,
  runImplementationCases,
  type ProviderEvidence,
} from "../src/index.js";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY1cAAAAASUVORK5CYII=",
  "base64",
);
const hash = createHash("sha256").update(png).digest("hex");
const intent = {
  viewport: {
    width: 1,
    height: 1,
  },
  theme: "dark",
  state: "empty",
  fixture: "no-items",
  fonts: [
    "Test Sans",
  ],
};
const config: BaselinesConfig = {
  page: "Dashboard",
  root: "design",
  frames: [
    {
      id: "empty",
      frame: "Empty",
      route: "/dashboard",
      case: intent,
    },
  ],
};
const provenance: ArtifactProvenance = {
  fileId: "file",
  pageId: "page",
  frameId: "frame",
  revision: 1,
  scale: 1,
  activeThemes: [],
  penpotApiVersion: "test",
  renderEnvironment: "test",
  sha256: hash,
  file: "empty.png",
  capturedAt: "2026-10-21T00:00:00Z",
  toolVersion: "0.1.3",
  case: intent,
};
const results: BaselineResult[] = [
  {
    id: "empty",
    frame: "Empty",
    frameId: "frame",
    file: "empty.png",
    status: "same",
    written: false,
    approved: provenance,
    captured: provenance,
    imageWidth: 1,
    imageHeight: 1,
  },
];
const mapping = {
  schemaVersion: 1 as const,
  cases: [
    {
      id: "empty",
      setup: "dark-empty",
    },
  ],
};
const evidence: ProviderEvidence = {
  schemaVersion: 1,
  id: "empty",
  route: "/dashboard",
  setup: "dark-empty",
  observed: {
    viewport: intent.viewport,
    theme: intent.theme,
    state: intent.state,
    fixture: intent.fixture,
  },
  fonts: intent.fonts,
  fontsReady: true,
  baselineHash: hash,
  screenshot: "implementation.png",
  diffPixelRatio: 0,
  provider: {
    name: "offline-stub",
    version: "1",
  },
};
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "penpair-reflection-"));
  await mkdir(path.join(root, "design"));
  await writeFile(path.join(root, "design/empty.png"), png);
  await writeFile(path.join(root, "implementation.png"), png);
  return root;
}
describe("explicit implementation-case bridge", () => {
  it("keeps missing setup and changed approval metadata pending", () => {
    expect(
      planImplementationCases(config, results, {
        ...mapping,
        cases: [],
      }),
    ).toMatchObject({
      complete: false,
      cases: [],
      pending: [
        {
          id: "empty",
        },
      ],
    });
    const changed = structuredClone(config);
    changed.frames[0]!.case!.theme = "light";
    expect(planImplementationCases(changed, results, mapping).complete).toBe(false);
  });
  it("keeps forced references out of approved comparison plans", () => {
    const waived = structuredClone(results);
    (waived[0]!.approved as ArtifactProvenance).approval = {
      kind: "forced-reference",
      reason: "experiment",
    };
    expect(planImplementationCases(config, waived, mapping)).toMatchObject({
      complete: false,
      cases: [],
    });
  });
  it("validates independent byte evidence and exact observed setup without creating a visual approval", async () => {
    const root = await fixture();
    const plan = planImplementationCases(config, results, mapping);
    expect(
      await runImplementationCases(root, plan, {
        runCase: async () => evidence,
      }),
    ).toMatchObject({
      complete: true,
      cases: [
        {
          withinThreshold: true,
        },
      ],
      visualApproval: false,
      verdict: "owner-review-required",
    });
    expect(
      await runImplementationCases(root, plan, {
        runCase: async () => ({
          ...evidence,
          observed: {
            ...evidence.observed,
            theme: "light",
          },
        }),
      }),
    ).toMatchObject({
      complete: false,
    });
    expect(
      await runImplementationCases(root, plan, {
        runCase: async () => ({
          ...evidence,
          fonts: [],
        }),
      }),
    ).toMatchObject({
      complete: false,
    });
    expect(
      await runImplementationCases(root, plan, {
        runCase: async () => ({
          ...evidence,
          screenshot: "design/empty.png",
        }),
      }),
    ).toMatchObject({
      complete: false,
    });
    await writeFile(path.join(root, "design/empty.png"), Buffer.from("changed"));
    expect(
      await runImplementationCases(root, plan, {
        runCase: async () => evidence,
      }),
    ).toMatchObject({
      complete: false,
    });
  });
  it("runs the actual adapter command with a trusted stub provider and the existing baseline manifest", async () => {
    const root = await fixture();
    await writeFile(
      path.join(root, "penpair.config.json"),
      JSON.stringify({
        instance: "trial",
        file: {
          id: "file",
        },
        profile: {
          type: "external",
          origin: "https://design.penpot.app",
        },
        baselines: config,
      }),
    );
    await writeFile(
      path.join(root, "design/penpair-baselines.json"),
      JSON.stringify({
        schemaVersion: 2,
        fileId: "file",
        frames: results,
      }),
    );
    await writeFile(path.join(root, "mapping.json"), JSON.stringify(mapping));
    await writeFile(
      path.join(root, "provider.mjs"),
      `export async function runCase() { return ${JSON.stringify(evidence)}; }`,
    );
    let result: unknown;
    const context: AdapterContext = {
      root,
      config: await loadConfig(root),
      rawConfig: {},
      log() {},
      output: {
        log() {},
        error() {},
        result(v) {
          result = v;
        },
      },
      withPenpot() {
        throw new Error("No Penpot connection for browser comparison");
      },
    };
    expect(
      await adapter.commands[0]!.run(context, [
        "check",
        "--map",
        "mapping.json",
        "--provider",
        "provider.mjs",
      ]),
    ).toBe(0);
    expect(result).toMatchObject({
      complete: true,
      visualApproval: false,
    });
  });
});

it("retains legacy providers and validates optional browser capture metadata independently", async () => {
  const root = await fixture();
  const plan = planImplementationCases(config, results, mapping);
  const capture = {
    schemaVersion: 1 as const,
    root: "#capture",
    rootBox: {
      x: 0.25,
      y: 0.25,
      width: 0.5,
      height: 0.5,
    },
    clip: {
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    },
    rounding: "outward-css-pixels" as const,
    deviceScaleFactor: 1,
    browser: {
      name: "chromium",
      version: "fixture",
    },
    fonts: [
      {
        family: "Test Sans",
        weight: "400",
        style: "normal",
        status: "loaded" as const,
      },
    ],
    pointer: {
      x: -10,
      y: -10,
      outsideRoot: true,
      hoveredControls: 0,
    },
    scroll: {
      x: 0,
      y: 0,
    },
    layoutSamples: 3,
    occlusion: {
      samples: 5,
      blocked: 0,
    },
  };
  expect(
    (
      await runImplementationCases(root, plan, {
        runCase: async () => ({
          ...evidence,
          capture,
        }),
      })
    ).complete,
  ).toBe(true);
  for (const invalid of [
    {
      ...capture,
      deviceScaleFactor: 2,
    },
    {
      ...capture,
      clip: {
        ...capture.clip,
        width: 2,
      },
    },
    {
      ...capture,
      pointer: {
        ...capture.pointer,
        hoveredControls: 1,
      },
    },
    {
      ...capture,
      fonts: [],
    },
    {
      ...capture,
      occlusion: {
        samples: 5,
        blocked: 1,
      },
    },
  ]) {
    expect(
      (
        await runImplementationCases(root, plan, {
          runCase: async () => ({
            ...evidence,
            capture: invalid,
          }),
        })
      ).complete,
    ).toBe(false);
  }
  expect(
    (
      await runImplementationCases(root, plan, {
        runCase: async () => ({
          ...evidence,
          provider: {
            name: "penpair-browser-starter-rgba-exact",
            version: "1",
          },
        }),
      })
    ).complete,
  ).toBe(false);
});
