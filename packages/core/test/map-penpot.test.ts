import { mapCardAnchorHeight } from "../src/maps/card-metrics.js";
import { createHash } from "node:crypto";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it } from "vitest";
import { readMapPathPoints } from "../src/map-penpot/path-geometry.js";
import { observationHash } from "../src/journal.js";
import { verificationProblems } from "../src/map-penpot/publish.js";
import { compiles } from "../src/snippet.js";
import {
  nativeMapIcons,
  nativeMapTextEntries,
  importMapProposal,
  resolveMapDetails,
  createMapPresentationProposal,
  validateMapPresentationProposal,
  acceptMapPresentationProposal,
  preserveMapPresentation,
  assembleReleaseMaps,
  nativeProposalToMapProposal,
  inspectMapSnippet,
  publishMapSnippet,
  publishMap,
  readProjection,
} from "../src/map-penpot/index.js";
import { projectionDigest, projectionDigestSource } from "../src/map-penpot/snippets.js";
import type { MapContract } from "../src/maps/types.js";
import { buildMapDrawingPlan } from "../src/maps/render.js";
import { hashMapContract } from "../src/maps/validation.js";
import { drawingFromPlan } from "../src/map-penpot/index.js";
import type { MapDrawing } from "../src/map-penpot/index.js";
import type { PenpotToolClient } from "../src/client.js";
import { kitFixture } from "./helpers/kit-fixture.js";

const directories: string[] = [];
const target = {
  fileId: "file",
  pageId: "page",
};
const drawing: MapDrawing = {
  mapId: "reset",
  contractHash: "a".repeat(64),
  title: "Account recovery",
  fontFamily: "Test Sans",
  nodes: [
    {
      id: "form",
      label: "Submit email",
      kind: "step",
      x: 400,
      y: 180,
      width: 280,
      height: mapCardAnchorHeight,
    },
    {
      id: "done",
      label: "Confirmation",
      kind: "outcome",
      x: 1160,
      y: 180,
      width: 280,
      height: mapCardAnchorHeight,
    },
  ],
  edges: [
    {
      id: "submit",
      from: "form",
      to: "done",
      label: "Valid",
    },
  ],
};

