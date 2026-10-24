import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it } from "vitest";
import type { PenpotToolClient } from "../src/client.js";
import {
  captureInspection,
  validateInspectionDocument,
  inspectionFields,
  type InspectionCapture,
} from "../src/inspection.js";
import { observationHash } from "../src/journal.js";
import { createArtifactReview } from "../src/maps/review.js";
import { hashMapContract } from "../src/maps/validation.js";
import type { MapContract } from "../src/maps/types.js";
import {
  planRelease,
  assembleRelease,
  verifyRelease,
  finalizeRelease,
  checkRelease,
  releaseContext,
  writeDesignRelease,
  readDesignRelease,
  releaseDesignHash,
  validateReleasePlan,
} from "../src/design-releases/index.js";
import {
  decodedPixels,
  deriveNodeMap,
  compareNativeCopy,
  inspectionContentHash,
} from "../src/design-releases/fidelity.js";
import { artifactPath } from "../src/design-releases/artifact-paths.js";
import {
  assembleReleaseSnippet,
  inspectReleaseSnippet,
  finalizeReleaseSnippet,
} from "../src/design-releases/snippets.js";
import { compiles } from "../src/snippet.js";
import { releaseContractGraph } from "../src/design-releases/contract-graph.js";
import { assertReleaseContracts } from "../src/design-releases/store.js";
import type {
  DesignReleasePlanInput,
  ReleaseArtifactRef,
  DesignRelease,
} from "../src/design-releases/types.js";

const directories: string[] = [];
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
  "base64",
);
const sha = (bytes: string | Buffer): string => createHash("sha256").update(bytes).digest("hex");

async function localRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "design-release-"));
  directories.push(root);
  return root;
}

async function save(root: string, file: string, value: unknown): Promise<ReleaseArtifactRef> {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value, null, 2) + "\n");
  await mkdir(path.dirname(path.join(root, file)), {
    recursive: true,
  });
  await writeFile(path.join(root, file), bytes);
  return {
    path: file,
    sha256: sha(bytes),
  };
}

