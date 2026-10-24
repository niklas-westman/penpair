import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type { PenpotToolClient } from "../src/client.js";
import { runMapCommand } from "../src/design-commands/map-command.js";
import type { DesignCommandContext } from "../src/design-commands/context.js";
import { observationHash } from "../src/journal.js";
import * as native from "../src/map-penpot/index.js";
import * as exportModule from "../src/export.js";
import { mapOriginLabels, mapOriginLegend } from "../src/map-penpot/status-labels.js";
import type { NativeMapProjection } from "../src/map-penpot/types.js";
import {
  buildMapDrawingPlan,
  createMapProposal,
  hashMapContract,
  readArtifactReviews,
  writeMapProposal,
} from "../src/maps/index.js";
import type { MapContract } from "../src/maps/types.js";

const roots: string[] = [];
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY1cAAAAASUVORK5CYII=",
  "base64",
);

function contract(): MapContract {
  return {
    schemaVersion: 1,
    kind: "journey-map",
    id: "signup",
    title: "Sign up",
    goal: "Create an account",
    sources: [],
    nodes: [
      {
        id: "start",
        kind: "screen",
        label: "Start",
        origin: "proposed",
      },
    ],
    edges: [],
    requirements: [],
    findings: [],
  };
}

async function fixture(map = contract()) {
  const root = await mkdtemp(path.join(os.tmpdir(), "penpair-map-command-"));
  roots.push(root);
  await writeFile(path.join(root, "map.json"), JSON.stringify(map));
  const result = vi.fn();
  const connect = vi.fn();
  const client: PenpotToolClient = {
    async callTool(_name, args) {
      if (!String(args.code).includes("penpot.currentFile.id")) {
        throw new Error("Unexpected native execution");
      }
      return {
        isError: false,
        text: JSON.stringify({
          result: {
            ok: true,
            fileId: "file",
          },
        }),
      };
    },
    async close() {},
  };
  const context: DesignCommandContext = {
    root,
    output: {
      result,
      log: vi.fn(),
      error: vi.fn(),
    },
    redact: (text) => text,
    async withPenpot(work) {
      connect();
      return work(client);
    },
  };
  const run = (args: string[]) =>
    runMapCommand(
      "journey-map",
      [
        ...args,
        "--from",
        "map.json",
      ],
      context,
    );
  return {
    root,
    map,
    context,
    result,
    connect,
    run,
  };
}

function projection(
  map: MapContract,
  detailMaps?: Record<string, MapContract>,
): NativeMapProjection {
  const plan = buildMapDrawingPlan(map, detailMaps);
  const node = plan.nodes[0]!;
  const shapes: NativeMapProjection["shapes"] = [
    {
      shapeId: "card",
      logicalId: node.id,
      role: "node",
      label: null,
      content: null,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      appearance: {
        name: `${node.kind}: ${node.label}`,
      },
    },
    {
      shapeId: "label",
      logicalId: node.id,
      role: "label",
      label: node.label,
      content: null,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      appearance: {},
    },
    {
      shapeId: "title",
      logicalId: `${map.kind}:${map.id}`,
      role: "title",
      label: map.title,
      content: null,
      x: 0,
      y: 0,
      width: 100,
      height: 40,
      appearance: {},
    },
  ];
  shapes.push(
    {
      shapeId: "badge",
      logicalId: node.id,
      role: "badge",
      label: mapOriginLabels[node.origin],
      content: null,
      x: node.x,
      y: node.y + 8,
      width: 100,
      height: 20,
      appearance: {},
    },
    {
      shapeId: "legend",
      logicalId: `${map.kind}:${map.id}`,
      role: "legend",
      label: mapOriginLegend,
      content: null,
      x: 0,
      y: 0,
      width: 100,
      height: 20,
      appearance: {},
    },
  );
  if (node.detail) {
    shapes.find((shape) => shape.role === "label")!.label = `Details: ${node.label}`;
    for (const shape of shapes.filter((shape) =>
      [
        "node",
        "label",
        "badge",
      ].includes(shape.role),
    )) {
      shape.interactions = [
        {
          trigger: "click",
          type: "navigate-to",
          destinationId: node.detail.frameId,
          destinationPageId: node.detail.pageId,
          destinationMapHash: node.detail.contractHash!,
          destinationMapId: node.detail.mapId!,
        },
      ];
    }
  }
  const observed = {
    boardId: "board",
    boardBounds: {
      x: 0,
      y: 0,
      width: plan.width,
      height: plan.height,
    },
    contractHash: hashMapContract(map),
    shapes,
    conflicts: [],
  };
  return {
    schemaVersion: 1,
    kind: "native-map-projection",
    fileId: "file",
    pageId: "page",
    mapId: native.drawingFromPlan(plan).mapId,
    ...observed,
    fingerprint: observationHash(observed),
  };
}

