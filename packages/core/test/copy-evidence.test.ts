import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type { InspectionCapture } from "../src/inspection.js";
import type { PenpotToolClient } from "../src/client.js";
import * as live from "../src/design-releases/live.js";
import * as exports from "../src/export.js";
import * as fidelity from "../src/design-releases/fidelity.js";
import {
  captureCopyEvidence,
  compareCopyEvidence,
  matchCopiedFrames,
  sourceEvidenceHash,
  type CopyFrameEvidence,
} from "../src/design-releases/copy-evidence.js";

const directories: string[] = [];

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await Promise.all(
    directories.splice(0).map((directory) =>
      rm(directory, {
        recursive: true,
        force: true,
      }),
    ),
  );
});

it("streams frame preparation while source capture is pending, then names the completed frame", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "penpair-copy-progress-"));
  directories.push(root);
  const source = evidence("a", "A named board");
  vi.spyOn(live, "captureReleaseScreen").mockResolvedValue(source.inspection);
  vi.spyOn(fidelity, "decodedPixels").mockResolvedValue(source.pixels);
  let release!: () => void;
  let entered!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  vi.spyOn(exports, "exportShapePng").mockImplementation(async () => {
    entered();
    await pending;
    return {
      stable: true,
      exports: 2,
      png: Buffer.from("fixture-png"),
      capture: {
        fileId: "file",
        pageId: "page",
        frameId: "a",
        revision: 2,
        scale: 1,
        activeThemes: [],
        penpotApiVersion: null,
        renderEnvironment: null,
      },
    };
  });
  vi.useFakeTimers();
  const events: import("../src/capture-progress.js").CaptureProgress[] = [];
  const capture = captureCopyEvidence(
    {} as PenpotToolClient,
    root,
    "file",
    "page",
    [
      "a",
    ],
    "evidence/source",
    undefined,
    {
      onProgress: (event) => events.push(event),
    },
  );
  await started;
  await vi.advanceTimersByTimeAsync(5000);
  expect(
    events.some(
      (event) =>
        event.phase === "prepare" &&
        event.status === "waiting" &&
        event.index === 1 &&
        event.total === 1,
    ),
  ).toBe(true);
  release();
  await capture;
  expect(events.at(-1)).toMatchObject({
    phase: "prepare",
    status: "completed",
    frame: "A named board",
    index: 1,
    total: 1,
    elapsedMs: 5000,
  });
  expect(vi.getTimerCount()).toBe(0);
});

function evidence(id: string, name = "Screen", x = 0, y = 0): CopyFrameEvidence {
  const geometry = (nodeX: number, nodeY: number) => ({
    x: nodeX,
    y: nodeY,
    width: 100,
    height: 80,
    rotation: 0,
    hidden: false,
    blocked: false,
    flipX: false,
    flipY: false,
    proportionLock: false,
  });
  const node = (
    type: string,
    nodeId: string,
    parentId: string | null,
    nodeName: string,
    nodeX: number,
    nodeY: number,
  ) => ({
    id: nodeId,
    name: nodeName,
    type,
    parentId,
    index: 0,
    childIds:
      type === "board"
        ? [
            `${id}-child`,
          ]
        : [],
    childrenTotal: type === "board" ? 1 : 0,
    unknowns: [],
    geometry: geometry(nodeX, nodeY),
    text: null,
    layout: {
      showInViewMode: true,
      boardSizing: {
        horizontalSizing: "fix",
        verticalSizing: "fix",
      },
      constraints: {
        constraintsHorizontal: type === "board" ? null : "left",
        constraintsVertical: type === "board" ? null : "top",
        fixedWhenScrolling: false,
      },
    },
    component: {
      isComponentInstance: false,
      isComponentCopyInstance: false,
      isComponentMainInstance: false,
      isComponentRoot: false,
    },
    tokens: {},
    style: {
      blur: null,
      backgroundBlur: null,
    },
    metadata: {
      interactions: [],
    },
  });
  const inspection: InspectionCapture = {
    schemaVersion: 1,
    kind: "shape-inspection",
    fileId: "file",
    pageId: "page",
    revision: 2,
    complete: true,
    counts: {
      visited: 2,
      returned: 2,
      unknownFields: 0,
    },
    reasons: [],
    producer: {
      name: "penpair",
      version: "test",
    },
    nodes: [
      node("board", id, null, name, x, y),
      node("rect", `${id}-child`, id, "Child", x + 10, y + 20),
    ],
    capturedAt: "2026-10-25T00:00:00Z",
    sha256: "fixture",
    metrics: {
      calls: 1,
      requestSnippetBytes: 1,
      responsePayloadBytes: 1,
      maxRequestSnippetBytes: 1,
      maxResponsePayloadBytes: 1,
      assembledBytes: 1,
      durationMs: 1,
    },
  };
  return {
    frameId: id,
    name,
    inspection,
    inspectionRef: {
      path: `${id}.json`,
      sha256: "fixture",
    },
    render: {
      path: `${id}.png`,
      sha256: "fixture",
    },
    pixels: {
      hash: "pixels",
      width: 100,
      height: 80,
    },
  };
}