function nativeFixture() {
  let next = 0;
  let revision = 1;
  let freshPages = false;
  let beforeCall: ((code: string) => void) | undefined;
  let afterCall: ((code: string) => void) | undefined;
  const metadata = new Map<string, string>();
  class Shape {
    id = `native-${++next}`;
    name = "Shape";
    parent: Shape | null = null;
    children: Shape[] = [];
    x = 0;
    y = 0;
    width = 1;
    height = 1;
    rotation = 0;
    flipX = false;
    flipY = false;
    proportionLock = false;
    constraintsHorizontal = "left";
    constraintsVertical = "top";
    fixedWhenScrolling = false;
    hidden = false;
    blocked = false;
    characters = "Hello";
    fontId = "font";
    fontFamily = "Inter";
    fontVariantId = "regular";
    fontSize = 16;
    fontWeight = "400";
    fontStyle = "normal";
    lineHeight = 1.2;
    letterSpacing = 0;
    growType = "auto-height";
    direction = "ltr";
    align = "left";
    verticalAlign = "top";
    textTransform = null;
    textDecoration = null;
    flex = null;
    grid = null;
    layoutChild = null;
    layoutCell = null;
    clipContent = false;
    showInViewMode = true;
    horizontalSizing: string | undefined = undefined;
    verticalSizing: string | undefined = undefined;
    tokens: Record<string, string> = {};
    fills: unknown[] = [];
    strokes: unknown[] = [];
    shadows: unknown[] = [];
    opacity = 1;
    blendMode = "normal";
    borderRadiusTopLeft = 0;
    borderRadiusTopRight = 0;
    borderRadiusBottomRight = 0;
    borderRadiusBottomLeft = 0;
    interactions: unknown[] = [];
    content = "";
    shared = new Map<string, string>();
    constructor(public type: string) {}
    appendChild(child: Shape): void {
      if (child.parent) {
        child.parent.children = child.parent.children.filter((item) => item !== child);
      }
      child.parent = this;
      this.children.push(child);
      revision++;
    }
    resize(width: number, height: number): void {
      this.width = width;
      this.height = height;
      revision++;
    }
    getSharedPluginData(namespace: string, key: string): string {
      return this.shared.get(`${namespace}:${key}`) ?? "";
    }
    setSharedPluginData(namespace: string, key: string, value: string): void {
      this.shared.set(`${namespace}:${key}`, value);
      revision++;
    }
    isComponentInstance(): boolean {
      return false;
    }
    isComponentMainInstance(): boolean {
      return false;
    }
    isComponentCopyInstance(): boolean {
      return false;
    }
    isComponentRoot(): boolean {
      return false;
    }
    component(): null {
      return null;
    }
    componentRefShape(): null {
      return null;
    }
    componentRoot(): null {
      return null;
    }
    componentHead(): null {
      return null;
    }
    addInteraction(trigger: string, action: unknown): unknown {
      const interaction = {
        trigger,
        action,
      };
      this.interactions.push(interaction);
      return interaction;
    }
    removeInteraction(interaction: unknown): void {
      this.interactions = this.interactions.filter((item) => item !== interaction);
    }
    remove(): void {
      if (this.parent) {
        this.parent.children = this.parent.children.filter((item) => item !== this);
      }
      revision++;
    }
    async export(): Promise<Uint8Array> {
      return Uint8Array.from(png);
    }
  }
  const pages: Array<{
    id: string;
    name: string;
    root: Shape;
    getShapeById: (id: string) => Shape | undefined;
  }> = [];
  const find = (root: Shape, id: string): Shape | undefined =>
    root.id === id ? root : root.children.map((child) => find(child, id)).find(Boolean);
  const addPage = (name: string) => {
    const root = new Shape("root");
    const page = {
      id: `page-${pages.length}`,
      name,
      root,
      getShapeById: (id: string) => find(root, id),
    };
    pages.push(page);
    return page;
  };
  let current = addPage("Sources");
  const create = (type: string) => {
    const shape = new Shape(type);
    current.root.appendChild(shape);
    return shape;
  };
  const file = {
    id: "file",
    get revn() {
      return revision;
    },
    get pages() {
      return freshPages
        ? pages.map((page) => ({
            ...page,
          }))
        : pages;
    },
    getSharedPluginData: (namespace: string, key: string) =>
      metadata.get(`${namespace}:${key}`) ?? "",
    setSharedPluginData: (namespace: string, key: string, value: string) => {
      metadata.set(`${namespace}:${key}`, value);
      revision++;
    },
  };
  const font = {
    name: "Inter",
    variants: [
      {
        fontWeight: "400",
        fontStyle: "normal",
      },
    ],
    applyToText: (shape: Shape) => {
      shape.fontFamily = "Inter";
    },
  };
  const penpot = {
    version: "test",
    currentFile: file,
    get currentPage() {
      return current;
    },
    library: {
      local: {
        tokens: {
          sets: [],
          themes: [],
        },
      },
    },
    fonts: {
      all: [
        font,
      ],
      findByName: (name: string) => (name === "Inter" ? font : undefined),
    },
    createPage: () => addPage("New page"),
    openPage: async (page: typeof current) => {
      current = page;
    },
    createBoard: () => create("board"),
    createRectangle: () => create("rect"),
    createPath: () => create("path"),
    createText: (value: string) => {
      const text = create("text");
      text.characters = value;
      return text;
    },
    waitForLayoutUpdate: async () => {},
  };
  const source = penpot.createBoard();
  source.name = "Source";
  const child = penpot.createText("Hello");
  source.appendChild(child);
  const client: PenpotToolClient = {
    async callTool(_name, args) {
      const code = String(args.code);
      beforeCall?.(code);
      const result = await runInNewContext(`(async()=>{${code}\n})()`, {
        penpot,
        console,
        Uint8Array,
        btoa: (value: string) => Buffer.from(value, "binary").toString("base64"),
      });
      afterCall?.(code);
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
  const copy = (original: Shape, parent: Shape): Shape => {
    const target = new Shape(original.type);
    for (const key of Object.keys(original)) {
      if (
        ![
          "id",
          "parent",
          "children",
          "shared",
        ].includes(key)
      ) {
        (target as unknown as Record<string, unknown>)[key] = structuredClone(
          (original as unknown as Record<string, unknown>)[key],
        );
      }
    }
    parent.appendChild(target);
    for (const descendant of original.children) {
      copy(descendant, target);
    }
    return target;
  };
  return {
    client,
    penpot,
    source,
    child,
    pages,
    Shape,
    copy,
    setFreshPages: (value: boolean) => {
      freshPages = value;
    },
    setBefore: (hook: typeof beforeCall) => {
      beforeCall = hook;
    },
    setAfter: (hook: typeof afterCall) => {
      afterCall = hook;
    },
  };
}

async function planned() {
  const root = await localRoot();
  const native = nativeFixture();
  const inspection = (await captureInspection(native.client, {
    page: "Sources",
    shapeId: native.source.id,
    fields: [
      ...inspectionFields,
    ],
  })) as InspectionCapture;
  const inspectionRef = await save(root, "inputs/screen.json", inspection);
  const render = await save(root, "inputs/screen.png", png);
  const route = await save(root, "inputs/route.json", {
    route: "/complete",
  });
  const base: MapContract = {
    schemaVersion: 1,
    kind: "journey-map",
    id: "journey",
    title: "Journey",
    goal: "Finish task",
    sources: [
      {
        id: "route",
        kind: "code",
        path: route.path,
        sha256: route.sha256,
      },
      {
        id: "screen",
        kind: "inspection",
        path: inspectionRef.path,
        sha256: inspectionRef.sha256,
      },
    ],
    nodes: [
      {
        id: "screen",
        kind: "screen",
        label: "Hello",
        origin: "observed",
        sourceIds: [
          "screen",
        ],
        requirementIds: [
          "requirement",
        ],
      },
    ],
    edges: [],
    requirements: [
      {
        id: "requirement",
        text: "Preserve the screen",
        origin: "owner-decision",
      },
    ],
    findings: [],
  };
  const journey = await save(root, "inputs/journey.json", base);
  const integration: MapContract = {
    ...base,
    kind: "integration-map",
    id: "integration",
    nodes: base.nodes.map((node) => ({
      ...node,
      kind: "route",
      label: "Route /complete uses success state",
    })),
    journey: {
      path: journey.path,
      sha256: hashMapContract(base),
    },
  };
  const integrationRef = await save(root, "inputs/integration.json", integration);
  const input: DesignReleasePlanInput = {
    schemaVersion: 1,
    kind: "design-release-plan",
    id: "release",
    title: "Product release",
    productVersion: "1.2.3",
    fileId: "file",
    screens: [
      {
        id: "screen",
        label: "Hello",
        pageId: native.pages[0]!.id,
        frameId: native.source.id,
        inspection: inspectionRef,
        render,
      },
    ],
    contracts: [
      {
        ...journey,
        review: createArtifactReview({
          artifactKind: "journey-map",
          artifactId: "journey",
          artifactHash: hashMapContract(base),
          by: "Owner",
          note: "Journey approved",
        }),
      },
      {
        ...integrationRef,
        review: createArtifactReview({
          artifactKind: "integration-map",
          artifactId: "integration",
          artifactHash: hashMapContract(integration),
          by: "Owner",
          note: "Integration approved",
        }),
      },
    ],
  };
  const release = await planRelease(root, input);
  return {
    root,
    native,
    input,
    release,
    inspection,
  };
}

const fast = {
  exportOptions: {
    layout: false as const,
    sleep: async () => {},
    attempts: 1,
  },
  apply: true,
};

async function verified() {
  const local = await planned();
  const assembled = await assembleRelease(local.native.client, local.root, local.release, {
    ...fast,
    runId: "assembly",
  });
  const page = local.native.pages.find((item) => item.id === assembled.target.pageId)!;
  const target = local.native.copy(local.native.source, page.root);
  const release = await verifyRelease(
    local.native.client,
    local.root,
    assembled,
    [
      {
        sourceId: "screen",
        targetFrameId: target.id,
      },
    ],
    fast,
  );
  return {
    ...local,
    assembled,
    target,
    verified: release,
  };
}

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((root) =>
      rm(root, {
        recursive: true,
        force: true,
      }),
    ),
  );
});

