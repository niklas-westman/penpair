import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { approvalFingerprint } from "../src/approvals.js";
import { observationHash } from "../src/journal.js";
import type { InspectionCapture } from "../src/inspection.js";
import { hashBytes, saveArtifact } from "../src/design-releases/artifact-paths.js";
import { decodedPixels, inspectionContentHash } from "../src/design-releases/fidelity.js";
import {
  validateMemberApproval,
  checkRetainedEvidence,
} from "../src/design-releases/member-evidence.js";
import {
  overviewLinksSnippet,
  releaseOverviewTargets,
} from "../src/design-releases/overview-links.js";
import { compiles } from "../src/snippet.js";
import type {
  DesignRelease,
  ReleaseMember,
  ReleaseArtifactRef,
} from "../src/design-releases/types.js";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
  "base64",
);

function fixture() {
  const artifacts = new Map<string, Buffer>();
  const save = (name: string, value: unknown): ReleaseArtifactRef => {
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value));
    artifacts.set(name, bytes);
    return {
      path: name,
      sha256: hashBytes(bytes),
    };
  };
  const inspection = {
    schemaVersion: 1,
    kind: "shape-inspection",
    complete: true,
    reasons: [],
    fileId: "file",
    pageId: "old-page",
    revision: 1,
    nodes: [
      {
        id: "frame",
        type: "board",
        parentId: null,
        index: 0,
        childIds: [],
        childrenTotal: 0,
        unknowns: [],
        geometry: {
          x: 0,
          y: 0,
          width: 1,
          height: 1,
          rotation: 0,
          hidden: false,
          blocked: false,
          flipX: false,
          flipY: false,
          proportionLock: false,
        },
        text: null,
        layout: {
          showInViewMode: true,
          boardSizing: {
            horizontalSizing: null,
            verticalSizing: null,
          },
          constraints: {
            constraintsHorizontal: null,
            constraintsVertical: null,
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
      },
    ],
  } as unknown as InspectionCapture;
  const capture = {
    fileId: "file",
    pageId: "old-page",
    frameId: "frame",
    revision: 1,
    scale: 1,
  };
  const body = {
    schemaVersion: 1,
    kind: "owner-words",
    id: "approval",
    recordedAt: "2026-10-28T12:00:00Z",
    by: "Owner",
    note: "Approved this exact frame",
    capture,
    sha256: hashBytes(png),
    image: "original/approved.png",
    fingerprint: approvalFingerprint(capture, hashBytes(png)),
  };
  const record = {
    ...body,
    hash: observationHash(body),
  };
  const member: ReleaseMember = {
    id: "login",
    disposition: "adopted",
    source: {
      id: "login",
      label: "Login",
      pageId: "old-page",
      frameId: "frame",
      inspection: save("frozen/inspection.bin", inspection),
      render: save("frozen/render.bin", png),
      contentHash: inspectionContentHash(inspection),
    },
    approval: {
      record: save("frozen/record.bin", record),
      recordId: "approval",
      image: save("frozen/image.bin", png),
    },
  };
  const release = {
    schemaVersion: 2,
    fileId: "file",
    members: [
      member,
    ],
    sources: [],
    receipts: [],
    target: {
      pageId: "new-page",
      overviewFrameId: "overview",
      ownerKey: "owner",
    },
    contracts: [],
  } as unknown as DesignRelease;
  const artifact = async (reference: ReleaseArtifactRef): Promise<Buffer> => {
    const bytes = artifacts.get(reference.path);
    if (!bytes || hashBytes(bytes) !== reference.sha256) {
      throw new Error("Artifact hash mismatch");
    }
    return bytes;
  };
  return {
    artifacts,
    save,
    inspection,
    record,
    member,
    release,
    artifact,
  };
}

describe("retained release evidence", () => {
  it("validates original approval through immutable snapshot paths without rewriting its original image path", async () => {
    const { member, release, artifact } = fixture();
    await expect(
      validateMemberApproval(
        "",
        release,
        {
          ...member,
          disposition: "retained",
        },
        artifact,
      ),
    ).rejects.toThrow("original finalized source");
    await expect(validateMemberApproval("", release, member, artifact)).resolves.toBeUndefined();
  });

  it("requires the exact owner approval and rejects another source or changed approval words", async () => {
    const { member, release, artifact, save, record } = fixture();
    await expect(
      validateMemberApproval(
        "",
        release,
        {
          ...member,
          approval: undefined,
        },
        artifact,
      ),
    ).rejects.toThrow("original owner approval");
    await expect(
      validateMemberApproval(
        "",
        release,
        {
          ...member,
          source: {
            ...member.source,
            frameId: "another",
          },
        },
        artifact,
      ),
    ).rejects.toThrow("identity");
    member.approval!.record = save("changed-record", {
      ...record,
      note: "Different words",
    });
    await expect(validateMemberApproval("", release, member, artifact)).rejects.toThrow(
      "hash mismatch",
    );
  });

  it("keeps a later observation revision separate and detects changed descendant identities", async () => {
    const { member, release, artifact, save, inspection } = fixture();
    const observed = structuredClone(inspection);
    observed.revision = 9;
    const pixels = await decodedPixels(png);
    const evidence = {
      id: member.id,
      inspection: save("current-inspection", observed),
      render: save("current-render", png),
      contentHash: member.source.contentHash,
      decodedPixelsHash: pixels.hash,
      width: 1,
      height: 1,
    };
    await expect(
      checkRetainedEvidence("", release, member, evidence, artifact),
    ).resolves.toBeUndefined();
    expect(inspection.revision).toBe(1);
    observed.nodes![0]!.id = "replacement";
    evidence.inspection = save("changed-inspection", observed);
    await expect(checkRetainedEvidence("", release, member, evidence, artifact)).rejects.toThrow(
      "evidence changed",
    );
  });

  it("resolves retained sources without copy receipts and requires independent changed targets", () => {
    const { member, release } = fixture();
    expect(releaseOverviewTargets(release)).toEqual([
      {
        id: "login",
        label: "Login",
        disposition: "adopted",
        pageId: "old-page",
        frameId: "frame",
      },
    ]);
    release.members!.push({
      ...member,
      id: "new",
      disposition: "changed",
      source: {
        ...member.source,
        id: "new",
        frameId: "working-frame",
      },
    });
    release.sources = [
      release.members![1]!.source,
    ];
    expect(releaseOverviewTargets(release)).toHaveLength(1);
    expect(
      releaseOverviewTargets(release, [
        {
          sourceId: "new",
          targetFrameId: "new-copy",
        },
      ]),
    ).toHaveLength(2);
    expect(() =>
      releaseOverviewTargets(release, [
        {
          sourceId: "new",
          targetFrameId: "working-frame",
        },
      ]),
    ).toThrow("independent");
    expect(() =>
      releaseOverviewTargets(release, [
        {
          sourceId: "unknown",
          targetFrameId: "new-copy",
        },
      ]),
    ).toThrow("unknown");
  });
});

function navigationFixture() {
  let next = 0;
  class Shape {
    id = `shape-${++next}`;
    type = "text";
    children: Shape[] = [];
    interactions: Array<{
      trigger: string;
      action: {
        type: string;
        destination: Shape;
      };
    }> = [];
    data = new Map<string, string>();
    x = 0;
    y = 0;
    width = 1;
    height = 1;
    getSharedPluginData(namespace: string, key: string) {
      return this.data.get(`${namespace}:${key}`) || "";
    }
    setSharedPluginData(namespace: string, key: string, value: string) {
      this.data.set(`${namespace}:${key}`, value);
    }
    resize(width: number, height: number) {
      this.width = width;
      this.height = height;
    }
    addInteraction(
      trigger: string,
      action: {
        type: string;
        destination: Shape;
      },
    ) {
      this.interactions.push({
        trigger,
        action,
      });
    }
    removeInteraction(interaction: unknown) {
      this.interactions = this.interactions.filter((item) => item !== interaction);
    }
    appendChild(shape: Shape) {
      if (!this.children.includes(shape)) {
        this.children.push(shape);
      }
    }
    remove() {
      for (const page of pages) {
        page.root.children = page.root.children.filter((shape) => shape !== this);
        overview.children = overview.children.filter((shape) => shape !== this);
      }
    }
  }
  const destination = new Shape();
  destination.id = "frame";
  destination.type = "board";
  const overview = new Shape();
  overview.id = "overview";
  overview.type = "board";
  overview.setSharedPluginData("penpair", "release-overview", "owner");
  const createPage = (id: string, children: Shape[]) => ({
    id,
    root: new Shape(),
    getShapeById(frameId: string): Shape | undefined {
      return [
        ...children,
        ...this.root.children,
        ...overview.children,
      ].find((shape) => shape.id === frameId);
    },
  });
  const oldPage = createPage("old-page", [
    destination,
  ]);
  const newPage = createPage("new-page", [
    overview,
  ]);
  newPage.root.setSharedPluginData(
    "penpair",
    "design-release",
    JSON.stringify({
      status: "draft",
      ownerKey: "owner",
    }),
  );
  const pages = [
    oldPage,
    newPage,
  ];
  const penpot = {
    currentFile: {
      id: "file",
      pages,
    },
    fonts: {
      all: [
        {
          name: "Inter",
          variants: [
            {
              fontWeight: "400",
              fontStyle: "normal",
            },
          ],
          applyToText() {},
        },
      ],
    },
    async openPage() {},
    createText() {
      return new Shape();
    },
  };
  return {
    penpot,
    overview,
    destination,
  };
}

describe("native release overview navigation", () => {
  it("writes cross-page links idempotently and independently reads actual destinations", async () => {
    const { release } = fixture();
    const { penpot, overview, destination } = navigationFixture();
    const targets = releaseOverviewTargets(release);
    const write = overviewLinksSnippet(release, targets, true);
    expect(compiles(write.code)).toBeUndefined();
    const execute = (code: string) =>
      runInNewContext(`(async function(penpot){${code}})(penpot)`, {
        penpot,
      });
    expect(await execute(write.code)).toEqual({
      ok: true,
    });
    expect(await execute(write.code)).toEqual({
      ok: true,
    });
    expect(overview.children).toHaveLength(1);
    const read = await execute(overviewLinksSnippet(release, targets).code);
    expect(read.links[0]).toMatchObject({
      id: "login",
      pageId: "old-page",
      frameId: "frame",
      valid: true,
    });
    overview.children[0]!.interactions[0]!.action.destination = {
      ...destination,
      id: "wrong",
    } as typeof destination;
    const drift = await execute(overviewLinksSnippet(release, targets).code);
    expect(drift.links[0].valid).toBe(false);
  });

  it("rejects absent destinations before creating any link", async () => {
    const { release } = fixture();
    const { penpot, overview } = navigationFixture();
    const targets = releaseOverviewTargets(release).map((target) => ({
      ...target,
      frameId: "missing",
    }));
    const write = overviewLinksSnippet(release, targets, true);
    const result = await runInNewContext(`(async function(penpot){${write.code}})(penpot)`, {
      penpot,
    });
    expect(result.ok).toBe(false);
    expect(overview.children).toHaveLength(0);
  });
});

it("reuses immutable Unicode artifacts using byte budgets rather than character counts", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "release-unicode-"));
  try {
    const first = await saveArtifact(
      root,
      "evidence/overview.json",
      "Changed → retained — godkänd\n",
    );
    expect(
      await saveArtifact(root, "evidence/overview.json", "Changed → retained — godkänd\n"),
    ).toEqual(first);
  } finally {
    await rm(root, {
      recursive: true,
      force: true,
    });
  }
});