it("matches translated native trees independently of candidate ordering and IDs", () => {
  const sources = [
    evidence("a", "A"),
    evidence("b", "B", 200, 0),
  ];
  const targets = [
    evidence("copied-b", "B", 600, 1000),
    evidence("copied-a", "A", 400, 1000),
  ];
  expect(matchCopiedFrames(sources, targets)).toEqual([
    {
      sourceFrameId: "a",
      targetFrameId: "copied-a",
    },
    {
      sourceFrameId: "b",
      targetFrameId: "copied-b",
    },
  ]);
});

it("does not match names alone when descendant geometry changed", () => {
  const target = evidence("copy", "Screen", 400, 1000);
  (target.inspection.nodes![1]!.geometry as Record<string, unknown>).width = 99;
  expect(() =>
    matchCopiedFrames(
      [
        evidence("source"),
      ],
      [
        target,
      ],
    ),
  ).toThrow(/missing, changed or ambiguous/);
});

it("rejects indistinguishable boards instead of guessing source-to-copy identity", () => {
  expect(() =>
    matchCopiedFrames(
      [
        evidence("a"),
        evidence("b"),
      ],
      [
        evidence("c"),
        evidence("d"),
      ],
    ),
  ).toThrow(/ambiguous/);
  expect(() =>
    matchCopiedFrames(
      [
        evidence("a"),
      ],
      [
        evidence("c"),
        evidence("d"),
      ],
    ),
  ).toThrow(/count/);
});

it("rejects incomplete and inconsistent native hierarchy before matching", () => {
  const target = evidence("target");
  target.inspection.nodes![1]!.parentId = "other";
  expect(() =>
    matchCopiedFrames(
      [
        evidence("a"),
      ],
      [
        target,
      ],
    ),
  ).toThrow(/hierarchy/);
  target.inspection.complete = false;
  expect(() =>
    matchCopiedFrames(
      [
        evidence("a"),
      ],
      [
        target,
      ],
    ),
  ).toThrow(/complete bounded/);
});

it("verifies supported content and returns every descendant's new ID", () => {
  const sources = [
    evidence("a"),
  ];
  const targets = [
    evidence("b", "Screen", 400, 1000),
  ];
  expect(compareCopyEvidence(sources, targets, matchCopiedFrames(sources, targets))).toEqual({
    nativeVerified: true,
    pixelsMatch: true,
    nodeMap: {
      a: "b",
      "a-child": "b-child",
    },
    problems: [],
  });
});

it("combines mappings before checking links between copied boards", () => {
  const sources = [
    evidence("a", "A"),
    evidence("b", "B"),
  ];
  const targets = [
    evidence("c", "A", 0, 1000),
    evidence("d", "B", 200, 1000),
  ];
  sources[0]!.inspection.nodes![0]!.metadata = {
    interactions: [
      {
        destination: "b",
      },
    ],
  };
  targets[0]!.inspection.nodes![0]!.metadata = {
    interactions: [
      {
        destination: "d",
      },
    ],
  };
  expect(
    compareCopyEvidence(sources, targets, matchCopiedFrames(sources, targets)).nativeVerified,
  ).toBe(true);
  targets[0]!.inspection.nodes![0]!.metadata = {
    interactions: [
      {
        destination: "external",
      },
    ],
  };
  expect(
    compareCopyEvidence(sources, targets, matchCopiedFrames(sources, targets)).nativeVerified,
  ).toBe(false);
});