function refreshedProjection(value: NativeMapProjection): NativeMapProjection {
  return {
    ...value,
    fingerprint: observationHash({
      boardId: value.boardId,
      boardBounds: value.boardBounds,
      contractHash: value.contractHash,
      shapes: value.shapes,
      conflicts: value.conflicts,
    }),
  };
}

function publication(map: MapContract) {
  return {
    projection: projection(map),
    report: {
      outcome: "verified" as const,
      operation: "publish-map",
      phase: "applied" as const,
      inspect: {},
      problems: [],
      verified: true,
    },
    image: {
      png,
      stable: true,
      exports: 2,
      capture: {
        fileId: "file",
        pageId: "page",
        frameId: "board",
        revision: 1,
        scale: 1,
        activeThemes: [],
        penpotApiVersion: "test",
        renderEnvironment: "test",
      },
    },
    visualReviewRequired: true,
  };
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    roots.splice(0).map((root) =>
      rm(root, {
        recursive: true,
        force: true,
      }),
    ),
  );
});

it("renders and checks offline without implicit files and requires explicit draft context", async () => {
  const f = await fixture();
  expect(
    await f.run([
      "render",
    ]),
  ).toBe(0);
  expect(f.result.mock.lastCall?.[0]).toMatchObject({
    markdown: expect.any(String),
    mermaid: expect.any(String),
    plan: {
      complete: true,
    },
  });
  expect(
    await f.run([
      "check",
    ]),
  ).toBe(3);
  await expect(
    f.run([
      "context",
    ]),
  ).rejects.toThrow(/Approved current map context/);
  expect(
    await f.run([
      "context",
      "--draft",
    ]),
  ).toBe(3);
  expect(f.result.mock.lastCall?.[0]).toMatchObject({
    reviewed: false,
    ready: false,
  });
  expect(await readdir(f.root)).toEqual([
    "map.json",
  ]);
  expect(f.connect).not.toHaveBeenCalled();
});

it("writes rendered files only with --out and prevents canonical output replacement", async () => {
  const f = await fixture();
  expect(
    await f.run([
      "render",
      "--out",
      "rendered",
    ]),
  ).toBe(0);
  expect(await readdir(path.join(f.root, "rendered"))).toEqual([
    "drawing-plan.json",
    "map.md",
    "map.mmd",
  ]);
  await expect(
    f.run([
      "context",
      "--draft",
      "--out",
      "map.json",
    ]),
  ).rejects.toThrow(/canonical contract/);
  await expect(
    f.run([
      "render",
      "--out",
      "../outside",
    ]),
  ).rejects.toThrow(/inside this project/);
  expect(JSON.parse(await readFile(path.join(f.root, "map.json"), "utf8"))).toEqual(f.map);
});

it("records supplied words against exact local evidence and detects changed review artifacts", async () => {
  const f = await fixture();
  expect(
    await f.run([
      "approve",
    ]),
  ).toBe(0);
  expect(await readdir(f.root)).toEqual([
    "map.json",
  ]);
  expect(
    await f.run([
      "approve",
      "--write",
      "--by",
      "Fixture owner",
      "--note",
      "I approve this exact map",
    ]),
  ).toBe(0);
  const reviews = await readArtifactReviews(f.root, "reviews.json");
  expect(reviews).toHaveLength(1);
  expect(reviews[0]).toMatchObject({
    by: "Fixture owner",
    note: "I approve this exact map",
    artifactHash: hashMapContract(f.map),
  });
  expect(
    await f.run([
      "context",
      "--out",
      "context.json",
    ]),
  ).toBe(0);
  expect(JSON.parse(await readFile(path.join(f.root, "context.json"), "utf8"))).toMatchObject({
    ready: true,
    reviewed: true,
    implementation: "not-assessed",
  });
  const renderArtifact = reviews[0]!.artifacts!.find((artifact) =>
    artifact.path.startsWith("map-evidence/"),
  )!;
  await writeFile(path.join(f.root, renderArtifact.path), "changed");
  await expect(
    f.run([
      "context",
    ]),
  ).rejects.toThrow(/evidence is invalid/);
  expect(f.connect).not.toHaveBeenCalled();
});