describe("design release fidelity", () => {
  it("accepts topology-derived independent native IDs and root translation", async () => {
    const local = await planned();
    const copied = structuredClone(local.inspection);
    const mapping: Record<string, string> = {};
    for (const node of copied.nodes!) {
      mapping[String(node.id)] = `copy-${node.id}`;
      node.id = mapping[String(node.id)];
    }
    for (const node of copied.nodes!) {
      node.parentId = node.parentId === null ? null : mapping[String(node.parentId)];
      node.childIds = (node.childIds as string[]).map((id) => mapping[id]);
      const geometry = node.geometry as Record<string, number>;
      geometry.x! += 100;
      geometry.y! += 200;
      node.name = "Renamed";
    }
    expect(Object.keys(deriveNodeMap(local.inspection, copied))).toHaveLength(2);
    expect(compareNativeCopy(local.inspection, copied, mapping).sourceHash).toBe(
      local.release.sources[0]!.contentHash,
    );
  });
  it("blocks unknown required fields and unobservable component overrides", async () => {
    const local = await planned();
    const unknown = structuredClone(local.inspection);
    unknown.nodes![0]!.unknowns = [
      "layout.grid",
    ];
    expect(() => inspectionContentHash(unknown)).toThrow("Unknown");
    const component = structuredClone(local.inspection);
    (component.nodes![0]!.component as Record<string, unknown>).isComponentInstance = true;
    expect(() => inspectionContentHash(component)).toThrow("override");
  });
  it("compares decoded PNG evidence and exact dimensions", async () => {
    expect(await decodedPixels(png)).toMatchObject({
      width: 1,
      height: 1,
    });
    const { default: sharp } = await import("sharp");
    const red = await sharp({
      create: {
        width: 1,
        height: 1,
        channels: 4,
        background: {
          r: 255,
          g: 0,
          b: 0,
          alpha: 1,
        },
      },
    })
      .png({
        compressionLevel: 0,
      })
      .toBuffer();
    const compressed = await sharp(red)
      .png({
        compressionLevel: 9,
      })
      .toBuffer();
    expect(sha(red)).not.toBe(sha(compressed));
    expect(await decodedPixels(red)).toEqual(await decodedPixels(compressed));
  });
});

describe("design release lifecycle", () => {
  it("plans bounded explicit product versions and preserves original sources through assembly", async () => {
    const local = await planned();
    expect(local.release.productVersion).toBe("1.2.3");
    const preview = await assembleRelease(local.native.client, local.root, local.release);
    expect(preview.status).toBe("planned");
    expect(local.native.pages).toHaveLength(1);
    const result = await assembleRelease(local.native.client, local.root, local.release, {
      ...fast,
      runId: "assembly",
    });
    expect(result.status).toBe("awaiting-copy");
    expect(result.maps).toHaveLength(2);
    expect(local.native.source.children[0]!.characters).toBe("Hello");
    expect(local.native.pages[0]!.root.children).toHaveLength(1);
    expect(compiles(assembleReleaseSnippet(local.release).code)).toBeUndefined();
    expect(compiles(inspectReleaseSnippet(local.release).code)).toBeUndefined();
    expect(
      compiles(finalizeReleaseSnippet(result, "a".repeat(64), "b".repeat(64)).code),
    ).toBeUndefined();
  });
  it("requires explicit nonduplicated receipt IDs and frozen source renders", async () => {
    const local = await verified();
    await expect(
      verifyRelease(
        local.native.client,
        local.root,
        local.assembled,
        [
          {
            sourceId: "screen",
            targetFrameId: local.native.source.id,
          },
        ],
        fast,
      ),
    ).rejects.toThrow("original source");
    await expect(
      verifyRelease(local.native.client, local.root, local.assembled, [], fast),
    ).rejects.toThrow("receipts");
    expect(local.verified.receipts[0]!.targetFrameId).toBe(local.target.id);
    expect(local.verified.fidelity?.nativeStructure).toBe(true);
  });
  it("refuses native content differences while the stub render remains identical", async () => {
    const local = await verified();
    local.target.children[0]!.characters = "Wrong";
    await expect(
      verifyRelease(
        local.native.client,
        local.root,
        local.assembled,
        [
          {
            sourceId: "screen",
            targetFrameId: local.target.id,
          },
        ],
        fast,
      ),
    ).rejects.toThrow("Native copy changed");
  });
  it("finalizes immutable evidence before remote marker and final pointer, with pending implementation", async () => {
    const local = await verified();
    const review = createArtifactReview({
      artifactKind: "design-release",
      artifactId: local.verified.id,
      artifactHash: releaseDesignHash(local.verified),
      by: "Owner",
      note: "These exact native screens and maps are approved",
    });
    const final = await finalizeRelease(local.native.client, local.root, local.verified, review, {
      ...fast,
      pointerPath: "design/releases/1.2.3/release.json",
    });
    expect(final.status).toBe("final");
    expect(
      (await readDesignRelease(local.root, "design/releases/1.2.3/release.json")).finalized?.bundle
        .sha256,
    ).toBe(final.finalized?.bundle.sha256);
    expect((await releaseContext(local.root, final)).implementation.status).toBe("not-assessed");
    await expect(
      writeDesignRelease(local.root, "design/releases/1.2.3/release.json", final),
    ).rejects.toThrow("finalized");
    local.target.name = "Harmless rename";
    expect((await checkRelease(local.native.client, local.root, final, fast)).valid).toBe(true);
    local.target.children[0]!.characters = "Drift";
    expect(
      (await checkRelease(local.native.client, local.root, final, fast)).reasons.join(" "),
    ).toMatch(/Native copy changed/);
  });
  it("rejects path escapes, symlinked evidence and unknown schema fields", async () => {
    const local = await planned();
    expect(() =>
      validateReleasePlan({
        ...local.input,
        surprise: true,
      }),
    ).toThrow("unsupported field");
    await expect(artifactPath(local.root, "../outside.json")).rejects.toThrow("project-relative");
    await symlink(path.join(local.root, "inputs"), path.join(local.root, "linked"));
    await expect(artifactPath(local.root, "linked/screen.json")).rejects.toThrow(
      "real directories",
    );
    const tooMany = {
      ...local.input,
      screens: Array.from(
        {
          length: 101,
        },
        (_, index) => ({
          ...local.input.screens[0]!,
          id: `s-${index}`,
          frameId: `f-${index}`,
        }),
      ),
    };
    await expect(planRelease(local.root, tooMany)).rejects.toThrow("100");
  });
});