it("retains pixel evidence but never claims unobservable component override fidelity", () => {
  const source = evidence("a");
  const target = evidence("b", "Screen", 0, 1000);
  source.inspection.nodes![1]!.component = {
    isComponentInstance: true,
  };
  target.inspection.nodes![1]!.component = {
    isComponentInstance: true,
  };
  const result = compareCopyEvidence(
    [
      source,
    ],
    [
      target,
    ],
    matchCopiedFrames(
      [
        source,
      ],
      [
        target,
      ],
    ),
  );
  expect(result).toMatchObject({
    nativeVerified: false,
    pixelsMatch: true,
    nodeMap: {
      a: "b",
      "a-child": "b-child",
    },
  });
  expect(result.problems.join(" ")).toContain("override fidelity");
});

it("checks descendant names even when pixels and semantic observations match", () => {
  const source = evidence("a");
  const target = evidence("b");
  target.inspection.nodes![1]!.name = "Renamed child";
  const result = compareCopyEvidence(
    [
      source,
    ],
    [
      target,
    ],
    [
      {
        sourceFrameId: "a",
        targetFrameId: "b",
      },
    ],
  );
  expect(result.nativeVerified).toBe(false);
  expect(result.problems.join(" ")).toContain("name");
});

it("reports a pixel mismatch separately from native structural fidelity", () => {
  const source = evidence("a");
  const target = evidence("b");
  target.pixels.hash = "different";
  const result = compareCopyEvidence(
    [
      source,
    ],
    [
      target,
    ],
    matchCopiedFrames(
      [
        source,
      ],
      [
        target,
      ],
    ),
  );
  expect(result).toMatchObject({
    nativeVerified: true,
    pixelsMatch: false,
  });
  expect(result.problems).toEqual([
    "Exported pixels differ for a",
  ]);
});

it("refuses duplicate, missing and overlapping copy identities", () => {
  const source = evidence("a");
  const target = evidence("b");
  expect(() =>
    compareCopyEvidence(
      [
        source,
      ],
      [
        target,
      ],
      [],
    ),
  ).toThrow(/complete/);
  expect(() =>
    compareCopyEvidence(
      [
        source,
      ],
      [
        target,
      ],
      [
        {
          sourceFrameId: "a",
          targetFrameId: "missing",
        },
      ],
    ),
  ).toThrow(/unknown/);
  expect(() =>
    compareCopyEvidence(
      [
        source,
      ],
      [
        source,
      ],
      [
        {
          sourceFrameId: "a",
          targetFrameId: "a",
        },
      ],
    ),
  ).toThrow(/original/);
  target.inspection.nodes![1]!.id = "a-child";
  target.inspection.nodes![0]!.childIds = [
    "a-child",
  ];
  expect(() =>
    compareCopyEvidence(
      [
        source,
      ],
      [
        target,
      ],
      [
        {
          sourceFrameId: "a",
          targetFrameId: "b",
        },
      ],
    ),
  ).toThrow(/identity/);
});

it("source preservation ignores transport metadata but detects source content changes", () => {
  const original = evidence("a");
  const observed = structuredClone(original);
  observed.inspection.revision++;
  observed.inspection.capturedAt = "later";
  observed.inspection.metrics.calls++;
  observed.inspection.sha256 = "other-envelope-hash";
  expect(
    sourceEvidenceHash([
      original,
    ]),
  ).toBe(
    sourceEvidenceHash([
      observed,
    ]),
  );
  observed.inspection.nodes![1]!.name = "Changed";
  expect(
    sourceEvidenceHash([
      original,
    ]),
  ).not.toBe(
    sourceEvidenceHash([
      observed,
    ]),
  );
});