it("accepts only an explicit current-base proposal and leaves the new contract unapproved", async () => {
  const f = await fixture();
  await f.run([
    "approve",
    "--write",
    "--by",
    "Fixture owner",
    "--note",
    "Approve current revision",
  ]);
  await writeMapProposal(
    f.root,
    "proposal.json",
    createMapProposal(
      f.map,
      {
        ...f.map,
        title: "Revised sign up",
      },
      "Designer edits",
    ),
  );
  await expect(
    f.run([
      "accept",
      "--proposal",
      "proposal.json",
    ]),
  ).rejects.toThrow(/--write/);
  expect(
    await f.run([
      "accept",
      "--proposal",
      "proposal.json",
      "--write",
    ]),
  ).toBe(0);
  expect(JSON.parse(await readFile(path.join(f.root, "map.json"), "utf8"))).toMatchObject({
    title: "Revised sign up",
  });
  expect(
    await f.run([
      "check",
    ]),
  ).toBe(3);
  expect(await readArtifactReviews(f.root, "reviews.json")).toHaveLength(1);
  await expect(
    f.run([
      "accept",
      "--proposal",
      "proposal.json",
      "--write",
    ]),
  ).rejects.toThrow(/stale/);
});

it("rejects wrong families, malformed sources, irrelevant flags and missing approval words offline", async () => {
  const f = await fixture();
  await expect(
    runMapCommand(
      "integration-map",
      [
        "check",
        "--from",
        "map.json",
      ],
      f.context,
    ),
  ).rejects.toThrow(/cannot process/);
  for (const args of [
    [
      "check",
      "--apply",
    ],
    [
      "render",
      "--write",
    ],
    [
      "publish",
      "--page-id",
      "page",
      "--write",
    ],
    [
      "context",
      "--live",
    ],
    [
      "approve",
      "--write",
    ],
    [
      "approve",
      "--note",
      "invented",
    ],
  ]) {
    await expect(f.run(args)).rejects.toThrow();
  }
  await expect(
    runMapCommand(
      "journey-map",
      [
        "check",
      ],
      f.context,
    ),
  ).rejects.toThrow(/--from/);
  await writeFile(
    path.join(f.root, "map.json"),
    JSON.stringify({
      ...f.map,
      sources: [
        {
          id: "escape",
          kind: "code",
          path: "../outside",
          sha256: "a".repeat(64),
        },
      ],
    }),
  );
  await expect(
    f.run([
      "check",
    ]),
  ).rejects.toThrow(/inside the project/);
  expect(f.connect).not.toHaveBeenCalled();
});