function fixture() {
  const base = kitFixture();
  const font = base.penpot.fonts.findByName("Test Sans")!;
  Object.assign(font, {
    name: "Test Sans",
  });
  Object.assign(base.penpot.fonts, {
    all: [
      font,
    ],
  });
  const originalResize = base.Shape.prototype.resize;
  base.Shape.prototype.resize = function (width: number, height: number) {
    originalResize.call(this, width, height);
    if (this.type === "text") {
      (
        this as unknown as {
          growType: string;
        }
      ).growType = "fixed";
    }
  };
  interface NativeInteraction {
    trigger: string;
    action: {
      type: string;
      destination?: {
        id: string;
      };
    };
  }
  const interactions = new WeakMap<object, NativeInteraction[]>();
  Object.defineProperty(base.Shape.prototype, "interactions", {
    configurable: true,
    get(this: object) {
      return interactions.get(this) ?? [];
    },
  });
  Object.assign(base.Shape.prototype, {
    addInteraction(this: object, trigger: string, action: NativeInteraction["action"]) {
      const list = interactions.get(this) ?? [];
      const interaction = {
        trigger,
        action,
      };
      list.push(interaction);
      interactions.set(this, list);
      return interaction;
    },
    removeInteraction(this: object, interaction: NativeInteraction) {
      interactions.set(
        this,
        (interactions.get(this) ?? []).filter((item) => item !== interaction),
      );
    },
  });
  const metadata = new WeakMap<object, Map<string, string>>();
  Object.assign(base.Shape.prototype, {
    getSharedPluginData(this: object, namespace: string, key: string) {
      return metadata.get(this)?.get(`${namespace}:${key}`) ?? "";
    },
    setSharedPluginData(this: object, namespace: string, key: string, value: string) {
      const entries = metadata.get(this) ?? new Map<string, string>();
      entries.set(`${namespace}:${key}`, value);
      metadata.set(this, entries);
    },
  });
  const client: PenpotToolClient = {
    async callTool(_name, args) {
      const result = await runInNewContext(`(async () => {${String(args.code)}\n})()`, {
        penpot: base.penpot,
        console,
        Uint8Array,
        btoa: (value: string) => Buffer.from(value, "binary").toString("base64"),
        atob,
      });
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
  return {
    ...base,
    client,
  };
}

async function journal() {
  const root = await mkdtemp(path.join(os.tmpdir(), "map-projection-"));
  directories.push(root);
  return {
    root,
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

describe("native map projection", () => {
  it("compiles real generated snippets and previews without writes", async () => {
    const local = fixture();
    const observed = await readProjection(local.client, target, drawing.mapId);
    expect(compiles(inspectMapSnippet(target, drawing.mapId).code)).toBeUndefined();
    expect(compiles(publishMapSnippet(target, drawing, observed).code)).toBeUndefined();
    const result = await publishMap(local.client, target, drawing);
    expect(result.report.phase).toBe("inspected");
    expect(result.projection.boardId).toBeNull();
    expect(local.shapes).toHaveLength(1);
  });

  it("does not carry the inspected projection in the publish snippet, so an older drawing cannot make it too large", async () => {
    const local = fixture();
    const observed = await readProjection(local.client, target, drawing.mapId);
    const bare = publishMapSnippet(target, drawing, observed).code.length;
    const crowded = publishMapSnippet(target, drawing, {
      ...observed,
      shapes: Array.from(
        {
          length: 3000,
        },
        (_, index) => ({
          shapeId: `shape-${index}`,
          role: "node",
          logicalId: `node-${index}`,
        }),
      ),
    } as never).code.length;
    expect(crowded - bare).toBeLessThan(64);
  });

  it("computes the same projection digest on the host and in the Penpot sandbox", async () => {
    for (const text of [
      "",
      "{}",
      JSON.stringify({
        a: [
          1,
          2,
          {
            b: "ö☃",
          },
        ],
      }),
      "x".repeat(5000),
    ]) {
      const inSandbox = await runInNewContext(
        `${projectionDigestSource}\nprojectionDigest(${JSON.stringify(text)})`,
        {},
      );
      expect(inSandbox).toBe(projectionDigest(text));
    }
    expect(projectionDigest("a")).not.toBe(projectionDigest("b"));
  });

  it("requires journaling and rejects a missing font before any writes", async () => {
    const local = fixture();
    await expect(
      publishMap(local.client, target, drawing, {
        apply: true,
      }),
    ).rejects.toThrow("journal");
    await expect(
      publishMap(
        local.client,
        target,
        {
          ...drawing,
          fontFamily: "Unavailable",
        },
        {
          apply: true,
          journal: await journal(),
          layout: false,
          export: false,
        },
      ),
    ).rejects.toThrow("font");
    expect(local.shapes).toHaveLength(1);
  });

  it("publishes idempotently, keeps shape IDs and preserves unrelated content", async () => {
    const local = fixture();
    const unrelated = local.penpot.createRectangle();
    unrelated.name = "Unrelated";
    const first = await publishMap(local.client, target, drawing, {
      apply: true,
      journal: await journal(),
      layout: false,
      export: false,
    });
    expect(first.report.verified).toBe(true);
    expect(first.visualReviewRequired).toBe(true);
    expect(first.projection.shapes).toHaveLength(15);
    const next = await publishMap(local.client, target, drawing, {
      apply: true,
      journal: await journal(),
      layout: false,
      export: false,
      expected: first.projection,
    });
    expect(next.projection.shapes.map((shape) => shape.shapeId).sort()).toEqual(
      first.projection.shapes.map((shape) => shape.shapeId).sort(),
    );
    expect(local.shapes).toContain(unrelated);
    await expect(
      publishMap(local.client, target, drawing, {
        apply: true,
        journal: await journal(),
      }),
    ).rejects.toThrow("prior projection");
  });

  it("refuses stale targets, ownership conflicts and ambiguous native additions", async () => {
    const local = fixture();
    await expect(
      readProjection(
        local.client,
        {
          ...target,
          fileId: "other",
        },
        drawing.mapId,
      ),
    ).rejects.toThrow("identity");
    const first = await publishMap(local.client, target, drawing, {
      apply: true,
      journal: await journal(),
      layout: false,
      export: false,
    });
    const board = local.shapes.find((shape) => shape.id === first.projection.boardId)!;
    board.appendChild(local.penpot.createRectangle());
    const observed = await readProjection(local.client, target, drawing.mapId);
    expect(observed.conflicts[0]).toContain("ownership");
    await expect(
      publishMap(local.client, target, drawing, {
        apply: true,
        journal: await journal(),
        expected: first.projection,
      }),
    ).rejects.toThrow("ownership");
  });

  it("imports designer labels as proposals and keeps layout separate", async () => {
    const local = fixture();
    const first = await publishMap(local.client, target, drawing, {
      apply: true,
      journal: await journal(),
      layout: false,
      export: false,
    });
    const text = first.projection.shapes.find((shape) => shape.role === "label")!;
    local.shapes.find((shape) => shape.id === text.shapeId)!.characters = "Send recovery link";
    const observed = await readProjection(local.client, target, drawing.mapId);
    const proposed = importMapProposal(drawing, observed, first.projection);
    expect(proposed.changes).toEqual([
      {
        nodeId: "form",
        label: "Send recovery link",
      },
    ]);
    expect(proposed.presentation).toHaveLength(2);
    expect(drawing.nodes[0]?.label).toBe("Submit email");
    await expect(
      publishMap(local.client, target, drawing, {
        apply: true,
        journal: await journal(),
        expected: first.projection,
      }),
    ).rejects.toThrow("reconcile");
    expect(() =>
      importMapProposal(
        {
          ...drawing,
          contractHash: "b".repeat(64),
        },
        observed,
      ),
    ).toThrow("base contract");
  });
  it("reconciles a lost acknowledgment without repeating the native write", async () => {
    const local = fixture();
    let interrupted = false;
    let writes = 0;
    const client: PenpotToolClient = {
      async callTool(name, args, options) {
        const result = await local.client.callTool(name, args, options);
        if (String(args.code).includes("const plannedNodes")) {
          writes++;
          if (!interrupted) {
            interrupted = true;
            throw new Error("Connection lost after native write");
          }
        }
        return result;
      },
      async close() {},
    };
    const recovery = {
      ...(await journal()),
      runId: "native-map-recovery",
    };
    const options = {
      apply: true,
      journal: recovery,
      layout: false as const,
      export: false,
    };
    await expect(publishMap(client, target, drawing, options)).rejects.toMatchObject({
      outcome: "uncertain",
    });
    const recovered = await publishMap(client, target, drawing, {
      ...options,
      journal: {
        ...recovery,
        resume: true,
      },
    });
    expect(recovered.report.verified).toBe(true);
    expect(writes).toBe(1);
  });

  it("keeps manual card positioning and flags duplicate IDs independently", async () => {
    const local = fixture();
    const options = {
      apply: true,
      journal: await journal(),
      layout: false as const,
      export: false,
    };
    const first = await publishMap(local.client, target, drawing, options);
    const card = local.shapes.find(
      (shape) =>
        shape.id === first.projection.shapes.find((shape) => shape.role === "node")!.shapeId,
    )!;
    card.x += 20;
    const observed = await readProjection(local.client, target, drawing.mapId);
    const next = await publishMap(local.client, target, drawing, {
      ...options,
      journal: await journal(),
      expected: observed,
    });
    expect(next.report.verified).toBe(true);
    expect(next.projection.shapes.find((shape) => shape.shapeId === card.id)?.x).toBe(card.x);
    const duplicate = local.penpot.createRectangle();
    const owner = card as unknown as {
      getSharedPluginData(namespace: string, key: string): string;
    };
    const writable = duplicate as unknown as {
      setSharedPluginData(namespace: string, key: string, value: string): void;
    };
    writable.setSharedPluginData("penpair", "map", owner.getSharedPluginData("penpair", "map"));
    local.shapes.find((shape) => shape.id === first.projection.boardId)!.appendChild(duplicate);
    expect((await readProjection(local.client, target, drawing.mapId)).conflicts).toContain(
      "Duplicate logical ID: node:form",
    );
  });

  it("imports changed edge labels and unambiguous native endpoints", async () => {
    const local = fixture();
    const first = await publishMap(local.client, target, drawing, {
      apply: true,
      journal: await journal(),
      layout: false,
      export: false,
    });
    const edge = first.projection.shapes.find((shape) => shape.role === "edge")!;
    const line = local.shapes.find((shape) => shape.id === edge.shapeId)!;
    (
      line as unknown as {
        content: string;
      }
    ).content = "M1440 266 L400 266";
    const label = first.projection.shapes.find((shape) => shape.role === "edge-label")!;
    local.shapes.find((shape) => shape.id === label.shapeId)!.characters = "Retry";
    const proposed = importMapProposal(
      drawing,
      await readProjection(local.client, target, drawing.mapId),
      first.projection,
    );
    expect(proposed.edgeChanges).toEqual([
      {
        edgeId: "submit",
        from: "done",
        to: "form",
        label: "Retry",
      },
    ]);
    expect(proposed.findings).toEqual([]);
    (
      line as unknown as {
        content: string;
      }
    ).content = "M0 0 L3 4";
    expect(
      importMapProposal(
        drawing,
        await readProjection(local.client, target, drawing.mapId),
        first.projection,
      ).findings[0],
    ).toContain("ambiguous");
  });

  it("rejects a preflight snapshot changed before writing", async () => {
    const local = fixture();
    const before = await readProjection(local.client, target, drawing.mapId);
    const first = await publishMap(local.client, target, drawing, {
      apply: true,
      journal: await journal(),
      layout: false,
      export: false,
    });
    const stale = publishMapSnippet(target, drawing, before);
    const result = await runInNewContext(`(async () => {${stale.code}\n})()`, {
      penpot: local.penpot,
      atob,
      Uint8Array,
    });
    expect(result).toMatchObject({
      ok: false,
      message: expect.stringContaining("changed after inspection"),
    });
    expect((await readProjection(local.client, target, drawing.mapId)).fingerprint).toBe(
      first.projection.fingerprint,
    );
  });
  it("assembles journey and integration boards with the same feature ID without collisions", async () => {
    const local = fixture();
    const contract: MapContract = {
      schemaVersion: 1,
      kind: "journey-map",
      id: "reset",
      title: "Recovery",
      goal: "Recover access",
      sources: [],
      nodes: [
        {
          id: "form",
          label: "Enter email",
          kind: "step",
          origin: "proposed",
        },
      ],
      edges: [
        {
          id: "retry",
          from: "form",
          to: "form",
          label: "Retry",
          origin: "proposed",
        },
      ],
      requirements: [],
      findings: [],
      presentation: {
        fontFamily: "Test Sans",
      },
    };
    const results = await assembleReleaseMaps(
      local.client,
      (await journal()).root,
      target,
      [
        contract,
        {
          ...contract,
          kind: "integration-map",
        },
      ],
      {
        apply: true,
        layout: false,
        export: false,
        origin: {
          x: 0,
          y: 1000,
        },
      },
    );
    expect(results).toHaveLength(2);
    expect(results.map((result) => result.publication.report.verified)).toEqual([
      true,
      true,
    ]);
    expect(results.map((result) => result.publication.projection.mapId)).toEqual([
      "journey-map:reset",
      "integration-map:reset",
    ]);
    expect(new Set(results.map((result) => result.publication.projection.boardId)).size).toBe(2);
    const firstBounds = results[0]!.publication.projection.boardBounds!;
    const secondBounds = results[1]!.publication.projection.boardBounds!;
    expect(secondBounds.x).toBeGreaterThan(firstBounds.x + firstBounds.width);
    const observed = results[0]!.publication.projection;
    const line = observed.shapes.find((shape) => shape.role === "edge")!;
    expect(line.content!.match(/L/g)!.length).toBeGreaterThan(1);
    const label = observed.shapes.find((shape) => shape.role === "label")!;
    local.shapes.find((shape) => shape.id === label.shapeId)!.characters = "Enter recovery email";
    const current = await readProjection(local.client, target, observed.mapId);
    const proposal = nativeProposalToMapProposal(
      contract,
      drawingFromPlan(buildMapDrawingPlan(contract)),
      current,
      observed,
    );
    expect(proposal.baseHash).toBe(hashMapContract(contract));
    expect(proposal.proposedMap.nodes[0]?.label).toBe("Enter recovery email");
    expect(proposal.proposedMap.nodes[0]?.origin).toBe("proposed");
    expect(contract.nodes[0]?.label).toBe("Enter email");
  });
  it("adopts presentation-only proposals without changing canonical intent or transferring review", async () => {
    const local = fixture();
    const map: MapContract = {
      schemaVersion: 1,
      kind: "journey-map",
      id: "reset",
      title: "Recovery",
      goal: "Recover access",
      sources: [],
      nodes: [
        {
          id: "form",
          label: "Enter email",
          kind: "step",
          origin: "owner-decision",
        },
      ],
      edges: [],
      requirements: [],
      findings: [],
      presentation: {
        fontFamily: "Test Sans",
      },
    };
    const plan = drawingFromPlan(buildMapDrawingPlan(map));
    const first = await publishMap(local.client, target, plan, {
      apply: true,
      journal: await journal(),
      layout: false,
      export: false,
    });
    const card = first.projection.shapes.find((shape) => shape.role === "node")!;
    local.shapes.find((shape) => shape.id === card.shapeId)!.x += 30;
    const observed = await readProjection(local.client, target, plan.mapId);
    const proposal = createMapPresentationProposal(map, plan, observed, first.projection);
    expect(validateMapPresentationProposal(proposal)).toEqual(proposal);
    const adopted = acceptMapPresentationProposal(map, first.projection, proposal);
    expect(adopted.fingerprint).toBe(observed.fingerprint);
    const preserved = preserveMapPresentation(plan, adopted);
    expect(preserved.nodes[0]!.x).toBe(plan.nodes[0]!.x + 30);
    expect(preserved.contractHash).toBe(plan.contractHash);
    const republished = await publishMap(local.client, target, preserved, {
      apply: true,
      journal: await journal(),
      layout: false,
      export: false,
      expected: adopted,
    });
    expect(republished.report.verified).toBe(true);
    expect(republished.projection.shapes.find((shape) => shape.role === "node")?.x).toBe(
      card.x + 30,
    );
    const forged = structuredClone(proposal);
    forged.projection.shapes.find((shape) => shape.role === "label")!.label =
      "Changed user requirement";
    const { boardId, boardBounds, contractHash, shapes, conflicts } = forged.projection;
    forged.projection.fingerprint = observationHash({
      boardId,
      boardBounds,
      contractHash,
      shapes,
      conflicts,
    });
    forged.observedProjectionHash = forged.projection.fingerprint;
    const { hash: _hash, ...forgedBody } = forged;
    forged.hash = observationHash(forgedBody);
    expect(() => acceptMapPresentationProposal(map, first.projection, forged)).toThrow(
      "Semantic edits",
    );

    expect(map.nodes[0]!.origin).toBe("owner-decision");
    expect(proposal).not.toHaveProperty("review");
    expect(() =>
      acceptMapPresentationProposal(
        {
          ...map,
          goal: "Changed intent",
        },
        first.projection,
        proposal,
      ),
    ).toThrow("stale");
    expect(() => acceptMapPresentationProposal(map, observed, proposal)).toThrow("stale");
    expect(() =>
      validateMapPresentationProposal({
        ...proposal,
        observedProjectionHash: "b".repeat(64),
      }),
    ).toThrow();
    expect(() =>
      validateMapPresentationProposal({
        ...proposal,
        projection: {
          ...proposal.projection,
          shapes: [],
        },
      }),
    ).toThrow("fingerprint");
    const changedKind = {
      ...preserved,
      nodes: preserved.nodes.map((node) => ({
        ...node,
        kind: "decision",
      })),
    };
    expect(() => preserveMapPresentation(changedKind, adopted)).toThrow("kind changed");
  });

  it("rejects semantic edits, new objects and unsupported style edits as presentation proposals", async () => {
    const local = fixture();
    const map: MapContract = {
      schemaVersion: 1,
      kind: "journey-map",
      id: "reset",
      title: "Recovery",
      goal: "Recover access",
      sources: [],
      nodes: [
        {
          id: "form",
          label: "Enter email",
          kind: "step",
          origin: "proposed",
        },
      ],
      edges: [],
      requirements: [],
      findings: [],
      presentation: {
        fontFamily: "Test Sans",
      },
    };
    const plan = drawingFromPlan(buildMapDrawingPlan(map));
    const first = await publishMap(local.client, target, plan, {
      apply: true,
      journal: await journal(),
      layout: false,
      export: false,
    });
    const label = first.projection.shapes.find((shape) => shape.role === "label")!;
    const nativeLabel = local.shapes.find((shape) => shape.id === label.shapeId)!;
    nativeLabel.characters = "Different behavior";
    expect(() =>
      createMapPresentationProposal(map, plan, first.projection, first.projection),
    ).toThrow("changed projection");
    const semantic = await readProjection(local.client, target, plan.mapId);
    expect(() => createMapPresentationProposal(map, plan, semantic, first.projection)).toThrow(
      "Semantic edits",
    );
    nativeLabel.characters = "Enter email";
    nativeLabel.name = "Unsupported restyling";
    const restyled = await readProjection(local.client, target, plan.mapId);
    expect(() => createMapPresentationProposal(map, plan, restyled, first.projection)).toThrow(
      "style or ownership",
    );
  });
  it("uses native IDs across fresh SDK wrappers and accepts normalized SVG paths", async () => {
    const local = fixture();
    const rawShapes = new WeakMap<object, object>();
    const wrap = (shape: object): object => {
      const proxy = new Proxy(shape, {
        get(target, key) {
          const value = Reflect.get(target, key);
          if (key === "children") {
            return value.map((child: object) => wrap(child));
          }
          if (key === "content" && typeof value === "string") {
            return value.replace(/([ML])(-?[\d.]+) (-?[\d.]+)/g, "$1$2,$3").replace(/ L/g, "L");
          }
          if (typeof value === "function") {
            return (...args: unknown[]) =>
              value.apply(
                target,
                args.map((arg) =>
                  typeof arg === "object" && arg !== null ? (rawShapes.get(arg) ?? arg) : arg,
                ),
              );
          }
          return value;
        },
        set(target, key, value) {
          return Reflect.set(target, key, value);
        },
      });
      rawShapes.set(proxy, shape);
      return proxy;
    };
    const page = local.penpot.currentPage;
    const originalFind = page.getShapeById;
    Object.assign(page, {
      root: wrap(local.root),
      getShapeById: (id: string) => {
        const shape = originalFind(id);
        return shape ? wrap(shape) : undefined;
      },
    });
    const first = await publishMap(local.client, target, drawing, {
      apply: true,
      journal: await journal(),
      layout: false,
      export: false,
    });
    expect(first.report.verified).toBe(true);
    expect(first.projection.conflicts).toEqual([]);
    const normalizedPath = first.projection.shapes.find((shape) => shape.role === "edge")?.content;
    expect(normalizedPath).toContain("M680,266L");
    expect(readMapPathPoints(normalizedPath)?.at(-1)).toEqual({
      x: 1160,
      y: 266,
    });
    const second = await publishMap(local.client, target, drawing, {
      apply: true,
      journal: await journal(),
      layout: false,
      export: false,
      expected: first.projection,
    });
    expect(second.report.verified).toBe(true);
    expect(second.projection.shapes.map((shape) => shape.shapeId).sort()).toEqual(
      first.projection.shapes.map((shape) => shape.shapeId).sort(),
    );
    const imported = importMapProposal(drawing, second.projection);
    expect(imported.findings).toEqual([]);
    expect(imported.edgeChanges).toEqual([]);
    expect(
      second.projection.shapes
        .filter((shape) => shape.role === "label" || shape.role === "title")
        .every(
          (shape) =>
            (
              shape.appearance as {
                growType: string;
              }
            ).growType === "auto-height",
        ),
    ).toBe(true);
    expect(
      (
        second.projection.shapes.find((shape) => shape.role === "title")?.appearance as {
          fontSize: number;
        }
      ).fontSize,
    ).toBe(32);
  });

  it("selects exact fonts from all rather than fuzzy findByName matches", async () => {
    const local = fixture();
    const exact = local.penpot.fonts.findByName("Test Sans")!;
    Object.assign(local.penpot.fonts, {
      findByName: () => ({
        ...exact,
        name: "Test Sans Tight",
      }),
    });
    const published = await publishMap(local.client, target, drawing, {
      apply: true,
      journal: await journal(),
      layout: false,
      export: false,
    });
    expect(published.report.verified).toBe(true);
    const missing = fixture();
    Object.assign(missing.penpot.fonts, {
      all: [
        {
          ...exact,
          name: "Test Sans Tight",
        },
      ],
    });
    await expect(
      publishMap(missing.client, target, drawing, {
        apply: true,
        journal: await journal(),
        layout: false,
        export: false,
      }),
    ).rejects.toThrow("font unavailable");
    expect(missing.shapes).toHaveLength(1);
    const duplicate = fixture();
    Object.assign(duplicate.penpot.fonts, {
      all: [
        exact,
        exact,
      ],
    });
    await expect(
      publishMap(duplicate.client, target, drawing, {
        apply: true,
        journal: await journal(),
        layout: false,
        export: false,
      }),
    ).rejects.toThrow("ambiguous");
    expect(duplicate.shapes).toHaveLength(1);
  });

  it("parses absolute connector SVG normalization without accepting relative or curved routes", () => {
    expect(readMapPathPoints("M340,180L364,180L364,400L420,400")).toEqual([
      {
        x: 340,
        y: 180,
      },
      {
        x: 364,
        y: 180,
      },
      {
        x: 364,
        y: 400,
      },
      {
        x: 420,
        y: 400,
      },
    ]);
    expect(readMapPathPoints("M.5,-.2L1e2,+2.5e-1")).toEqual([
      {
        x: 0.5,
        y: -0.2,
      },
      {
        x: 100,
        y: 0.25,
      },
    ]);
    expect(readMapPathPoints("M0 0 10 20")).toEqual([
      {
        x: 0,
        y: 0,
      },
      {
        x: 10,
        y: 20,
      },
    ]);
    for (const invalid of [
      "m0,0l1,1",
      "M0 0 Q1 1 2 2",
      "M0 0 L1",
      "M0 0 Z",
      "M0 0 M1 1",
      "M0 0 LInfinity 1",
    ]) {
      expect(readMapPathPoints(invalid)).toBeUndefined();
    }
  });
  it("renders shipped maps with reserved label corridors and visible evidence origins", async () => {
    for (const filename of [
      "journey",
      "integration",
    ]) {
      const local = fixture();
      const raw = JSON.parse(
        await readFile(
          new URL(`../../../examples/design-release-maps/${filename}.json`, import.meta.url),
          "utf8",
        ),
      ) as MapContract;
      const contract = {
        ...raw,
        presentation: {
          fontFamily: "Test Sans",
        },
      };
      const planned = buildMapDrawingPlan(contract);
      expect(planned.complete).toBe(true);
      const native = drawingFromPlan(planned);
      const initial = await readProjection(local.client, target, native.mapId);
      await runInNewContext(`(async()=>{${publishMapSnippet(target, native, initial).code}\n})()`, {
        penpot: local.penpot,
        atob,
        Uint8Array,
      });
      const firstProjection = await readProjection(local.client, target, native.mapId);
      expect(verificationProblems(native, firstProjection)).toEqual([]);
      const result = await publishMap(local.client, target, native, {
        expected: firstProjection,
        apply: true,
        journal: await journal(),
        layout: false,
        export: false,
      });
      expect(result.report.problems).toEqual([]);
      expect(result.report.verified).toBe(true);
      expect(result.projection.shapes.some((shape) => shape.role === "legend")).toBe(true);
      expect(result.projection.shapes.filter((shape) => shape.role === "badge")).toHaveLength(
        contract.nodes.length,
      );
      for (const edge of planned.edges) {
        const label = result.projection.shapes.find(
          (shape) => shape.role === "edge-label" && shape.logicalId === edge.id,
        )!;
        expect(label.x).toBe(edge.labelBox.x);
        expect(label.y).toBe(edge.labelBox.y);
        expect(label.width).toBe(edge.labelBox.width);
        const path = result.projection.shapes.find(
          (shape) => shape.role === "edge" && shape.logicalId === edge.id,
        )!;
        expect(readMapPathPoints(path.content)).toEqual(edge.points);
      }
      const badge = result.projection.shapes.find((shape) => shape.role === "badge")!;
      local.shapes.find((shape) => shape.id === badge.shapeId)!.characters = "Approved";
      const changed = await readProjection(local.client, target, native.mapId);
      expect(
        importMapProposal(native, changed, result.projection).findings.some((message) =>
          message.includes("Origin badge changed"),
        ),
      ).toBe(true);
    }
  });

  it("refuses unreadable manual positioning before writing", async () => {
    const local = fixture();
    const initial = await publishMap(local.client, target, drawing, {
      apply: true,
      journal: await journal(),
      layout: false,
      export: false,
    });
    const card = local.shapes.find(
      (shape) =>
        shape.id === initial.projection.shapes.find((shape) => shape.role === "node")!.shapeId,
    )!;
    card.x = drawing.nodes[1]!.x;
    const observed = await readProjection(local.client, target, drawing.mapId);
    expect(() => preserveMapPresentation(drawing, observed)).toThrow("layout needs reconciliation");
    await expect(
      publishMap(local.client, target, drawing, {
        apply: true,
        journal: await journal(),
        layout: false,
        export: false,
        expected: observed,
      }),
    ).rejects.toThrow("layout needs reconciliation");
  });
  it("publishes pinned native detail navigation and independently verifies destinations", async () => {
    const local = fixture();
    const options = {
      apply: true,
      journal: await journal(),
      layout: false as const,
      export: false,
    };
    const childContract: MapContract = {
      schemaVersion: 1,
      kind: "journey-map",
      id: "child",
      title: "Detail",
      goal: "Describe a focused step",
      sources: [],
      nodes: [
        {
          id: "input",
          label: "Enter email",
          kind: "step",
          origin: "proposed",
        },
      ],
      edges: [],
      requirements: [],
      findings: [],
      presentation: {
        fontFamily: "Test Sans",
      },
    };
    const childDrawing = drawingFromPlan(buildMapDrawingPlan(childContract));
    const bytes = JSON.stringify(childContract);
    await writeFile(path.join(options.journal.root, "child.json"), bytes);
    const child = await publishMap(local.client, target, childDrawing, options);
    const detail = {
      sourceId: "child-contract",
      path: "child.json",
      sha256: createHash("sha256").update(bytes).digest("hex"),
      fileId: target.fileId,
      pageId: target.pageId,
      frameId: child.projection.boardId!,
      mapId: childDrawing.mapId,
      contractHash: childDrawing.contractHash,
    };
    const parent: MapDrawing = {
      ...drawing,
      mapId: "journey-map:parent",
      nodes: drawing.nodes.map((node) =>
        node.id === "form"
          ? {
              ...node,
              kind: "detail-link",
              origin: "proposed",
              detail,
            }
          : {
              ...node,
            },
      ),
    };
    const first = await publishMap(local.client, target, parent, {
      ...options,
      journal: options.journal,
    });
    expect(first.report.verified).toBe(true);
    const clickable = first.projection.shapes.filter(
      (shape) =>
        shape.logicalId === "form" &&
        [
          "node",
          "label",
          "badge",
        ].includes(shape.role),
    );
    expect(clickable).toHaveLength(3);
    for (const shape of clickable) {
      expect(shape.interactions).toEqual([
        {
          trigger: "click",
          type: "navigate-to",
          destinationId: detail.frameId,
          destinationPageId: target.pageId,
          destinationMapHash: childDrawing.contractHash,
          destinationMapId: childDrawing.mapId,
        },
      ]);
    }
    expect(
      first.projection.shapes.find((shape) => shape.role === "label" && shape.logicalId === "form")
        ?.label,
    ).toBe("Details: Submit email");
    const second = await publishMap(local.client, target, parent, {
      ...options,
      journal: options.journal,
      expected: first.projection,
    });
    expect(second.report.verified).toBe(true);
    const card = local.shapes.find(
      (shape) => shape.id === clickable.find((shape) => shape.role === "node")!.shapeId,
    )! as unknown as {
      interactions: {
        trigger: string;
        action: {
          type: string;
          destination?: object;
        };
      }[];
    };
    expect(card.interactions).toHaveLength(1);
    card.interactions[0]!.action.destination = local.penpot.createBoard();
    const altered = await readProjection(local.client, target, parent.mapId);
    expect(
      importMapProposal(parent, altered, second.projection).findings.some((message) =>
        message.includes("Native interaction changed"),
      ),
    ).toBe(true);
    const before = local.shapes.length;
    const invalid = {
      ...parent,
      mapId: "journey-map:foreign-detail",
      nodes: parent.nodes.map((node) =>
        node.detail
          ? {
              ...node,
              detail: {
                ...node.detail,
                fileId: "different-file",
              },
            }
          : node,
      ),
    };
    await expect(
      publishMap(local.client, target, invalid, {
        ...options,
        journal: options.journal,
      }),
    ).rejects.toThrow("same pinned file");
    expect(local.shapes).toHaveLength(before);
    const wrong = {
      ...parent,
      mapId: "journey-map:wrong-detail",
      nodes: parent.nodes.map((node) =>
        node.detail
          ? {
              ...node,
              detail: {
                ...node.detail,
                frameId: first.projection.boardId!,
              },
            }
          : node,
      ),
    };
    await expect(
      publishMap(local.client, target, wrong, {
        ...options,
        journal: options.journal,
      }),
    ).rejects.toThrow("existing pinned owned contract board");
    expect(local.shapes).toHaveLength(before);
    const missing = {
      ...parent,
      mapId: "journey-map:missing-detail",
      nodes: parent.nodes.map((node) =>
        node.detail
          ? {
              ...node,
              detail: {
                ...node.detail,
                frameId: "missing",
              },
            }
          : node,
      ),
    };
    await expect(
      publishMap(local.client, target, missing, {
        ...options,
        journal: options.journal,
      }),
    ).rejects.toThrow("existing pinned owned contract board");
    expect(local.shapes).toHaveLength(before);
  });
  it("assembles explicit detail contracts child first and relocates links to release boards", async () => {
    const local = fixture();
    const { root } = await journal();
    const child: MapContract = {
      schemaVersion: 1,
      kind: "journey-map",
      id: "child",
      title: "Child",
      goal: "Focused flow",
      sources: [],
      nodes: [
        {
          id: "step",
          label: "Enter email",
          kind: "step",
          origin: "proposed",
        },
      ],
      edges: [],
      requirements: [
        {
          id: "recover",
          text: "Recover access",
          origin: "proposed",
        },
      ],
      findings: [],
      presentation: {
        fontFamily: "Test Sans",
      },
    };
    const bytes = JSON.stringify(child);
    await writeFile(path.join(root, "child.json"), bytes);
    const original = await publishMap(
      local.client,
      target,
      drawingFromPlan(buildMapDrawingPlan(child)),
      {
        apply: true,
        journal: {
          root,
        },
        layout: false,
        export: false,
      },
    );
    const parent: MapContract = {
      schemaVersion: 1,
      kind: "journey-map",
      id: "overview",
      title: "Overview",
      goal: "Link focused flows",
      sources: [
        {
          id: "child-ref",
          kind: "contract",
          path: "child.json",
          sha256: createHash("sha256").update(bytes).digest("hex"),
          fileId: target.fileId,
          pageId: target.pageId,
          frameId: original.projection.boardId!,
        },
      ],
      nodes: [
        {
          id: "details",
          label: "Recovery flow",
          kind: "detail-link",
          origin: "proposed",
          sourceIds: [
            "child-ref",
          ],
          requirementIds: [
            "recover",
          ],
        },
      ],
      edges: [],
      requirements: [
        {
          id: "recover",
          text: "Recover access",
          origin: "proposed",
        },
      ],
      findings: [],
      presentation: {
        fontFamily: "Test Sans",
      },
    };
    const originalPage = local.penpot.currentPage;
    const newRoot = new local.Shape("root");
    const scoped = (pageRoot: typeof newRoot) => (id: string) =>
      local.shapes.find((shape) => {
        if (shape.id !== id) {
          return false;
        }
        let ancestor = shape;
        while (ancestor.parent) {
          ancestor = ancestor.parent;
        }
        return ancestor.id === pageRoot.id;
      });
    originalPage.getShapeById = scoped(local.root);
    const releasePage = {
      ...originalPage,
      id: "release-page",
      name: "release/1.0.0",
      root: newRoot,
      getShapeById: scoped(newRoot),
    };
    local.penpot.currentFile.pages.push(releasePage);
    Object.assign(local.penpot, {
      openPage: (page: typeof releasePage) => {
        local.penpot.currentPage = page;
      },
    });
    for (const method of [
      "createBoard",
      "createRectangle",
      "createPath",
      "createText",
    ] as const) {
      const create = local.penpot[method];
      Object.assign(local.penpot, {
        [method]: (...args: unknown[]) => {
          const shape = (create as (...args: unknown[]) => typeof newRoot)(...args);
          local.penpot.currentPage.root.appendChild(shape);
          return shape;
        },
      });
    }
    const results = await assembleReleaseMaps(
      local.client,
      root,
      {
        fileId: target.fileId,
        pageId: releasePage.id,
      },
      [
        parent,
        child,
      ],
      {
        apply: true,
        layout: false,
        export: false,
        origin: {
          x: 0,
          y: 1000,
        },
      },
    );
    expect(results.map((result) => result.mapId)).toEqual([
      "child",
      "overview",
    ]);
    const copiedChild = results[0]!.publication.projection;
    expect(copiedChild.boardId).not.toBe(original.projection.boardId);
    const overview = results[1]!.publication.projection;
    expect(overview.shapes.find((shape) => shape.role === "node")?.interactions?.[0]).toMatchObject(
      {
        destinationId: copiedChild.boardId,
        destinationPageId: releasePage.id,
        destinationMapId: "journey-map:child",
        destinationMapHash: hashMapContract(child),
      },
    );
    expect(parent.sources[0]!.frameId).toBe(original.projection.boardId);
    const count = local.shapes.length;
    await expect(
      assembleReleaseMaps(
        local.client,
        root,
        {
          fileId: target.fileId,
          pageId: releasePage.id,
        },
        [
          parent,
        ],
        {
          apply: true,
          layout: false,
          export: false,
        },
      ),
    ).rejects.toThrow("explicitly included");
    expect(local.shapes).toHaveLength(count);
  });
  it("bounds detail resolution and refuses changed, foreign or invalid pinned contracts", async () => {
    const { root } = await journal();
    const map: MapContract = {
      schemaVersion: 1,
      kind: "journey-map",
      id: "child",
      title: "Child",
      goal: "Focused flow",
      sources: [],
      nodes: [
        {
          id: "step",
          label: "Step",
          kind: "step",
          origin: "proposed",
        },
      ],
      edges: [],
      requirements: [
        {
          id: "recover",
          text: "Recover",
          origin: "proposed",
        },
      ],
      findings: [],
    };
    const bytes = JSON.stringify(map);
    await writeFile(path.join(root, "child.json"), bytes);
    const detail = {
      sourceId: "child",
      path: "child.json",
      sha256: createHash("sha256").update(bytes).digest("hex"),
      fileId: target.fileId,
      pageId: target.pageId,
      frameId: "child-board",
    };
    const input: MapDrawing = {
      ...drawing,
      mapId: "journey-map:parent",
      nodes: [
        {
          ...drawing.nodes[0]!,
          kind: "detail-link",
          requirementIds: [
            "recover",
          ],
          detail,
        },
      ],
    };
    const resolved = await resolveMapDetails(root, input);
    expect(resolved.nodes[0]!.detail).toMatchObject({
      mapId: "journey-map:child",
      contractHash: hashMapContract(map),
    });
    await expect(
      resolveMapDetails(root, {
        ...input,
        mapId: "integration-map:parent",
      }),
    ).rejects.toThrow("same map kind");
    await expect(
      resolveMapDetails(root, {
        ...input,
        mapId: "journey-map:child",
      }),
    ).rejects.toThrow("different contract");
    await expect(
      resolveMapDetails(root, {
        ...input,
        nodes: input.nodes.map((node) => ({
          ...node,
          requirementIds: [
            "missing",
          ],
        })),
      }),
    ).rejects.toThrow("omits a requirement");
    await expect(
      resolveMapDetails(root, {
        ...input,
        nodes: Array.from(
          {
            length: 65,
          },
          (_, index) => ({
            ...input.nodes[0]!,
            id: `node-${index}`,
          }),
        ),
      }),
    ).rejects.toThrow("64 direct");
    const invalid = "{source data must not appear in parser errors";
    await writeFile(path.join(root, "invalid.json"), invalid);
    await expect(
      resolveMapDetails(root, {
        ...input,
        nodes: input.nodes.map((node) => ({
          ...node,
          detail: {
            ...detail,
            path: "invalid.json",
            sha256: createHash("sha256").update(invalid).digest("hex"),
          },
        })),
      }),
    ).rejects.toThrow("Invalid detail contract JSON: child");
    await writeFile(path.join(root, "child.json"), "changed");
    await expect(resolveMapDetails(root, input)).rejects.toThrow("Pinned detail contract changed");
  });
  it("resumes a verified native write after export failure without replaying it", async () => {
    const local = fixture();
    const root = (await journal()).root;
    let exportReady = false;
    let writes = 0;
    local.Shape.prototype.export = async () => {
      if (!exportReady) {
        throw new Error("Renderer is unavailable");
      }
      return new Uint8Array(
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
          "base64",
        ),
      );
    };
    const client: PenpotToolClient = {
      async callTool(name, args, options) {
        if (String(args.code).includes("const plannedNodes")) {
          writes++;
        }
        return local.client.callTool(name, args, options);
      },
      async close() {},
    };
    const options = {
      apply: true,
      journal: {
        root,
        runId: "map-export-recovery",
      },
      layout: false as const,
      sleep: async () => {},
    };
    await expect(publishMap(client, target, drawing, options)).rejects.toMatchObject({
      runId: "map-export-recovery",
      message: expect.stringContaining("--apply --resume map-export-recovery"),
    });
    expect(writes).toBe(1);
    exportReady = true;
    const recovered = await publishMap(client, target, drawing, {
      ...options,
      journal: {
        ...options.journal,
        resume: true,
      },
    });
    expect(recovered.report.verified).toBe(true);
    expect(recovered.image?.stable).toBe(true);
    expect(recovered.visualReviewRequired).toBe(true);
    expect(writes).toBe(1);
  });
  it("refuses protected drawing values before reads or writes using either configured redactor", async () => {
    const local = fixture();
    let calls = 0;
    const client: PenpotToolClient = {
      async callTool() {
        calls++;
        throw new Error("Unexpected live contact");
      },
      async close() {},
    };
    const secret = "mock-private-credential";
    const drawingWithProtectedValue = {
      ...drawing,
      nodes: drawing.nodes.map((node) => ({
        ...node,
        label: secret,
      })),
    };
    const redact = (text: string) => text.replaceAll(secret, "[redacted]");
    for (const journalOnly of [
      false,
      true,
    ]) {
      const run = await journal();
      await expect(
        publishMap(client, target, drawingWithProtectedValue, {
          apply: true,
          journal: journalOnly
            ? {
                ...run,
                redact,
              }
            : run,
          ...(journalOnly
            ? {}
            : {
                redact,
              }),
        }),
      ).rejects.toThrow("protected values");
    }
    expect(calls).toBe(0);
    expect(local.shapes).toHaveLength(1);
    expect(drawingWithProtectedValue.nodes[0]!.label).toBe(secret);
    await expect(
      publishMap(client, target, {
        ...drawing,
        title: "userToken=mock-private-credential",
      }),
    ).rejects.toThrow("protected values");
    expect(calls).toBe(0);
  });
  it("verifies compact canonical cards and generated metadata text independently", async () => {
    const local = fixture();
    const contract: MapContract = {
      schemaVersion: 1,
      kind: "journey-map",
      id: "compact",
      title: "Compact",
      goal: "Show the approved flow",
      sources: [],
      nodes: [
        {
          id: "screen",
          kind: "screen",
          label: "Entry screen",
          origin: "proposed",
        },
      ],
      edges: [],
      requirements: [],
      findings: [],
      presentation: {
        fontFamily: "Test Sans",
      },
    };
    const native = drawingFromPlan(buildMapDrawingPlan(contract));
    const before = await readProjection(local.client, target, native.mapId);
    const result = await runInNewContext(
      `(async()=>{${publishMapSnippet(target, native, before).code}\n})()`,
      {
        penpot: local.penpot,
        atob,
        Uint8Array,
      },
    );
    expect(result.ok).toBe(true);
    expect(
      verificationProblems(native, await readProjection(local.client, target, native.mapId)),
    ).toEqual([]);
  });
  it("retains full metadata in annotations and imports edited titles, descriptions and fixed icons", async () => {
    const local = fixture();
    const map: MapContract = {
      schemaVersion: 1,
      kind: "journey-map",
      id: "metadata",
      title: "Account recovery",
      goal: "Recover access without losing user input",
      summary: "A short overview of recovery",
      description: "A longer map explanation with responsibilities and boundaries.",
      sources: [],
      nodes: [
        {
          id: "recovery",
          kind: "screen",
          label: "A full recovery title that is deliberately longer than the compact card",
          summary:
            "A complete short description that must remain readable beyond the compact card summary.",
          description:
            "Long node context remains fully available beside the flow. It is not reduced to an ellipsis.",
          icon: "screen",
          origin: "proposed",
        },
      ],
      edges: [],
      requirements: [],
      findings: [],
      presentation: {
        fontFamily: "Test Sans",
      },
    };
    const native = drawingFromPlan(buildMapDrawingPlan(map));
    expect(native.nodes[0]!.cardTitle).not.toBe(map.nodes[0]!.label);
    expect(native.nodes[0]!.cardSummary).not.toBe(map.nodes[0]!.summary);
    const first = await publishMap(local.client, target, native, {
      apply: true,
      journal: await journal(),
      layout: false,
      export: false,
    });
    const entry = (role: string, id = native.mapId) =>
      first.projection.shapes.find((shape) => shape.role === role && shape.logicalId === id)!;
    expect(entry("full-label", "recovery").label).toBe(map.nodes[0]!.label);
    expect(entry("full-summary", "recovery").label).toBe(map.nodes[0]!.summary);
    expect(entry("description", "recovery").label).toBe(map.nodes[0]!.description);
    expect(entry("map-description").label).toBe(map.description);
    expect(entry("map-goal").label).toBe(map.goal);
    const unchanged = importMapProposal(native, first.projection);
    expect(unchanged.changes).toEqual([]);
    expect(unchanged.metadataChanges).toBeUndefined();
    expect(unchanged.findings).toEqual([]);
    const glyph = entry("icon", "recovery");
    const vertices = Array.from(
      glyph.content!.matchAll(/[ML]([-+0-9.e]+)[ ,]+([-+0-9.e]+)/gi),
      (match) => ({
        x: Number(match[1]),
        y: Number(match[2]),
      }),
    );
    expect(vertices.length).toBeGreaterThan(2);
    expect(
      vertices.every(
        (point) =>
          point.x >= native.nodes[0]!.x &&
          point.x <= native.nodes[0]!.x + 16 &&
          point.y >= native.nodes[0]!.y &&
          point.y <= native.nodes[0]!.y + 16,
      ),
    ).toBe(true);
    const setText = (role: string, value: string, id = native.mapId) => {
      local.shapes.find((shape) => shape.id === entry(role, id).shapeId)!.characters = value;
    };
    setText("title", "Reviewed recovery map");
    setText("map-summary", "A revised concise overview");
    setText("map-description", "Revised long map context");
    setText("full-label", "Updated full recovery title", "recovery");
    setText("full-summary", "Updated full node summary", "recovery");
    setText("description", "Updated long node context", "recovery");
    (
      local.shapes.find((shape) => shape.id === glyph.shapeId)! as unknown as {
        content: string;
      }
    ).content = nativeMapIcons.check;
    const observed = await readProjection(local.client, target, native.mapId);
    const imported = importMapProposal(native, observed, first.projection);
    expect(imported.metadataChanges).toMatchObject({
      title: "Reviewed recovery map",
      summary: "A revised concise overview",
      description: "Revised long map context",
    });
    expect(imported.changes[0]).toMatchObject({
      nodeId: "recovery",
      label: "Updated full recovery title",
      summary: "Updated full node summary",
      description: "Updated long node context",
      icon: "check",
    });
    expect(imported.findings).toEqual([]);
    const proposed = nativeProposalToMapProposal(map, native, observed, first.projection);
    expect(proposed.proposedMap.title).toBe("Reviewed recovery map");
    expect(proposed.proposedMap.goal).toBe(map.goal);
    expect(proposed.proposedMap.summary).toBe("A revised concise overview");
    expect(proposed.proposedMap.description).toBe("Revised long map context");
    expect(proposed.proposedMap.nodes[0]).toMatchObject({
      label: "Updated full recovery title",
      summary: "Updated full node summary",
      description: "Updated long node context",
      icon: "check",
      origin: "proposed",
    });
    expect(hashMapContract(map)).not.toBe(proposed.proposedHash);
    expect(() => createMapPresentationProposal(map, native, observed, first.projection)).toThrow(
      "Semantic edits",
    );
  });

  it("treats custom glyphs and derived annotation edits as explicit reconciliation findings", async () => {
    const local = fixture();
    const map: MapContract = {
      schemaVersion: 1,
      kind: "journey-map",
      id: "notes",
      title: "Notes",
      goal: "Explain the flow",
      sources: [],
      nodes: [
        {
          id: "step",
          kind: "action",
          label: "Review",
          description: "Context for the reviewer",
          origin: "proposed",
        },
      ],
      edges: [],
      requirements: [],
      findings: [],
      presentation: {
        fontFamily: "Test Sans",
      },
    };
    const native = drawingFromPlan(buildMapDrawingPlan(map));
    const first = await publishMap(local.client, target, native, {
      apply: true,
      journal: await journal(),
      layout: false,
      export: false,
    });
    const glyph = first.projection.shapes.find((shape) => shape.role === "icon")!;
    (
      local.shapes.find((shape) => shape.id === glyph.shapeId)! as unknown as {
        content: string;
      }
    ).content = "M0 0 C1 1 2 2 3 3";
    const heading = first.projection.shapes.find((shape) => shape.role === "annotation-id")!;
    local.shapes.find((shape) => shape.id === heading.shapeId)!.characters =
      "Approved by someone else";
    const imported = importMapProposal(
      native,
      await readProjection(local.client, target, native.mapId),
      first.projection,
    );
    expect(
      imported.findings.some((message) => message.includes("Unrecognized or missing native icon")),
    ).toBe(true);
    expect(
      imported.findings.some((message) => message.includes("Derived annotation label changed")),
    ).toBe(true);
    expect(imported.changes).toEqual([]);
    expect(
      nativeMapTextEntries(native).some(
        (text) => text.role === "description" && text.text === "Context for the reviewer",
      ),
    ).toBe(true);
  });
  it("fingerprints rounded corners and opacity so decorative edits cannot reuse prior evidence", async () => {
    const local = fixture();
    const map: MapContract = {
      schemaVersion: 1,
      kind: "journey-map",
      id: "style",
      title: "Style",
      goal: "Keep styling evidence exact",
      sources: [],
      nodes: [
        {
          id: "screen",
          kind: "screen",
          label: "Entry",
          origin: "proposed",
        },
      ],
      edges: [],
      requirements: [],
      findings: [],
      presentation: {
        fontFamily: "Test Sans",
      },
    };
    const native = drawingFromPlan(buildMapDrawingPlan(map));
    const first = await publishMap(local.client, target, native, {
      apply: true,
      journal: await journal(),
      layout: false,
      export: false,
    });
    const card = local.shapes.find(
      (shape) =>
        shape.id === first.projection.shapes.find((shape) => shape.role === "node")!.shapeId,
    )!;
    Object.assign(card, {
      borderRadiusTopLeft: 0,
      opacity: 0.5,
      blendMode: "multiply",
    });
    const observed = await readProjection(local.client, target, native.mapId);
    expect(observed.fingerprint).not.toBe(first.projection.fingerprint);
    expect(
      verificationProblems(native, observed).some((problem) =>
        problem.includes("rounded corners differ"),
      ),
    ).toBe(true);
    expect(
      verificationProblems(native, observed).some((problem) =>
        problem.includes("opacity/blend differs"),
      ),
    ).toBe(true);
    expect(() => createMapPresentationProposal(map, native, observed, first.projection)).toThrow(
      "style or ownership",
    );
    await expect(
      publishMap(local.client, target, native, {
        apply: true,
        journal: await journal(),
        layout: false,
        export: false,
        expected: first.projection,
      }),
    ).rejects.toThrow("matching prior projection");
  });
});

describe("measured two-line native card titles", () => {
  it("reserves room for observed 34px Inter titles without overlapping summaries and rejects actual overflow", async () => {
    const local = fixture();
    const native: MapDrawing = {
      ...drawing,
      nodes: drawing.nodes.map((node) => ({
        ...node,
        height: mapCardAnchorHeight,
        cardTitle: "Proposed /poc/welcome",
        cardSummary: "A compact summary",
      })),
    };
    const publication = await publishMap(local.client, target, native, {
      apply: true,
      journal: await journal(),
      layout: false,
      export: false,
    });
    const observed = structuredClone(publication.projection);
    const label = observed.shapes.find(
      (shape) => shape.role === "label" && shape.logicalId === "form",
    )!;
    label.height = 34;
    expect(verificationProblems(native, observed)).toEqual([]);
    const entries = nativeMapTextEntries(native);
    const labelEntry = entries.find(
      (entry) => entry.role === "label" && entry.logicalId === "form",
    )!;
    const summaryEntry = entries.find(
      (entry) => entry.role === "summary" && entry.logicalId === "form",
    )!;
    expect(labelEntry.y + labelEntry.height).toBeLessThan(summaryEntry.y);
    const card = observed.shapes.find(
      (shape) => shape.role === "node" && shape.logicalId === "form",
    )!;
    label.height = card.height + 1;
    expect(verificationProblems(native, observed)).toContain(
      "Node label exceeds card bounds: form",
    );
  });
});