it("captures immutable snapshots and independently identified stable renders", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "penpair-copy-evidence-"));
  directories.push(root);
  const source = evidence("a");
  vi.spyOn(live, "captureReleaseScreen").mockResolvedValue(source.inspection);
  const image = {
    capture: {
      fileId: "file",
      pageId: "page",
      frameId: "a",
      revision: 2,
      scale: 1,
      penpotApiVersion: null,
      renderEnvironment: null,
      activeThemes: [],
    },
    stable: true,
    exports: 2,
    png: Buffer.from("fixture-png"),
  };
  vi.spyOn(exports, "exportShapePng").mockResolvedValue(image);
  vi.spyOn(fidelity, "decodedPixels").mockResolvedValue(source.pixels);
  const client = {} as PenpotToolClient;
  const [captured] = await captureCopyEvidence(
    client,
    root,
    "file",
    "page",
    [
      "a",
    ],
    "evidence/source",
  );
  expect(captured).toMatchObject({
    frameId: "a",
    name: "Screen",
    pixels: source.pixels,
  });
  expect(JSON.parse(await readFile(path.join(root, captured!.inspectionRef.path), "utf8"))).toEqual(
    source.inspection,
  );
  expect(await readFile(path.join(root, captured!.render.path), "utf8")).toBe("fixture-png");
  expect(exports.exportShapePng).toHaveBeenCalledWith(client, "a", {
    stable: true,
  });
  vi.mocked(exports.exportShapePng).mockResolvedValue({
    ...image,
    capture: {
      ...image.capture,
      revision: 3,
    },
  });
  await expect(
    captureCopyEvidence(
      client,
      root,
      "file",
      "page",
      [
        "a",
      ],
      "evidence/changed",
    ),
  ).rejects.toThrow(/changed/);
});

async function captureFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "penpair-copy-pair-"));
  directories.push(root);
  const source = evidence("a");
  const image = {
    capture: {
      fileId: "file",
      pageId: "page",
      frameId: "a",
      revision: 3,
      scale: 1,
      penpotApiVersion: null,
      renderEnvironment: null,
      activeThemes: [],
    },
    stable: true,
    exports: 2,
    png: Buffer.from("stable-png"),
  };
  const inspection = vi.spyOn(live, "captureReleaseScreen").mockResolvedValue(source.inspection);
  const render = vi.spyOn(exports, "exportShapePng").mockResolvedValue(image);
  vi.spyOn(fidelity, "decodedPixels").mockResolvedValue(source.pixels);
  const capture = () =>
    captureCopyEvidence(
      {} as PenpotToolClient,
      root,
      "file",
      "page",
      [
        "a",
      ],
      "evidence/read-pair",
    );
  return {
    root,
    source,
    image,
    inspection,
    render,
    capture,
  };
}

it("recaptures both reads once after revision drift and persists only the consistent pair", async () => {
  const trial = await captureFixture();
  const second = structuredClone(trial.source.inspection);
  second.revision = 3;
  second.capturedAt = "second-capture";
  trial.inspection.mockResolvedValueOnce(trial.source.inspection).mockResolvedValueOnce(second);
  const [captured] = await trial.capture();
  expect(trial.inspection).toHaveBeenCalledTimes(2);
  expect(trial.render).toHaveBeenCalledTimes(2);
  expect(captured!.inspection).toEqual(second);
  expect(
    JSON.parse(await readFile(path.join(trial.root, captured!.inspectionRef.path), "utf8")),
  ).toEqual(second);
});

it("rejects continuous revision drift after two fresh read pairs without publishing evidence", async () => {
  const trial = await captureFixture();
  await expect(trial.capture()).rejects.toThrow(/both bounded/);
  expect(trial.inspection).toHaveBeenCalledTimes(2);
  expect(trial.render).toHaveBeenCalledTimes(2);
  await expect(
    readFile(path.join(trial.root, "evidence/read-pair/frame-0.json")),
  ).rejects.toMatchObject({
    code: "ENOENT",
  });
});

it.each([
  "fileId",
  "pageId",
  "frameId",
])("refuses changed %s without retrying the capture pair", async (key) => {
  const trial = await captureFixture();
  trial.render.mockResolvedValue({
    ...trial.image,
    capture: {
      ...trial.image.capture,
      [key]: "different",
    },
  });
  await expect(trial.capture()).rejects.toThrow(/identity/);
  expect(trial.inspection).toHaveBeenCalledOnce();
  expect(trial.render).toHaveBeenCalledOnce();
});

it("refuses an unstable render without retrying a revision-mismatched pair", async () => {
  const trial = await captureFixture();
  trial.render.mockResolvedValue({
    ...trial.image,
    stable: false,
  });
  await expect(trial.capture()).rejects.toThrow(/stable render/);
  expect(trial.inspection).toHaveBeenCalledOnce();
  expect(trial.render).toHaveBeenCalledOnce();
});