function ownerReview(release: DesignRelease) {
  return createArtifactReview({
    artifactKind: "design-release",
    artifactId: release.id,
    artifactHash: releaseDesignHash(release),
    by: "Owner",
    note: "Approved exact native screens and maps",
  });
}

describe("design release interruption boundaries", () => {
  it("reconciles an interrupted first map without repeating native writes or requiring nonexistent later journals", async () => {
    const local = await planned();
    let failed = false;
    local.native.setAfter((code) => {
      if (
        !failed &&
        code.includes("const CFG =") &&
        code.includes("CFG.drawing.nodes") &&
        code.includes("root.resize(right,bottom)")
      ) {
        failed = true;
        throw new Error("Lost first map acknowledgment");
      }
    });
    await expect(
      assembleRelease(local.native.client, local.root, local.release, {
        ...fast,
        runId: "assembly-resume",
      }),
    ).rejects.toThrow();
    local.native.setAfter(undefined);
    const page = local.native.pages.find((item) => item.name === "release/1.2.3")!;
    const firstBoard = page.root.children.find((shape) =>
      shape.getSharedPluginData("penpair", "map").includes('"mapId":"journey-map:journey"'),
    )!;
    const result = await assembleRelease(local.native.client, local.root, local.release, {
      ...fast,
      runId: "assembly-resume",
      resume: true,
    });
    expect(result.maps).toHaveLength(2);
    expect(result.maps.find((map) => map.kind === "journey-map")?.boardId).toBe(firstBoard.id);
    expect(local.native.pages).toHaveLength(2);
  });

  it("rejects replaced descendant identities during stable export even when pixels and semantics match", async () => {
    const local = await verified();
    let replaced = false;
    local.native.setAfter((code) => {
      if (
        !replaced &&
        code.includes(`"id":"${local.target.id}"`) &&
        code.includes("await s.export")
      ) {
        replaced = true;
        local.target.children[0]!.id = "replacement-child";
      }
    });
    await expect(
      verifyRelease(
        local.native.client,
        local.root,
        local.assembled,
        [
          {
            sourceId: "screen",
            targetFrameId: local.target.id,
          },
        ],
        fast,
      ),
    ).rejects.toThrow("identities changed");
  });

  it("preserves draft pointer and resumes an already written marker after local final-pointer failure", async () => {
    const local = await verified();
    const pointer = "design/releases/1.2.3/release.json";
    await writeDesignRelease(local.root, pointer, local.verified);
    const lock = path.join(local.root, `${pointer}.write-lock`);
    await writeFile(lock, "another writer");
    await expect(
      finalizeRelease(
        local.native.client,
        local.root,
        local.verified,
        ownerReview(local.verified),
        {
          ...fast,
          pointerPath: pointer,
        },
      ),
    ).rejects.toThrow("another writer");
    expect((await readDesignRelease(local.root, pointer)).status).toBe("verified");
    const page = local.native.pages.find((item) => item.id === local.verified.target.pageId)!;
    expect(JSON.parse(page.root.getSharedPluginData("penpair", "design-release")).status).toBe(
      "released",
    );
    await rm(lock);
    const final = await finalizeRelease(
      local.native.client,
      local.root,
      local.verified,
      ownerReview(local.verified),
      {
        ...fast,
        pointerPath: pointer,
      },
    );
    expect(final.status).toBe("final");
    await expect(writeDesignRelease(local.root, pointer, local.verified)).rejects.toThrow(
      "finalized",
    );
  });

  it("pins the checked revision while preparing the immutable bundle", async () => {
    const local = await verified();
    let targets = 0;
    local.native.setBefore((code) => {
      if (code.includes("fileId: penpot.currentFile.id, revision: penpot.currentFile.revn")) {
        targets++;
        if (targets === 3) {
          local.target.children[0]!.characters = "Concurrent edit";
          local.target.resize(1, 1);
        }
      }
    });
    await expect(
      finalizeRelease(
        local.native.client,
        local.root,
        local.verified,
        ownerReview(local.verified),
        fast,
      ),
    ).rejects.toThrow("changed while preparing");
    const page = local.native.pages.find((item) => item.id === local.verified.target.pageId)!;
    expect(JSON.parse(page.root.getSharedPluginData("penpair", "design-release")).status).toBe(
      "draft",
    );
    await expect(
      readFile(path.join(local.root, "design/releases/1.2.3/release.json")),
    ).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("refuses a local final pointer after content changes immediately after the remote marker", async () => {
    const local = await verified();
    let changed = false;
    local.native.setAfter((code) => {
      if (!changed && code.includes('page.root.setSharedPluginData("penpair","design-release"')) {
        changed = true;
        local.target.children[0]!.characters = "Concurrent edit";
      }
    });
    await expect(
      finalizeRelease(
        local.native.client,
        local.root,
        local.verified,
        ownerReview(local.verified),
        fast,
      ),
    ).rejects.toThrow("after its remote marker");
    await expect(
      readFile(path.join(local.root, "design/releases/1.2.3/release.json")),
    ).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("independently reconstructs receipts and decodes saved pixel claims offline", async () => {
    const local = await verified();
    const changed = structuredClone(local.verified);
    changed.receipts[0]!.nodeMap[local.native.child.id] = "bogus-target";
    changed.fidelity!.receiptsHash = observationHash(changed.receipts);
    expect((await checkRelease(undefined, local.root, changed)).reasons.join(" ")).toMatch(
      /mapping changed/,
    );
    const pixels = structuredClone(local.verified);
    pixels.receipts[0]!.decodedPixelsHash = "0".repeat(64);
    pixels.fidelity!.receiptsHash = observationHash(pixels.receipts);
    expect((await checkRelease(undefined, local.root, pixels)).reasons.join(" ")).toMatch(
      /pixel fidelity/,
    );
  });

  it("rejects swapped immutable snapshot bytes even when a rewritten bundle hash matches the local pointer", async () => {
    const local = await verified();
    const final = await finalizeRelease(
      local.native.client,
      local.root,
      local.verified,
      ownerReview(local.verified),
      fast,
    );
    const bundle = JSON.parse(
      await readFile(path.join(local.root, final.finalized!.bundle.path), "utf8"),
    );
    const corrupted = await save(
      local.root,
      "tampered.bin",
      Buffer.from("different approved content"),
    );
    bundle.artifacts[0].snapshot = corrupted;
    const altered = await save(local.root, "tampered-bundle.json", bundle);
    const pointer = {
      ...final,
      finalized: {
        ...final.finalized!,
        bundle: altered,
        markerHash: altered.sha256,
      },
    };
    expect((await checkRelease(undefined, local.root, pointer)).reasons.join(" ")).toMatch(
      /original approved hash/,
    );
  });

  it("rejects known protected text before it can enter an operation journal or artifact", async () => {
    const local = await planned();
    const redact = (text: string) => text.replaceAll("Hello", "[protected]");
    await expect(
      planRelease(local.root, local.input, {
        redact,
      }),
    ).rejects.toThrow("Protected data");
    await expect(
      writeDesignRelease(local.root, "private.json", local.release, {
        redact,
      }),
    ).rejects.toThrow("protected data");
    await expect(readFile(path.join(local.root, "private.json"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});

describe("frozen release bundle validation", () => {
  it("validates corrupted existing immutable bundles before any released marker", async () => {
    const local = await verified();
    let targets = 0;
    local.native.setBefore((code) => {
      if (code.includes("fileId: penpot.currentFile.id, revision: penpot.currentFile.revn")) {
        targets++;
        if (targets === 3) {
          local.target.setSharedPluginData("test", "concurrent", "yes");
        }
      }
    });
    await expect(
      finalizeRelease(
        local.native.client,
        local.root,
        local.verified,
        ownerReview(local.verified),
        fast,
      ),
    ).rejects.toThrow("changed while preparing");
    local.native.setBefore(undefined);
    const bundlePath = path.join(local.root, "design/releases/1.2.3/approved/bundle.json");
    const bundle = JSON.parse(await readFile(bundlePath, "utf8"));
    bundle.artifacts[0].snapshot = await save(
      local.root,
      "unapproved.bin",
      Buffer.from("unapproved evidence"),
    );
    await writeFile(bundlePath, JSON.stringify(bundle, null, 2) + "\n");
    await expect(
      finalizeRelease(
        local.native.client,
        local.root,
        local.verified,
        ownerReview(local.verified),
        fast,
      ),
    ).rejects.toThrow("Immutable bundle is invalid");
    const page = local.native.pages.find((item) => item.id === local.verified.target.pageId)!;
    expect(JSON.parse(page.root.getSharedPluginData("penpair", "design-release")).status).toBe(
      "draft",
    );
  });

  it("requires frozen transitive contract sources and owner review artifacts", async () => {
    const local = await verified();
    const note = await save(local.root, "inputs/owner-evidence.json", {
      reviewed: "screen and map native exports",
    });
    const review = createArtifactReview({
      artifactKind: "design-release",
      artifactId: local.verified.id,
      artifactHash: releaseDesignHash(local.verified),
      by: "Owner",
      note: "Approved exact native screens and maps",
      artifacts: [
        note,
      ],
    });
    const final = await finalizeRelease(
      local.native.client,
      local.root,
      local.verified,
      review,
      fast,
    );
    for (const removed of [
      "inputs/route.json",
      note.path,
    ]) {
      const bundle = JSON.parse(
        await readFile(path.join(local.root, final.finalized!.bundle.path), "utf8"),
      );
      bundle.artifacts = bundle.artifacts.filter(
        (item: { original: ReleaseArtifactRef }) => item.original.path !== removed,
      );
      const ref = await save(local.root, `missing-${removed.split("/").at(-1)}.json`, bundle);
      const pointer = {
        ...final,
        finalized: {
          ...final.finalized!,
          bundle: ref,
          markerHash: ref.sha256,
        },
      };
      expect((await checkRelease(undefined, local.root, pointer)).valid).toBe(false);
    }
    await writeFile(path.join(local.root, "inputs/route.json"), "later implementation revision");
    await writeFile(path.join(local.root, "inputs/journey.json"), "a newer unapproved journey");
    await writeFile(
      path.join(local.root, "inputs/integration.json"),
      "a newer unapproved integration",
    );
    const context = await releaseContext(local.root, final);
    expect(context.ready).toBe(true);
    expect(
      context.mapContexts.find((map) => map.mapKind === "journey-map")?.requirements[0]?.text,
    ).toBe("Preserve the screen");
    expect(
      context.mapContexts.find((map) => map.mapKind === "integration-map")?.nodes[0]?.label,
    ).toBe("Route /complete uses success state");
    expect(context.nextActions.join(" ")).toMatch(/Implementation verification is not-assessed/);
  });
});

describe("SDK-native release observations", () => {
  it("accepts actual rectangle discriminator and known inapplicable clipping on text/rectangle", async () => {
    const local = await planned();
    const rectangle = local.native.penpot.createRectangle();
    rectangle.type = "rectangle";
    Reflect.deleteProperty(rectangle, "clipContent");
    Reflect.deleteProperty(local.native.child, "clipContent");
    local.native.source.appendChild(rectangle);
    const capture = (await captureInspection(local.native.client, {
      page: "Sources",
      shapeId: local.native.source.id,
      fields: [
        ...inspectionFields,
      ],
    })) as InspectionCapture;
    expect(capture.counts.unknownFields).toBe(0);
    expect(capture.nodes?.find((node) => node.type === "rectangle")?.layout).toMatchObject({
      clipContent: null,
    });
    expect(capture.nodes?.find((node) => node.type === "text")?.layout).toMatchObject({
      clipContent: null,
    });
    expect(capture.nodes?.find((node) => node.type === "board")?.layout).toMatchObject({
      clipContent: false,
    });
    expect(() => inspectionContentHash(capture)).not.toThrow();
    Reflect.deleteProperty(local.native.source, "clipContent");
    const unknown = (await captureInspection(local.native.client, {
      page: "Sources",
      shapeId: local.native.source.id,
      fields: [
        ...inspectionFields,
      ],
    })) as InspectionCapture;
    expect(unknown.nodes?.[0]?.unknowns).toContain("layout.clipContent");
    expect(() => inspectionContentHash(unknown)).toThrow("Unknown fields");
  });

  it.each([
    [
      "flipX",
      true,
    ],
    [
      "proportionLock",
      true,
    ],
    [
      "constraintsHorizontal",
      "right",
    ],
    [
      "constraintsVertical",
      "scale",
    ],
    [
      "fixedWhenScrolling",
      true,
    ],
    [
      "textTransform",
      "uppercase",
    ],
    [
      "textDecoration",
      "underline",
    ],
    [
      "blur",
      {
        type: "layer-blur",
        value: 2,
        hidden: false,
      },
    ],
    [
      "backgroundBlur",
      {
        type: "background-blur",
        value: 2,
        hidden: false,
      },
    ],
  ])("rejects a native %s change even for identical stub pixels", async (key, value) => {
    const local = await planned();
    const copied = local.native.copy(local.native.source, local.native.pages[0]!.root);
    (copied.children[0] as unknown as Record<string, unknown>)[String(key)] = value;
    const capture = (await captureInspection(local.native.client, {
      page: "Sources",
      shapeId: copied.id,
      fields: [
        ...inspectionFields,
      ],
    })) as InspectionCapture;
    const mapping = deriveNodeMap(local.inspection, capture);
    expect(() => compareNativeCopy(local.inspection, capture, mapping)).toThrow(
      "Native copy changed",
    );
  });

  it("keeps old inspection documents readable while blocking unobserved release behavior", async () => {
    const local = await planned();
    const old = structuredClone(local.inspection);
    delete (old.nodes![0]!.geometry as Record<string, unknown>).flipX;
    expect(() => validateInspectionDocument(old)).not.toThrow();
    expect(() => inspectionContentHash(old)).toThrow("unobservable");
  });
});

describe("native board sizing and viewer behavior", () => {
  it.each([
    [
      "showInViewMode",
      false,
    ],
    [
      "horizontalSizing",
      "auto",
    ],
    [
      "verticalSizing",
      "auto",
    ],
  ])("rejects a copied board %s change despite equal dimensions and pixels", async (key, value) => {
    const local = await planned();
    const copied = local.native.copy(local.native.source, local.native.pages[0]!.root);
    (copied as unknown as Record<string, unknown>)[String(key)] = value;
    const capture = (await captureInspection(local.native.client, {
      page: "Sources",
      shapeId: copied.id,
      fields: [
        ...inspectionFields,
      ],
    })) as InspectionCapture;
    expect(() =>
      compareNativeCopy(local.inspection, capture, deriveNodeMap(local.inspection, capture)),
    ).toThrow("Native copy changed");
  });

  it("observes optional unset sizing without inventing auto/fixed defaults, and blocks unreadable viewer state", async () => {
    const local = await planned();
    expect(local.inspection.nodes?.[0]?.layout).toMatchObject({
      showInViewMode: true,
      boardSizing: {
        horizontalSizing: null,
        verticalSizing: null,
      },
    });
    local.native.source.horizontalSizing = "auto";
    local.native.source.verticalSizing = "auto";
    const capture = (await captureInspection(local.native.client, {
      page: "Sources",
      shapeId: local.native.source.id,
      fields: [
        ...inspectionFields,
      ],
    })) as InspectionCapture;
    expect(capture.nodes?.[0]?.layout).toMatchObject({
      boardSizing: {
        horizontalSizing: "auto",
        verticalSizing: "auto",
      },
    });
    expect(() => inspectionContentHash(capture)).not.toThrow();
    Reflect.deleteProperty(local.native.source, "showInViewMode");
    const unreadable = (await captureInspection(local.native.client, {
      page: "Sources",
      shapeId: local.native.source.id,
      fields: [
        ...inspectionFields,
      ],
    })) as InspectionCapture;
    expect(unreadable.nodes?.[0]?.unknowns).toContain("layout.showInViewMode");
    expect(() => inspectionContentHash(unreadable)).toThrow("Unknown fields");
  });
});

describe("observed unset root constraints", () => {
  it("preserves explicit SDK null board constraints and still blocks missing or unsupported observations", async () => {
    const local = await planned();
    Reflect.set(local.native.source, "constraintsHorizontal", null);
    Reflect.set(local.native.source, "constraintsVertical", null);
    const original = (await captureInspection(local.native.client, {
      page: "Sources",
      shapeId: local.native.source.id,
      fields: [
        ...inspectionFields,
      ],
    })) as InspectionCapture;
    expect(original.counts.unknownFields).toBe(0);
    expect(original.nodes?.[0]?.layout).toMatchObject({
      constraints: {
        constraintsHorizontal: null,
        constraintsVertical: null,
        fixedWhenScrolling: false,
      },
    });
    expect(() => inspectionContentHash(original)).not.toThrow();
    const copy = local.native.copy(local.native.source, local.native.pages[0]!.root);
    const copied = (await captureInspection(local.native.client, {
      page: "Sources",
      shapeId: copy.id,
      fields: [
        ...inspectionFields,
      ],
    })) as InspectionCapture;
    expect(() =>
      compareNativeCopy(original, copied, deriveNodeMap(original, copied)),
    ).not.toThrow();
    const changed = structuredClone(copied);
    (
      (changed.nodes![0]!.layout as Record<string, unknown>).constraints as Record<string, unknown>
    ).constraintsHorizontal = "left";
    expect(() => compareNativeCopy(original, changed, deriveNodeMap(original, changed))).toThrow(
      "Native copy changed",
    );
    const missing = structuredClone(original);
    delete (
      (missing.nodes![0]!.layout as Record<string, unknown>).constraints as Record<string, unknown>
    ).constraintsVertical;
    expect(() => inspectionContentHash(missing)).toThrow("unobservable");
    const invalid = structuredClone(original);
    (
      (invalid.nodes![0]!.layout as Record<string, unknown>).constraints as Record<string, unknown>
    ).constraintsHorizontal = "unknown-mode";
    expect(() => inspectionContentHash(invalid)).toThrow("unsupported");
    const childNull = structuredClone(original);
    (
      (childNull.nodes![1]!.layout as Record<string, unknown>).constraints as Record<
        string,
        unknown
      >
    ).constraintsHorizontal = null;
    expect(() => inspectionContentHash(childNull)).toThrow("unsupported");
  });
});

describe("SDK wrapper identities", () => {
  it("independently reads back owned pages when the SDK returns fresh wrappers on every page enumeration", async () => {
    const local = await planned();
    local.native.setFreshPages(true);
    const assembled = await assembleRelease(local.native.client, local.root, local.release, {
      ...fast,
      runId: "fresh-wrapper-assembly",
    });
    expect(assembled.status).toBe("awaiting-copy");
    expect(assembled.target.pageId).toBe(
      local.native.pages.find((page) => page.name === "release/1.2.3")?.id,
    );
    expect(local.native.pages).toHaveLength(2);
    expect(assembled.maps).toHaveLength(2);
  });
});

async function linkedRelease({ childReviewed = true, childBlocked = false } = {}) {
  const local = await planned();
  const journey = JSON.parse(
    await readFile(path.join(local.root, "inputs/journey.json"), "utf8"),
  ) as MapContract;
  const child: MapContract = {
    ...structuredClone(journey),
    id: "journey-child",
    title: "Scoped journey detail",
    ...(childBlocked
      ? {
          findings: [
            {
              id: "unresolved",
              message: "Detail decision remains open",
              severity: "blocking" as const,
              status: "open" as const,
            },
          ],
        }
      : {}),
  };
  const childRef = await save(local.root, "inputs/journey-child.json", child);
  journey.sources.push({
    id: "detail",
    kind: "contract",
    path: childRef.path,
    sha256: childRef.sha256,
    fileId: "file",
    pageId: "original-detail-page",
    frameId: "original-detail-board",
  });
  journey.nodes.push({
    id: "detail-node",
    kind: "detail-link",
    label: "Detailed behavior",
    origin: "observed",
    sourceIds: [
      "detail",
    ],
    requirementIds: [
      "requirement",
    ],
  });
  const parentRef = await save(local.root, "inputs/journey.json", journey);
  const integration = JSON.parse(
    await readFile(path.join(local.root, "inputs/integration.json"), "utf8"),
  ) as MapContract;
  integration.journey = {
    path: parentRef.path,
    sha256: hashMapContract(journey),
  };
  const integrationRef = await save(local.root, "inputs/integration.json", integration);
  const review = (map: MapContract) =>
    createArtifactReview({
      artifactKind: map.kind,
      artifactId: map.id,
      artifactHash: hashMapContract(map),
      by: "Owner",
      note: `Approved ${map.id}`,
    });
  const input: DesignReleasePlanInput = {
    ...local.input,
    contracts: [
      {
        ...parentRef,
        review: review(journey),
      },
      {
        ...integrationRef,
        review: review(integration),
      },
      {
        ...childRef,
        ...(childReviewed
          ? {
              review: review(child),
            }
          : {}),
      },
    ],
  };
  const release = await planRelease(local.root, input);
  return {
    ...local,
    input,
    release,
    journey,
    child,
    parentRef,
    childRef,
  };
}

describe("release detail contract closure", () => {
  it("requires explicit pinned child members and independent detail reviews/readiness", async () => {
    const local = await linkedRelease();
    await expect(
      planRelease(local.root, {
        ...local.input,
        contracts: local.input.contracts.slice(0, 2),
      }),
    ).rejects.toThrow("explicit exact-hash release member");
    await expect(
      assertReleaseContracts(local.root, local.release.contracts, true, undefined, "file"),
    ).resolves.toBeUndefined();
    const unreviewed = await linkedRelease({
      childReviewed: false,
    });
    await expect(
      assertReleaseContracts(
        unreviewed.root,
        unreviewed.release.contracts,
        true,
        undefined,
        "file",
      ),
    ).rejects.toThrow("exact owner reviews");
    const blocked = await linkedRelease({
      childBlocked: true,
    });
    await expect(
      assertReleaseContracts(blocked.root, blocked.release.contracts, true, undefined, "file"),
    ).rejects.toThrow("not ready");
  });

  it("publishes child maps first and relocates links onto the release child board", async () => {
    const local = await linkedRelease();
    const assembled = await assembleRelease(local.native.client, local.root, local.release, {
      ...fast,
      runId: "detail-assembly",
    });
    const child = assembled.maps.find((map) => map.id === "journey-child")!;
    const parent = assembled.maps.find((map) => map.id === "journey")!;
    expect(assembled.maps.indexOf(child)).toBeLessThan(assembled.maps.indexOf(parent));
    const projection = JSON.parse(
      await readFile(path.join(local.root, parent.projection.path), "utf8"),
    );
    const clickable = projection.shapes.find(
      (shape: { role: string; logicalId: string }) =>
        shape.role === "node" && shape.logicalId === "detail-node",
    );
    expect(clickable.interactions).toEqual([
      {
        trigger: "click",
        type: "navigate-to",
        destinationId: child.boardId,
        destinationPageId: assembled.target.pageId,
        destinationMapHash: hashMapContract(local.child),
        destinationMapId: "journey-map:journey-child",
      },
    ]);
    expect(clickable.interactions[0].destinationId).not.toBe("original-detail-board");
  });

  it("rejects bounded explicit detail dependency cycles before publication", async () => {
    const local = await linkedRelease();
    const child = structuredClone(local.child);
    child.sources.push({
      id: "parent",
      kind: "contract",
      path: local.parentRef.path,
      sha256: local.parentRef.sha256,
      fileId: "file",
      pageId: "original-detail-page",
      frameId: "parent-board",
    });
    child.nodes.push({
      id: "parent-node",
      kind: "detail-link",
      label: "Parent",
      origin: "observed",
      sourceIds: [
        "parent",
      ],
      requirementIds: [
        "requirement",
      ],
    });
    const parentReference = {
      ...local.parentRef,
      kind: local.journey.kind,
      id: local.journey.id,
    };
    const childReference = {
      ...local.childRef,
      kind: child.kind,
      id: child.id,
    };
    expect(() =>
      releaseContractGraph(
        [
          {
            reference: parentReference,
            map: local.journey,
          },
          {
            reference: childReference,
            map: child,
          },
        ],
        "file",
      ),
    ).toThrow("Cyclic");
  });
});

describe("released detail evidence", () => {
  it("rejects links back to mutable original boards even with a newly recomputed projection hash", async () => {
    const local = await linkedRelease();
    const assembled = await assembleRelease(local.native.client, local.root, local.release, {
      ...fast,
      runId: "detail-proof",
    });
    const page = local.native.pages.find((item) => item.id === assembled.target.pageId)!;
    const target = local.native.copy(local.native.source, page.root);
    const verified = await verifyRelease(
      local.native.client,
      local.root,
      assembled,
      [
        {
          sourceId: "screen",
          targetFrameId: target.id,
        },
      ],
      fast,
    );
    expect((await checkRelease(undefined, local.root, verified)).valid).toBe(true);
    const forged = structuredClone(verified);
    const parent = forged.maps.find((map) => map.id === "journey")!;
    const projection = JSON.parse(
      await readFile(path.join(local.root, parent.projection.path), "utf8"),
    );
    for (const shape of projection.shapes.filter(
      (shape: { logicalId: string; interactions?: unknown[] }) =>
        shape.logicalId === "detail-node" && shape.interactions?.length,
    )) {
      shape.interactions[0].destinationId = "original-detail-board";
      shape.interactions[0].destinationPageId = "original-detail-page";
    }
    projection.fingerprint = observationHash({
      boardId: projection.boardId,
      boardBounds: projection.boardBounds,
      contractHash: projection.contractHash,
      shapes: projection.shapes,
      conflicts: projection.conflicts,
    });
    parent.projection = await save(local.root, "wrong-detail-projection.json", projection);
    expect((await checkRelease(undefined, local.root, forged)).reasons.join(" ")).toMatch(
      /exact reviewed release child board/,
    );
    const final = await finalizeRelease(
      local.native.client,
      local.root,
      verified,
      ownerReview(verified),
      fast,
    );
    const context = await releaseContext(local.root, final);
    expect(context.ready).toBe(true);
    expect(context.mapContexts.find((map) => map.mapId === "journey")?.details[0]).toMatchObject({
      mapId: "journey-child",
      ready: true,
      review: "separate-artifact",
    });
    expect(
      context.mapContexts.some((map) => map.mapId === "journey-child" && map.reviewed && map.ready),
    ).toBe(true);
    expect(context.mapTargets.find((map) => map.id === "journey-child")?.frameId).toBe(
      assembled.maps.find((map) => map.id === "journey-child")?.boardId,
    );
  });
});

describe("release native write privacy preflight", () => {
  it("rejects protected native titles and contract labels before creating any page or journal", async () => {
    const local = await planned();
    const redact = (value: string) => value.replaceAll("private-endpoint-key", "[redacted]");
    await expect(
      assembleRelease(
        local.native.client,
        local.root,
        {
          ...local.release,
          title: "private-endpoint-key",
        },
        {
          ...fast,
          redact,
          runId: "private-title",
        },
      ),
    ).rejects.toThrow("Protected data in release record");
    expect(local.native.pages).toHaveLength(1);
    await expect(
      readFile(path.join(local.root, ".penpair/runs/private-title.json")),
    ).rejects.toMatchObject({
      code: "ENOENT",
    });
    const mapRedactor = (value: string) =>
      value.replaceAll("Route /complete uses success state", "[protected]");
    await expect(
      planRelease(local.root, local.input, {
        redact: mapRedactor,
      }),
    ).rejects.toThrow("Protected data");
    await expect(
      assembleRelease(local.native.client, local.root, local.release, {
        ...fast,
        redact: mapRedactor,
        runId: "private-map",
      }),
    ).rejects.toThrow("Protected data in release map contract");
    expect(local.native.pages).toHaveLength(1);
    await expect(
      readFile(path.join(local.root, ".penpair/runs/private-map.json")),
    ).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