it("keeps publication preview read-only and persists actual PNG evidence only after --apply", async () => {
  const f = await fixture();
  const published = publication(f.map);
  const publish = vi.spyOn(native, "publishMap").mockResolvedValue(published);
  expect(
    await f.run([
      "publish",
      "--page-id",
      "page",
    ]),
  ).toBe(0);
  expect(publish.mock.lastCall?.[3]).toMatchObject({
    apply: false,
    journal: {
      root: f.root,
    },
  });
  expect(await readdir(f.root)).toEqual([
    "map.json",
  ]);
  expect(f.result.mock.lastCall?.[0]).not.toHaveProperty("image");
  expect(
    await f.run([
      "publish",
      "--page-id",
      "page",
      "--apply",
    ]),
  ).toBe(0);
  expect(publish.mock.lastCall?.[3]).toMatchObject({
    apply: true,
    journal: {
      root: f.root,
    },
  });
  const report = f.result.mock.lastCall?.[0] as {
    image: {
      path: string;
      sha256: string;
    };
  };
  expect(await readFile(path.join(f.root, report.image.path))).toEqual(png);
  expect(report.image.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(JSON.parse(await readFile(path.join(f.root, "projection.json"), "utf8"))).toEqual(
    published.projection,
  );
  expect(
    await f.run([
      "approve",
      "--write",
      "--by",
      "Fixture owner",
      "--note",
      "Reviewed this native map image",
    ]),
  ).toBe(0);
  const reviews = await readArtifactReviews(f.root, "reviews.json");
  expect(reviews[0]!.artifacts!.map((artifact) => artifact.path)).toContain(report.image.path);
});

it("imports observed native edits as a proposal without replacing the canonical map", async () => {
  const f = await fixture();
  const saved = projection(f.map);
  const node = buildMapDrawingPlan(f.map).nodes[0]!;
  const shapes: NativeMapProjection["shapes"] = [
    {
      shapeId: "card",
      logicalId: "start",
      role: "node",
      label: null,
      content: null,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
    },
    {
      shapeId: "label",
      logicalId: "start",
      role: "label",
      label: "Changed by designer",
      content: null,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
    },
    {
      shapeId: "title",
      logicalId: saved.mapId,
      role: "title",
      label: f.map.title,
      content: null,
      x: 0,
      y: 0,
      width: 100,
      height: 40,
    },
  ];
  await writeFile(path.join(f.root, "projection.json"), JSON.stringify(saved));
  const observed = {
    ...saved,
    shapes,
    fingerprint: observationHash({
      boardId: saved.boardId,
      boardBounds: saved.boardBounds,
      contractHash: saved.contractHash,
      shapes,
      conflicts: [],
    }),
  };
  vi.spyOn(native, "readProjection").mockResolvedValue(observed);
  expect(
    await f.run([
      "import",
      "--board-id",
      "board",
      "--out",
      "proposal.json",
    ]),
  ).toBe(0);
  const proposal = JSON.parse(await readFile(path.join(f.root, "proposal.json"), "utf8"));
  expect(proposal).toMatchObject({
    kind: "map-proposal",
    baseHash: hashMapContract(f.map),
    proposedMap: {
      nodes: [
        {
          label: "Changed by designer",
          origin: "proposed",
        },
      ],
    },
  });
  expect(JSON.parse(await readFile(path.join(f.root, "map.json"), "utf8"))).toEqual(f.map);
  await expect(
    f.run([
      "import",
      "--board-id",
      "board",
      "--out",
      "map.json",
    ]),
  ).rejects.toThrow(/canonical contract/);
});

it("rejects stale source bytes and tampered projection evidence before connecting", async () => {
  const source = "original source";
  const f = await fixture({
    ...contract(),
    sources: [
      {
        id: "source",
        kind: "code",
        path: "source.txt",
        sha256: createHash("sha256").update(source).digest("hex"),
      },
    ],
  });
  await writeFile(path.join(f.root, "source.txt"), "changed source");
  expect(
    await f.run([
      "check",
    ]),
  ).toBe(3);
  expect(f.result.mock.lastCall?.[0]).toMatchObject({
    freshness: "stale",
  });
  await expect(
    f.run([
      "approve",
      "--write",
      "--by",
      "Owner",
      "--note",
      "Exact supplied words",
    ]),
  ).rejects.toThrow(/fresh declared sources/);
  await expect(
    f.run([
      "context",
      "--draft",
      "--out",
      "source.txt",
    ]),
  ).rejects.toThrow(/source evidence/);
  expect(await readFile(path.join(f.root, "source.txt"), "utf8")).toBe("changed source");
  const saved = projection(f.map);
  await writeFile(
    path.join(f.root, "projection.json"),
    JSON.stringify({
      ...saved,
      fingerprint: "a".repeat(64),
    }),
  );
  await expect(
    f.run([
      "publish",
      "--page-id",
      "page",
      "--apply",
    ]),
  ).rejects.toThrow(/fingerprint/);
  expect(f.connect).not.toHaveBeenCalled();
});

it("checks live projection drift without replacing the saved observation", async () => {
  const f = await fixture();
  const saved = projection(f.map);
  await writeFile(path.join(f.root, "projection.json"), JSON.stringify(saved));
  const inspect = vi.spyOn(native, "readProjection").mockResolvedValue({
    ...saved,
    fingerprint: "a".repeat(64),
  });
  expect(
    await f.run([
      "check",
      "--live",
    ]),
  ).toBe(3);
  expect(f.result.mock.lastCall?.[0]).toMatchObject({
    live: {
      matches: false,
    },
    ready: false,
  });
  expect(inspect).toHaveBeenCalledWith(
    expect.any(Object),
    {
      fileId: "file",
      pageId: "page",
      boardId: "board",
    },
    saved.mapId,
  );
  expect(JSON.parse(await readFile(path.join(f.root, "projection.json"), "utf8"))).toEqual(saved);
});

it("keeps oversized native drawings available to offline context and rendering", async () => {
  const map = contract();
  map.nodes = Array.from(
    {
      length: 1000,
    },
    (_, index) => ({
      id: `node-${index}`,
      kind: "screen",
      label: "A".repeat(1000),
      origin: "proposed" as const,
    }),
  );
  const f = await fixture(map);
  expect(buildMapDrawingPlan(map).complete).toBe(false);
  expect(
    await f.run([
      "render",
    ]),
  ).toBe(3);
  expect(f.result.mock.lastCall?.[0]).toMatchObject({
    plan: {
      complete: false,
    },
  });
  expect(
    await f.run([
      "context",
      "--draft",
    ]),
  ).toBe(3);
  expect(f.result.mock.lastCall?.[0]).toMatchObject({
    truncated: true,
    ready: false,
  });
  expect(f.connect).not.toHaveBeenCalled();
});

it("shows family and action help without --from or a connection", async () => {
  const f = await fixture();
  expect(
    await runMapCommand(
      "journey-map",
      [
        "--help",
      ],
      f.context,
    ),
  ).toBe(0);
  expect(
    await runMapCommand(
      "integration-map",
      [
        "publish",
        "--help",
      ],
      f.context,
    ),
  ).toBe(0);
  expect(f.context.output.log).toHaveBeenCalledWith(expect.stringContaining("--from FILE"));
  expect(f.connect).not.toHaveBeenCalled();
});

it("imports and explicitly adopts layout-only edits with fresh image evidence and preserved republish positions", async () => {
  const f = await fixture();
  await f.run([
    "approve",
    "--write",
    "--by",
    "Owner",
    "--note",
    "Reviewed canonical map",
  ]);
  const original = await readFile(path.join(f.root, "map.json"));
  const baseline = projection(f.map);
  await writeFile(path.join(f.root, "projection.json"), JSON.stringify(baseline));
  const moved = structuredClone(baseline);
  for (const shape of moved.shapes.filter((shape) => shape.logicalId === "start")) {
    shape.x += 24;
  }
  const observed = refreshedProjection(moved);
  vi.spyOn(native, "readProjection").mockResolvedValue(observed);
  const captured = vi
    .spyOn(exportModule, "exportShapePng")
    .mockResolvedValue(publication(f.map).image);
  expect(
    await f.run([
      "import",
      "--board-id",
      "board",
      "--out",
      "layout.json",
    ]),
  ).toBe(0);
  const proposal = JSON.parse(await readFile(path.join(f.root, "layout.json"), "utf8"));
  expect(proposal).toMatchObject({
    kind: "map-presentation-proposal",
    baseContractHash: hashMapContract(f.map),
    observedProjectionHash: observed.fingerprint,
  });
  expect(await readFile(path.join(f.root, "map.json"))).toEqual(original);
  expect(JSON.parse(await readFile(path.join(f.root, "projection.json"), "utf8"))).toEqual(
    baseline,
  );
  await expect(
    f.run([
      "accept",
      "--proposal",
      "layout.json",
    ]),
  ).rejects.toThrow(/--write/);
  expect(
    await f.run([
      "accept",
      "--proposal",
      "layout.json",
      "--write",
    ]),
  ).toBe(0);
  expect(f.result.mock.lastCall?.[0]).toMatchObject({
    canonicalChanged: false,
    reviewed: false,
    visualReviewRequired: true,
  });
  expect(captured).toHaveBeenCalledWith(expect.any(Object), "board", {
    stable: true,
  });
  expect(await readFile(path.join(f.root, "map.json"))).toEqual(original);
  expect(JSON.parse(await readFile(path.join(f.root, "projection.json"), "utf8"))).toEqual(
    observed,
  );
  const evidence = JSON.parse(
    await readFile(path.join(f.root, "projection.json.evidence.json"), "utf8"),
  );
  expect(evidence.projectionHash).toBe(observed.fingerprint);
  expect(await readFile(path.join(f.root, evidence.image.path))).toEqual(png);
  expect(
    await f.run([
      "check",
    ]),
  ).toBe(3);
  const publish = vi.spyOn(native, "publishMap").mockResolvedValue({
    ...publication(f.map),
    projection: observed,
  });
  expect(
    await f.run([
      "publish",
      "--page-id",
      "page",
    ]),
  ).toBe(0);
  expect(publish.mock.lastCall?.[2].nodes[0]?.x).toBe(
    observed.shapes.find((shape) => shape.role === "node")!.x,
  );
  expect(publish.mock.lastCall?.[3]).toMatchObject({
    expected: {
      fingerprint: observed.fingerprint,
    },
    apply: false,
  });
});

it("refuses a stale native presentation before exporting or adopting its snapshot", async () => {
  const f = await fixture();
  const baseline = projection(f.map);
  await writeFile(path.join(f.root, "projection.json"), JSON.stringify(baseline));
  const moved = structuredClone(baseline);
  moved.shapes[0]!.x += 10;
  const observed = refreshedProjection(moved);
  const inspect = vi.spyOn(native, "readProjection").mockResolvedValue(observed);
  const captured = vi
    .spyOn(exportModule, "exportShapePng")
    .mockResolvedValue(publication(f.map).image);
  await f.run([
    "import",
    "--board-id",
    "board",
    "--out",
    "layout.json",
  ]);
  const changed = structuredClone(observed);
  changed.shapes[0]!.x += 10;
  inspect.mockResolvedValue(refreshedProjection(changed));
  await expect(
    f.run([
      "accept",
      "--proposal",
      "layout.json",
      "--write",
    ]),
  ).rejects.toThrow(/changed after import/);
  expect(captured).not.toHaveBeenCalled();
  expect(JSON.parse(await readFile(path.join(f.root, "projection.json"), "utf8"))).toEqual(
    baseline,
  );
  expect(JSON.parse(await readFile(path.join(f.root, "map.json"), "utf8"))).toEqual(f.map);
});

it("accepts native semantic edits only against their bound observation and adopts the baseline for republish", async () => {
  const f = await fixture();
  const baseline = projection(f.map);
  await writeFile(path.join(f.root, "projection.json"), JSON.stringify(baseline));
  const edited = structuredClone(baseline);
  edited.shapes.find((shape) => shape.role === "label")!.label = "Edited by designer";
  const observed = refreshedProjection(edited);
  const inspect = vi.spyOn(native, "readProjection").mockResolvedValue(observed);
  await f.run([
    "import",
    "--board-id",
    "board",
    "--out",
    "proposal.json",
  ]);
  const proposal = JSON.parse(await readFile(path.join(f.root, "proposal.json"), "utf8"));
  const companion = JSON.parse(
    await readFile(path.join(f.root, "proposal.json.native.json"), "utf8"),
  );
  expect(companion).toMatchObject({
    proposalHash: proposal.hash,
    baselineFingerprint: baseline.fingerprint,
  });
  inspect.mockResolvedValue(baseline);
  await expect(
    f.run([
      "accept",
      "--proposal",
      "proposal.json",
      "--write",
    ]),
  ).rejects.toThrow(/changed after import/);
  expect(JSON.parse(await readFile(path.join(f.root, "map.json"), "utf8"))).toEqual(f.map);
  inspect.mockResolvedValue(observed);
  expect(
    await f.run([
      "accept",
      "--proposal",
      "proposal.json",
      "--write",
    ]),
  ).toBe(0);
  expect(f.result.mock.lastCall?.[0]).toMatchObject({
    nativeBaselineAdopted: true,
    reviewed: false,
    nativePublicationRequired: true,
  });
  expect(JSON.parse(await readFile(path.join(f.root, "projection.json"), "utf8"))).toEqual(
    observed,
  );
  const accepted = JSON.parse(await readFile(path.join(f.root, "map.json"), "utf8"));
  expect(accepted.nodes[0].label).toBe("Edited by designer");
  const publish = vi.spyOn(native, "publishMap").mockResolvedValue(publication(accepted));
  expect(
    await f.run([
      "publish",
      "--page-id",
      "page",
    ]),
  ).toBe(0);
  expect(publish.mock.lastCall?.[3]).toMatchObject({
    expected: {
      fingerprint: observed.fingerprint,
    },
  });
  expect(publish.mock.lastCall?.[2].contractHash).toBe(hashMapContract(accepted));
  expect(
    await f.run([
      "accept",
      "--proposal",
      "proposal.json",
      "--write",
    ]),
  ).toBe(0);
  expect(f.result.mock.lastCall?.[0]).toMatchObject({
    recovered: true,
  });
});

it("resolves explicit detail maps for plans and native adoption without inferring child approval", async () => {
  const child: MapContract = {
    ...contract(),
    id: "signup-detail",
    requirements: [
      {
        id: "r1",
        text: "Sign up",
        origin: "proposed",
      },
    ],
    nodes: [
      {
        id: "start",
        label: "Detail start",
        kind: "screen",
        origin: "proposed",
        requirementIds: [
          "r1",
        ],
      },
    ],
  };
  const childBytes = JSON.stringify(child);
  const map: MapContract = {
    ...contract(),
    requirements: [
      {
        id: "r1",
        text: "Sign up",
        origin: "proposed",
      },
    ],
    sources: [
      {
        id: "detail",
        kind: "contract",
        path: "child.json",
        sha256: createHash("sha256").update(childBytes).digest("hex"),
        fileId: "file",
        pageId: "detail-page",
        frameId: "detail-board",
      },
    ],
    nodes: [
      {
        id: "start",
        label: "Signup details",
        kind: "detail-link",
        origin: "proposed",
        requirementIds: [
          "r1",
        ],
        sourceIds: [
          "detail",
        ],
      },
    ],
  };
  const f = await fixture(map);
  await writeFile(path.join(f.root, "child.json"), childBytes);
  expect(
    await f.run([
      "render",
    ]),
  ).toBe(0);
  expect(f.result.mock.lastCall?.[0]).toMatchObject({
    plan: {
      complete: true,
      nodes: [
        {
          detail: {
            mapId: "journey-map:signup-detail",
            contractHash: hashMapContract(child),
            frameId: "detail-board",
          },
        },
      ],
    },
  });
  await f.run([
    "approve",
    "--write",
    "--by",
    "Owner",
    "--note",
    "Approve only parent map",
  ]);
  expect(
    await f.run([
      "context",
      "--draft",
    ]),
  ).toBe(3);
  expect(f.result.mock.lastCall?.[0]).toMatchObject({
    reviewed: true,
    ready: false,
    details: [
      {
        path: "child.json",
        ready: false,
        review: "separate-artifact",
        contents: "not-inlined",
      },
    ],
  });
  const baseline = projection(map, {
    detail: child,
  });
  await writeFile(path.join(f.root, "projection.json"), JSON.stringify(baseline));
  const moved = structuredClone(baseline);
  moved.shapes[0]!.x += 12;
  const observed = refreshedProjection(moved);
  vi.spyOn(native, "readProjection").mockResolvedValue(observed);
  vi.spyOn(exportModule, "exportShapePng").mockResolvedValue(publication(contract()).image);
  expect(
    await f.run([
      "import",
      "--board-id",
      "board",
      "--out",
      "layout.json",
    ]),
  ).toBe(0);
  expect(JSON.parse(await readFile(path.join(f.root, "layout.json"), "utf8"))).toMatchObject({
    kind: "map-presentation-proposal",
  });
  expect(
    await f.run([
      "accept",
      "--proposal",
      "layout.json",
      "--write",
    ]),
  ).toBe(0);
  expect(f.result.mock.lastCall?.[0]).toMatchObject({
    canonicalChanged: false,
  });
  expect(JSON.parse(await readFile(path.join(f.root, "map.json"), "utf8"))).toEqual(map);
});

it("makes one-level parent context ready only after independent child review and invalidates changed child bytes", async () => {
  const child: MapContract = {
    ...contract(),
    id: "detail",
    requirements: [
      {
        id: "r1",
        text: "Signup",
        origin: "proposed",
      },
    ],
    nodes: [
      {
        ...contract().nodes[0]!,
        requirementIds: [
          "r1",
        ],
      },
    ],
  };
  const childBytes = JSON.stringify(child);
  const map: MapContract = {
    ...contract(),
    sources: [
      {
        id: "detail-source",
        kind: "contract",
        path: "child/map.json",
        sha256: createHash("sha256").update(childBytes).digest("hex"),
        fileId: "file",
        pageId: "child-page",
        frameId: "child-board",
      },
    ],
    requirements: child.requirements,
    nodes: [
      {
        id: "detail-link",
        kind: "detail-link",
        label: "Signup details",
        origin: "proposed",
        requirementIds: [
          "r1",
        ],
        sourceIds: [
          "detail-source",
        ],
      },
    ],
  };
  const f = await fixture(map);
  await mkdir(path.join(f.root, "child"));
  await writeFile(path.join(f.root, "child/map.json"), childBytes);
  await f.run([
    "approve",
    "--write",
    "--by",
    "Parent owner",
    "--note",
    "Approve parent only",
  ]);
  expect(
    await f.run([
      "context",
      "--draft",
    ]),
  ).toBe(3);
  expect(f.result.mock.lastCall?.[0]).toMatchObject({
    reviewed: true,
    ready: false,
    details: [
      {
        ready: false,
      },
    ],
  });
  expect(
    await runMapCommand(
      "journey-map",
      [
        "approve",
        "--from",
        "child/map.json",
        "--write",
        "--by",
        "Child owner",
        "--note",
        "Independently approve child",
      ],
      f.context,
    ),
  ).toBe(0);
  expect(
    await f.run([
      "context",
    ]),
  ).toBe(0);
  expect(f.result.mock.lastCall?.[0]).toMatchObject({
    reviewed: true,
    ready: true,
    details: [
      {
        path: "child/map.json",
        ready: true,
        review: "separate-artifact",
      },
    ],
  });
  await writeFile(
    path.join(f.root, "child/map.json"),
    JSON.stringify({
      ...child,
      title: "Changed child",
    }),
  );
  expect(
    await f.run([
      "check",
    ]),
  ).toBe(3);
  expect(f.result.mock.lastCall?.[0]).toMatchObject({
    ready: false,
    freshness: "stale",
    details: [
      {
        ready: false,
      },
    ],
  });
  expect(f.connect).not.toHaveBeenCalled();
});

it("stops at nested child links and hands off to finalized release context", async () => {
  const child: MapContract = {
    ...contract(),
    id: "nested-child",
    requirements: [
      {
        id: "r1",
        text: "Signup",
        origin: "proposed",
      },
    ],
    sources: [
      {
        id: "grandchild",
        kind: "contract",
        path: "not-read.json",
        sha256: "a".repeat(64),
        fileId: "file",
        pageId: "grandchild-page",
        frameId: "grandchild-board",
      },
    ],
    nodes: [
      {
        id: "nested",
        kind: "detail-link",
        label: "Nested detail",
        origin: "proposed",
        requirementIds: [
          "r1",
        ],
        sourceIds: [
          "grandchild",
        ],
      },
    ],
  };
  const childBytes = JSON.stringify(child);
  const f = await fixture({
    ...contract(),
    requirements: child.requirements,
    sources: [
      {
        id: "child",
        kind: "contract",
        path: "child.json",
        sha256: createHash("sha256").update(childBytes).digest("hex"),
        fileId: "file",
        pageId: "child-page",
        frameId: "child-board",
      },
    ],
    nodes: [
      {
        id: "detail",
        kind: "detail-link",
        label: "Child",
        origin: "proposed",
        requirementIds: [
          "r1",
        ],
        sourceIds: [
          "child",
        ],
      },
    ],
  });
  await writeFile(path.join(f.root, "child.json"), childBytes);
  await f.run([
    "approve",
    "--write",
    "--by",
    "Owner",
    "--note",
    "Approve parent only",
  ]);
  expect(
    await f.run([
      "context",
      "--draft",
    ]),
  ).toBe(3);
  expect(f.result.mock.lastCall?.[0]).toMatchObject({
    ready: false,
    reasons: expect.arrayContaining([
      expect.stringContaining("use finalized design-release context"),
    ]),
  });
  expect(f.connect).not.toHaveBeenCalled();
});

it("resumes an interrupted publication with the original journal inputs and no duplicate native write", async () => {
  const f = await fixture();
  const runId = "map-render-recovery";
  let nativeWrites = 0;
  let ownedBoard = false;
  const publish = vi
    .spyOn(native, "publishMap")
    .mockImplementation(async (_client, _target, _drawing, options) => {
      if (!ownedBoard) {
        ownedBoard = true;
        nativeWrites++;
        throw Object.assign(new Error("Renderer failed after journaled native publication"), {
          runId,
        });
      }
      if (!options?.journal?.resume || options.journal.runId !== runId) {
        throw new Error("Existing map requires the original operation journal");
      }
      return publication(f.map);
    });
  await expect(
    f.run([
      "publish",
      "--page-id",
      "page",
      "--apply",
    ]),
  ).rejects.toMatchObject({
    runId,
  });
  expect(await readdir(f.root)).toEqual([
    "map.json",
  ]);
  await expect(
    f.run([
      "publish",
      "--page-id",
      "page",
      "--apply",
    ]),
  ).rejects.toThrow(/original operation journal/);
  const connections = f.connect.mock.calls.length;
  await expect(
    f.run([
      "publish",
      "--page-id",
      "page",
      "--resume",
      runId,
    ]),
  ).rejects.toThrow(/--apply/);
  expect(f.connect).toHaveBeenCalledTimes(connections);
  expect(
    await f.run([
      "publish",
      "--page-id",
      "page",
      "--apply",
      "--resume",
      runId,
    ]),
  ).toBe(0);
  expect(nativeWrites).toBe(1);
  expect(publish.mock.lastCall?.[1]).toEqual(publish.mock.calls[0]?.[1]);
  expect(publish.mock.lastCall?.[1]).not.toHaveProperty("boardId");
  expect(publish.mock.lastCall?.[2]).toEqual(publish.mock.calls[0]?.[2]);
  expect(publish.mock.lastCall?.[3]).toMatchObject({
    apply: true,
    journal: {
      root: f.root,
      runId,
      resume: true,
      redact: f.context.redact,
    },
  });
  expect(JSON.parse(await readFile(path.join(f.root, "projection.json"), "utf8"))).toEqual(
    projection(f.map),
  );
});
