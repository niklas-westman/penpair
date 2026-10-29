import { createHash } from "node:crypto";
import { mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { observationHash } from "../src/journal.js";
import {
  acceptMapProposal,
  buildMapContext,
  buildMapDrawingPlan,
  mapCardAnchorHeight,
  mapCardHeight,
  mapCardWidth,
  mapCardTitleLimit,
  mapCardSummaryLimit,
  createArtifactReview,
  createMapProposal,
  findArtifactReview,
  hashMapContract,
  mapAnnotationLayout,
  mapDrawingGeometryProblems,
  observeMapSources,
  readArtifactReviews,
  readMapContract,
  readMapProposal,
  renderMapMarkdown,
  renderMapMermaid,
  validateArtifactReview,
  validateMapContract,
  validateMapDetail,
  validateMapProposal,
  verifyArtifactReviewEvidence,
  writeArtifactReview,
  writeMapContract,
  writeMapProposal,
  type MapContract,
} from "../src/maps/index.js";

const digest = (value: string): string => createHash("sha256").update(value).digest("hex");

function journey(): MapContract {
  return {
    schemaVersion: 1,
    kind: "journey-map",
    id: "account-entry",
    title: "Account entry",
    goal: "Allow a person to enter their account",
    sources: [],
    nodes: [
      {
        id: "form",
        label: "Enter credentials",
        kind: "screen",
        origin: "proposed",
        requirementIds: [
          "sign-in",
        ],
      },
      {
        id: "home",
        label: "Open account",
        kind: "screen",
        origin: "owner-decision",
      },
    ],
    edges: [
      {
        id: "submit",
        from: "form",
        to: "home",
        label: "Successful submit",
        origin: "proposed",
        requirementIds: [
          "sign-in",
        ],
      },
    ],
    requirements: [
      {
        id: "sign-in",
        text: "Submit an explicit identity",
        origin: "owner-decision",
      },
    ],
    findings: [],
  };
}

function reviewFor(map: MapContract) {
  return createArtifactReview({
    artifactKind: map.kind,
    artifactId: map.id,
    artifactHash: hashMapContract(map),
    by: "Design owner",
    note: "I approve this exact journey contract.",
  });
}

describe("canonical map contracts", () => {
  it("keeps legacy hashes stable and validates optional bounded semantic metadata", () => {
    const legacy = journey();
    expect(hashMapContract(legacy)).toBe(observationHash(legacy));
    expect(validateMapContract(legacy)).toEqual(legacy);
    const map = journey();
    map.summary = "A short introduction";
    map.description = "Detailed map context";
    map.nodes[0]!.summary = "Request access";
    map.nodes[0]!.description = "A longer explanation of the responsible step";
    map.nodes[0]!.icon = "screen";
    expect(validateMapContract(map)).toEqual(map);
    expect(hashMapContract(map)).not.toBe(hashMapContract(legacy));
    expect(() =>
      validateMapContract({
        ...map,
        summary: "x".repeat(241),
      }),
    ).toThrow(/240/);
    expect(() =>
      validateMapContract({
        ...map,
        nodes: [
          {
            ...map.nodes[0],
            icon: "https://asset.invalid/icon.svg",
          },
        ],
      }),
    ).toThrow(/semantic icon/);
    expect(() =>
      validateMapContract({
        ...map,
        nodes: [
          {
            ...map.nodes[0],
            description: "x".repeat(4001),
          },
        ],
      }),
    ).toThrow(/4000/);
  });
  it("canonicalizes ordering without changing meaning and keeps evidence origins explicit", () => {
    const map = journey();
    const reordered = structuredClone(map);
    reordered.nodes.reverse();
    expect(hashMapContract(reordered)).toBe(hashMapContract(map));
    expect(validateMapContract(map).nodes[0]!.origin).toBe("proposed");
    reordered.nodes[0]!.label = "Different intended outcome";
    expect(hashMapContract(reordered)).not.toBe(hashMapContract(map));
  });

  it("refuses dangling nodes, requirements, sources and duplicate logical identities", () => {
    const map = journey();
    expect(() =>
      validateMapContract({
        ...map,
        nodes: [
          ...map.nodes,
          map.nodes[0],
        ],
      }),
    ).toThrow(/Duplicate node/);
    expect(() =>
      validateMapContract({
        ...map,
        edges: [
          {
            ...map.edges[0],
            to: "missing",
          },
        ],
      }),
    ).toThrow(/missing node/);
    expect(() =>
      validateMapContract({
        ...map,
        requirements: [],
      }),
    ).toThrow(/missing requirement/);
    expect(() =>
      validateMapContract({
        ...map,
        nodes: [
          {
            ...map.nodes[0],
            sourceIds: [
              "missing",
            ],
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      validateMapContract({
        ...map,
        nodes: map.nodes.map((node) => ({
          ...node,
          origin: "observed",
        })),
      }),
    ).toThrow(/explicit source/);
  });

  it("refuses unversioned fields, unresolved resolutions, unsafe paths and size budgets", () => {
    const map = journey();
    expect(() =>
      validateMapContract({
        ...map,
        approved: true,
      }),
    ).toThrow(/unsupported field/);
    expect(() =>
      validateMapContract({
        ...map,
        sources: [
          {
            id: "source",
            kind: [
              "inspection",
            ],
            sha256: digest("source"),
          },
        ],
      }),
    ).toThrow(/source kind/);
    expect(() =>
      validateMapContract({
        ...map,
        findings: [
          {
            id: "blocked",
            message: "Unknown outcome",
            severity: [
              "blocking",
            ],
            status: "open",
          },
        ],
      }),
    ).toThrow(/severity/);
    expect(() =>
      validateMapContract({
        ...map,
        findings: [
          {
            id: "missing",
            message: "Missing outcome",
            severity: "blocking",
            status: "resolved",
          },
        ],
      }),
    ).toThrow(/resolution/);
    expect(() =>
      validateMapContract({
        ...map,
        sources: [
          {
            id: "outside",
            kind: "other",
            path: "../outside",
            sha256: digest("source"),
          },
        ],
      }),
    ).toThrow(/inside/);
    expect(() =>
      validateMapContract({
        ...map,
        nodes: Array.from(
          {
            length: 1001,
          },
          (_, index) => ({
            ...map.nodes[0],
            id: `node-${index}`,
          }),
        ),
      }),
    ).toThrow(/1000/);
    expect(() =>
      validateMapContract({
        ...map,
        goal: "x".repeat(17 * 1024 * 1024),
      }),
    ).toThrow(/16 MiB/);
  });

  it("validates worked examples and their canonical journey link", async () => {
    const root = new URL("../../../examples/design-release-maps/", import.meta.url);
    const source = validateMapContract(
      JSON.parse(await readFile(new URL("journey.json", root), "utf8")),
    );
    const integration = validateMapContract(
      JSON.parse(await readFile(new URL("integration.json", root), "utf8")),
    );
    expect(integration.journey?.sha256).toBe(hashMapContract(source));
    expect(buildMapContext(source).ready).toBe(false);
    expect(buildMapContext(integration).ready).toBe(false);
  });
});

describe("map render projections", () => {
  it("keeps full semantic text outside compact flow cards and in every textual projection", () => {
    const map = journey();
    map.goal = "Full goal ".repeat(90);
    map.summary = "Short map introduction";
    map.description = "Full map description";
    map.nodes[0]!.label = "A legacy node title that must remain available in full";
    map.nodes[0]!.summary = "A sufficiently detailed short summary requiring its full annotation";
    map.nodes[0]!.description = "A complete explanation of the step and its boundaries";
    map.nodes[0]!.icon = "action";
    const plan = buildMapDrawingPlan(map);
    const node = plan.nodes.find((entry) => entry.id === "form")!;
    expect(node.width).toBe(mapCardWidth);
    expect(node.height).toBe(mapCardAnchorHeight);
    expect(node.cardTitle.length).toBeLessThanOrEqual(mapCardTitleLimit);
    expect(node.cardSummary!.length).toBeLessThanOrEqual(mapCardSummaryLimit);
    expect(node.label).toBe(map.nodes[0]!.label);
    const annotation = plan.annotations.find((entry) => entry.nodeId === "form")!;
    expect(annotation.title).toBe(node.label);
    expect(annotation.summary).toBe(node.summary);
    expect(annotation.description).toBe(node.description);
    expect(annotation.y).toBeGreaterThan(
      Math.max(...plan.nodes.map((entry) => entry.y + entry.height)),
    );
    expect(plan.annotations.find((entry) => entry.id === "map:details")!.goal).toBe(map.goal);
    expect(plan.headerSummary).toBe(map.summary);
    expect(plan.nodes.every((entry) => entry.y > plan.header.height)).toBe(true);
    expect(plan.complete).toBe(true);
    const context = buildMapContext(map);
    expect(context.description).toBe(map.description);
    expect(context.nodes[0]).toMatchObject(map.nodes[0]!);
    for (const rendered of [
      renderMapMarkdown(map),
      renderMapMermaid(map),
    ]) {
      expect(rendered).toContain(map.description);
      expect(rendered).toContain(map.nodes[0]!.description);
      expect(rendered).toContain(map.nodes[0]!.summary);
    }
    expect(
      createMapProposal(journey(), map, "Add complete descriptive context").proposedMap,
    ).toEqual(map);
  });
  it("reserves independent label corridors on the actual journey and integration examples", async () => {
    const root = new URL("../../../examples/design-release-maps/", import.meta.url);
    for (const name of [
      "journey.json",
      "integration.json",
    ]) {
      const contract = validateMapContract(JSON.parse(await readFile(new URL(name, root), "utf8")));
      const plan = buildMapDrawingPlan(contract);
      expect(plan.reasons).toEqual([]);
      expect(plan.complete).toBe(true);
      expect(plan.nodes.every((node) => node.y >= 180)).toBe(true);
      if (name === "journey.json") {
        expect(plan.height).toBeLessThanOrEqual(3200);
        const notes = plan.annotations.filter((annotation) => annotation.nodeId);
        expect(new Set(notes.map((annotation) => annotation.x)).size).toBe(2);
        expect(notes.every((annotation) => annotation.width === 548)).toBe(true);
        for (const annotation of plan.annotations) {
          const layout = mapAnnotationLayout(annotation);
          expect(annotation.height).toBe(layout.height);
          expect(
            layout.fields.every((field) => field.y + field.height <= annotation.height - 6),
          ).toBe(true);
          expect(
            plan.annotations.some(
              (other) =>
                other.id !== annotation.id &&
                annotation.x < other.x + other.width &&
                other.x < annotation.x + annotation.width &&
                annotation.y < other.y + other.height &&
                other.y < annotation.y + annotation.height,
            ),
          ).toBe(false);
        }
        const entry = plan.nodes.find((node) => node.id === "address-entry")!;
        const confirmation = plan.nodes.find((node) => node.id === "confirmation")!;
        const error = plan.nodes.find((node) => node.id === "recoverable-error")!;
        const success = plan.edges.find((edge) => edge.id === "request-success")!;
        expect(confirmation.x).toBeGreaterThan(entry.x);
        expect(confirmation.y).toBe(entry.y);
        expect(error.y).toBeGreaterThan(entry.y);
        expect(success.points).toEqual([
          {
            x: entry.x + entry.width,
            y: entry.y + entry.height / 2,
          },
          {
            x: confirmation.x,
            y: confirmation.y + confirmation.height / 2,
          },
        ]);
        expect(success.labelBox.y + success.labelBox.height).toBeLessThan(success.points[0]!.y);
      }
      for (const edge of plan.edges) {
        const label = edge.labelBox;
        for (const node of plan.nodes) {
          const overlaps =
            label.x < node.x + node.width &&
            node.x < label.x + label.width &&
            label.y < node.y + node.height &&
            node.y < label.y + label.height;
          expect(overlaps, `${name}: label ${edge.id} intersects card ${node.id}`).toBe(false);
        }
        for (const other of plan.edges.filter(
          (candidate) => candidate.id !== edge.id && candidate.to !== edge.to,
        )) {
          for (let index = 1; index < edge.points.length; index++) {
            const from = edge.points[index - 1]!;
            const to = edge.points[index]!;
            for (let otherIndex = 1; otherIndex < other.points.length; otherIndex++) {
              const otherFrom = other.points[otherIndex - 1]!;
              const otherTo = other.points[otherIndex]!;
              const sharedVertical =
                from.x === to.x &&
                otherFrom.x === otherTo.x &&
                from.x === otherFrom.x &&
                Math.min(from.y, to.y) < Math.max(otherFrom.y, otherTo.y) &&
                Math.min(otherFrom.y, otherTo.y) < Math.max(from.y, to.y);
              expect(
                sharedVertical,
                `${name}: unrelated edges ${edge.id}/${other.id} share a vertical trunk`,
              ).toBe(false);
            }
          }
        }
      }
      const collision = structuredClone(plan.edges);
      collision[0]!.labelBox = {
        ...plan.nodes[0]!,
      };
      expect(
        mapDrawingGeometryProblems(plan.nodes, collision).some((problem) =>
          problem.includes("overlaps a card"),
        ),
      ).toBe(true);
    }
  });

  it("renders hostile labels as literal diagram data rather than directives", () => {
    const map = journey();
    map.nodes[0]!.label =
      '\"]\nclick node0 "https://host.invalid"\n```mermaid\n%%{init:{}}%%<script>';
    const mermaid = renderMapMermaid(map);
    expect(mermaid).not.toContain("\nclick");
    expect(mermaid).not.toContain("```");
    expect(mermaid).not.toContain("<script>");
    const markdown = renderMapMarkdown(map);
    expect(markdown).toContain(hashMapContract(map));
    expect(markdown).toContain("untrusted-design-data");
  });

  it("layers dependencies, preserves cycle edges and marks oversized drawings incomplete", () => {
    const map = journey();
    const plan = buildMapDrawingPlan(map);
    expect(plan.fontFamily).toBe("Inter");
    expect(plan.complete).toBe(true);
    expect(plan.nodes.find((node) => node.id === "home")!.x).toBeGreaterThan(
      plan.nodes.find((node) => node.id === "form")!.x,
    );
    map.edges.push({
      id: "retry",
      from: "home",
      to: "form",
      label: "Sign out",
      origin: "owner-decision",
    });
    const cyclic = buildMapDrawingPlan(map);
    expect(cyclic.edges).toHaveLength(2);
    expect(cyclic.nodes[0]!.x).toBeLessThan(cyclic.nodes[1]!.x);
    expect(cyclic.edges.find((edge) => edge.id === "retry")!.labelBox.y).toBeGreaterThan(
      Math.max(...cyclic.nodes.map((node) => node.y + node.height)),
    );
    expect(buildMapDrawingPlan(map)).toEqual(cyclic);
    const oversized = journey();
    oversized.nodes = Array.from(
      {
        length: 100,
      },
      (_, index) => ({
        id: `node-${index}`,
        label: "Step",
        kind: "screen",
        origin: "proposed",
      }),
    );
    oversized.edges = [];
    expect(buildMapDrawingPlan(oversized).complete).toBe(false);
    expect(buildMapDrawingPlan(oversized).nodes).toHaveLength(100);
    const largeLabels = journey();
    largeLabels.nodes = Array.from(
      {
        length: 80,
      },
      (_, index) => ({
        id: `node-${index}`,
        label: "Long label ".repeat(90),
        kind: "step",
        origin: "proposed",
      }),
    );
    largeLabels.edges = Array.from(
      {
        length: 72,
      },
      (_, index) => ({
        id: `edge-${index}`,
        from: `node-${index}`,
        to: `node-${index + 8}`,
        label: "Continue",
        origin: "proposed",
      }),
    );
    const bounded = buildMapDrawingPlan(largeLabels);
    expect(bounded.width).toBeLessThan(16384);
    expect(bounded.annotations).toHaveLength(80);
    expect(bounded.annotations[0]!.title).toBe(largeLabels.nodes[0]!.label);
    expect(bounded.complete).toBe(false);
    expect(bounded.reasons.join(" ")).toContain("64 KiB");
  });
});

describe("exact artifact reviews and map proposals", () => {
  it("requires actual supplied owner words and detects modified review evidence", () => {
    const map = journey();
    const review = reviewFor(map);
    expect(
      findArtifactReview(
        [
          review,
        ],
        map.kind,
        map.id,
        hashMapContract(map),
      ),
    ).toEqual(review);
    expect(() =>
      validateArtifactReview({
        ...review,
        note: "Invented replacement words",
      }),
    ).toThrow(/hash/);
    expect(() =>
      createArtifactReview({
        artifactKind: map.kind,
        artifactId: map.id,
        artifactHash: hashMapContract(map),
        by: "",
        note: "",
      }),
    ).toThrow(/identity/);
    map.nodes[0]!.label = "Changed behavior";
    expect(
      findArtifactReview(
        [
          review,
        ],
        map.kind,
        map.id,
        hashMapContract(map),
      ),
    ).toBeUndefined();
  });

  it("accepts a semantic proposal as an unapproved revision and refuses stale or altered proposals", () => {
    const current = journey();
    const reviews = [
      reviewFor(current),
    ];
    const proposed = structuredClone(current);
    proposed.nodes[0]!.label = "Choose another identity";
    const proposal = createMapProposal(current, proposed, "Designer changed the entry step");
    const accepted = acceptMapProposal(current, proposal);
    expect(accepted).toEqual(validateMapContract(proposed));
    expect(
      buildMapContext(accepted, {
        reviews,
      }).reviewed,
    ).toBe(false);
    expect(
      buildMapContext(current, {
        reviews,
      }).reviewed,
    ).toBe(true);
    expect(() => acceptMapProposal(accepted, proposal)).toThrow(/stale/);
    expect(() =>
      validateMapProposal({
        ...proposal,
        reason: "Altered",
      }),
    ).toThrow(/hash/);
    expect(() => createMapProposal(current, current, "Nothing changed")).toThrow(/semantic/);
    expect(current.nodes[0]!.label).toBe("Enter credentials");
  });
});

describe("bounded map context", () => {
  it("retains explicit detail handoffs without borrowing child approval", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "penpair-map-detail-"));
    const child = {
      ...journey(),
      id: "credential-detail",
    };
    const bytes = `${JSON.stringify(child, null, 2)}\n`;
    await writeFile(path.join(root, "detail.json"), bytes);
    const parent: MapContract = {
      ...journey(),
      nodes: [
        {
          id: "details",
          label: "Credential details",
          kind: "detail-link",
          origin: "owner-decision",
          requirementIds: [
            "sign-in",
          ],
          sourceIds: [
            "child",
          ],
        },
      ],
      edges: [],
      sources: [
        {
          id: "child",
          kind: "contract",
          path: "detail.json",
          sha256: digest(bytes),
          fileId: "file",
          pageId: "detail-page",
          frameId: "detail-board",
        },
      ],
    };
    expect(buildMapDrawingPlan(parent).complete).toBe(false);
    const observation = await observeMapSources(root, parent);
    const plan = buildMapDrawingPlan(parent, observation.detailMaps);
    expect(plan.complete).toBe(true);
    expect(plan.nodes[0]!.detail?.mapId).toBe("journey-map:credential-detail");
    expect(plan.nodes[0]!.detail?.contractHash).toBe(hashMapContract(child));
    expect(renderMapMarkdown(parent)).toContain("Linked detail contracts");
    expect(renderMapMarkdown(parent)).toContain("[detail.json](<./detail.json>)");
    const reviews = [
      reviewFor(parent),
    ];
    const context = buildMapContext(parent, {
      ...observation,
      reviews,
    });
    expect(context.reviewed).toBe(true);
    expect(context.ready).toBe(false);
    expect(context.details[0]).toMatchObject({
      path: "detail.json",
      mapId: child.id,
      review: "separate-artifact",
      contents: "not-inlined",
      ready: false,
    });
    expect(
      buildMapContext(parent, {
        ...observation,
        reviews,
        detailReadiness: {
          child: true,
        },
      }).ready,
    ).toBe(true);
    expect(() => validateMapDetail(parent, parent.nodes[0]!, parent)).toThrow(/different contract/);
    expect(() =>
      validateMapDetail(parent, parent.nodes[0]!, {
        ...child,
        requirements: [],
        nodes: child.nodes.map((node) => ({
          ...node,
          requirementIds: [],
        })),
        edges: [],
      }),
    ).toThrow(/omits/);
    const staleBytes = "not-json private-sentinel";
    await writeFile(path.join(root, "detail.json"), staleBytes);
    const stale = await observeMapSources(root, parent);
    expect(stale.detailMaps.child).toBeUndefined();
    expect(
      buildMapContext(parent, {
        ...stale,
        reviews,
      }).freshness,
    ).toBe("stale");
    parent.sources[0]!.sha256 = digest(staleBytes);
    await expect(observeMapSources(root, parent)).rejects.toThrow(
      "Linked detail contract is not valid JSON; no source text was included",
    );
  });

  it("keeps source freshness, contract approval and implementation verification separate", () => {
    const map = journey();
    map.sources = [
      {
        id: "source",
        kind: "inspection",
        path: "design/source.json",
        sha256: digest("source"),
      },
    ];
    const reviews = [
      reviewFor(map),
    ];
    expect(
      buildMapContext(map, {
        reviews,
      }).freshness,
    ).toBe("unassessed");
    const current = buildMapContext(map, {
      reviews,
      sourceHashes: {
        source: digest("source"),
      },
    });
    expect(current.ready).toBe(true);
    expect(current.implementation).toBe("not-assessed");
    const stale = buildMapContext(map, {
      reviews,
      sourceHashes: {
        source: digest("changed"),
      },
    });
    expect(stale.reviewed).toBe(true);
    expect(stale.ready).toBe(false);
    expect(stale.freshness).toBe("stale");
    expect(
      buildMapContext(map, {
        reviews,
        reviewEvidenceValid: false,
      }).reviewed,
    ).toBe(false);
  });

  it("retains blocking decisions even when context is truncated", () => {
    const map = journey();
    map.findings = [
      {
        id: "blocked",
        message: "An outcome is unresolved",
        severity: "blocking",
        status: "open",
      },
    ];
    map.nodes = Array.from(
      {
        length: 100,
      },
      (_, index) => ({
        id: `step-${index}`,
        label: "Detail ".repeat(100),
        kind: "screen",
        origin: "proposed",
      }),
    );
    map.edges = [];
    const context = buildMapContext(map, {
      reviews: [
        reviewFor(map),
      ],
      maxItems: 10,
      maxBytes: 4096,
    });
    expect(Buffer.byteLength(JSON.stringify(context))).toBeLessThanOrEqual(4096);
    expect(context.truncated).toBe(true);
    expect(context.ready).toBe(false);
    expect(context.reasons.join(" ")).toContain("blocked");
  });

  it("requires integration journey binding and invalidates changed journey input", () => {
    const map = {
      ...journey(),
      kind: "integration-map" as const,
    };
    expect(
      buildMapContext(map, {
        reviews: [
          reviewFor(map),
        ],
      }).ready,
    ).toBe(false);
    const linked = {
      ...map,
      journey: {
        path: "design/journey.json",
        sha256: hashMapContract(journey()),
      },
    };
    const reviews = [
      reviewFor(linked),
    ];
    expect(
      buildMapContext(linked, {
        reviews,
        journeyHash: linked.journey.sha256,
        journeyRequirementIds: [
          "sign-in",
        ],
      }).ready,
    ).toBe(true);
    expect(
      buildMapContext(linked, {
        reviews,
        journeyHash: digest("changed"),
      }).freshness,
    ).toBe("stale");
  });
});

describe("project-owned map storage", () => {
  it("blocks silently omitted journey requirements and unlinked local requirements", () => {
    const source = journey();
    source.requirements.push({
      id: "recover",
      text: "Recover a rejected identity",
      origin: "owner-decision",
    });
    const sourceContext = buildMapContext(source, {
      reviews: [
        reviewFor(source),
      ],
    });
    expect(sourceContext.ready).toBe(false);
    expect(sourceContext.reasons.join(" ")).toContain("unmapped local requirement");
    const integration: MapContract = {
      ...journey(),
      kind: "integration-map",
      journey: {
        path: "journey.json",
        sha256: hashMapContract(source),
      },
    };
    const context = buildMapContext(integration, {
      reviews: [
        reviewFor(integration),
      ],
      journeyHash: hashMapContract(source),
      journeyRequirementIds: source.requirements.map((requirement) => requirement.id),
    });
    expect(context.ready).toBe(false);
    expect(context.reasons.join(" ")).toContain("omitted journey requirement");
    expect(context.reasons.join(" ")).toContain("recover");
  });

  it("refuses path and symlink escapes and preserves changed canonical revisions", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "penpair-map-"));
    const outside = await mkdtemp(path.join(os.tmpdir(), "penpair-map-outside-"));
    const map = journey();
    await writeMapContract(root, "journey.json", map);
    expect(await readMapContract(root, "journey.json")).toEqual(validateMapContract(map));
    await expect(writeMapContract(root, "../escaped.json", map)).rejects.toThrow(/inside/);
    await symlink(outside, path.join(root, "escape"));
    await expect(writeMapContract(root, "escape/journey.json", map)).rejects.toThrow(/outside/);
    const changed = structuredClone(map);
    changed.goal = "A revised goal";
    await expect(
      writeMapContract(root, "journey.json", changed, {
        replace: true,
        expectedHash: digest("wrong"),
      }),
    ).rejects.toThrow(/changed/);
    expect(hashMapContract(await readMapContract(root, "journey.json"))).toBe(hashMapContract(map));
    await writeMapContract(root, "journey.json", changed, {
      replace: true,
      expectedHash: hashMapContract(map),
    });
    expect(hashMapContract(await readMapContract(root, "journey.json"))).toBe(
      hashMapContract(changed),
    );
    await expect(
      writeMapContract(root, "other.json", map, {
        redact: () => "redacted",
      }),
    ).rejects.toThrow(/redaction/);
  });

  it("appends exact reviews idempotently and independently checks rendered evidence bytes", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "penpair-map-review-"));
    const map = journey();
    await writeFile(path.join(root, "render.md"), renderMapMarkdown(map));
    const review = createArtifactReview({
      artifactKind: map.kind,
      artifactId: map.id,
      artifactHash: hashMapContract(map),
      by: "Owner",
      note: "Approved after reviewing this render",
      artifacts: [
        {
          path: "render.md",
          sha256: digest(renderMapMarkdown(map)),
        },
      ],
    });
    await writeArtifactReview(root, "reviews.json", review);
    await writeArtifactReview(root, "reviews.json", review);
    expect(await readArtifactReviews(root, "reviews.json")).toEqual([
      review,
    ]);
    await writeFile(path.join(root, "render.md"), "Changed evidence");
    expect(await verifyArtifactReviewEvidence(root, review)).toBe(false);
    await expect(writeArtifactReview(root, "reviews.json", review)).rejects.toThrow(
      /bytes changed/,
    );
    expect(await readArtifactReviews(root, "reviews.json")).toEqual([
      review,
    ]);
  });

  it("round-trips proposals and checks declared source bytes plus canonical journey identity", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "penpair-map-source-"));
    const map = journey();
    await writeMapContract(root, "journey.json", map);
    const proposed = structuredClone(map);
    proposed.title = "New proposal title";
    const proposal = createMapProposal(map, proposed, "Clarify title");
    await writeMapProposal(root, "proposal.json", proposal);
    expect(await readMapProposal(root, "proposal.json")).toEqual(proposal);
    await writeFile(path.join(root, "source.json"), "source");
    const integration: MapContract = {
      ...map,
      kind: "integration-map",
      journey: {
        path: "journey.json",
        sha256: hashMapContract(map),
      },
      sources: [
        {
          id: "capture",
          kind: "inspection",
          path: "source.json",
          sha256: digest("source"),
        },
      ],
    };
    const observations = await observeMapSources(root, integration);
    expect(observations.journeyHash).toBe(hashMapContract(map));
    expect(observations.sourceHashes.capture).toBe(digest("source"));
    await writeFile(path.join(root, "source.json"), "changed");
    expect(buildMapContext(integration, await observeMapSources(root, integration)).freshness).toBe(
      "stale",
    );
  });
});
