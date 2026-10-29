import { loadReleaseComparison } from "../src/design-releases/comparison-proof.js";
import { createArtifactReview } from "../src/maps/review.js";
import { releaseReferences } from "../src/design-releases/check.js";
import { validateReleaseMembership } from "../src/design-releases/membership.js";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { planRelease } from "../src/design-releases/store.js";
import { adoptRelease } from "../src/design-releases/membership.js";
import { hashMapContract } from "../src/maps/validation.js";
import type { MapContract } from "../src/maps/types.js";
import { describe, expect, it } from "vitest";
import { observationHash } from "../src/journal.js";
import {
  hashDesignRelease,
  validateDesignRelease,
  validateReleasePlan,
} from "../src/design-releases/validation.js";
import { validateAdoptionPlan } from "../src/design-releases/membership-validation.js";
import { releaseMembers, resolveReleaseMemberChanges } from "../src/design-releases/membership.js";
import type {
  DesignRelease,
  ReleaseMember,
  DeltaDesignReleasePlanInput,
} from "../src/design-releases/types.js";

const reference = {
  path: "design/original.json",
  sha256: "a".repeat(64),
};

function member(id: string, disposition: ReleaseMember["disposition"] = "changed"): ReleaseMember {
  return {
    id,
    disposition,
    source: {
      id,
      label: id,
      pageId: "older-page",
      frameId: `${id}-frame`,
      inspection: reference,
      render: {
        ...reference,
        path: "design/original.png",
      },
      contentHash: "b".repeat(64),
    },
    ...(disposition === "retained"
      ? {
          origin: {
            releaseId: "earlier-release",
            productVersion: "1.0.0",
            bundle: reference,
          },
        }
      : {}),
  };
}

function plan(): DeltaDesignReleasePlanInput {
  const source = member("login").source;
  const { contentHash: _hash, ...screen } = source;
  return {
    schemaVersion: 2,
    kind: "design-release-plan",
    id: "next-release",
    title: "Next release",
    productVersion: "1.0.1",
    fileId: "file",
    base: {
      release: reference,
      bundle: reference,
    },
    changes: {
      add: [
        screen,
      ],
      replace: [],
      remove: [],
    },
    contracts: [
      reference,
    ],
  };
}

function release(members: ReleaseMember[]): DesignRelease {
  return {
    schemaVersion: 2,
    kind: "design-release",
    id: "next-release",
    title: "Next",
    productVersion: "1.0.1",
    fileId: "file",
    status: "planned",
    members,
    sources: members
      .filter((entry) => entry.disposition === "changed")
      .map((entry) => entry.source),
    memberEvidence: [],
    contracts: [
      {
        ...reference,
        kind: "journey-map",
        id: "journey",
      },
    ],
    target: {
      name: "release/1.0.1",
      ownerKey: observationHash({
        id: "next-release",
        productVersion: "1.0.1",
        fileId: "file",
      }),
    },
    receipts: [],
    maps: [],
    reviews: [],
    implementation: {
      status: "not-assessed",
      evidence: [],
    },
    createdAt: "2026-10-29T00:00:00.000Z",
  };
}

describe("native release membership", () => {
  it.each([
    -0.01,
    1.01,
    NaN,
    Infinity,
    "0.05",
    null,
  ])("rejects invalid approved comparison threshold %s", (threshold) => {
    const input = plan();
    Object.assign(input.changes.add[0]!, {
      comparisonThreshold: threshold,
    });
    expect(() => validateReleasePlan(input)).toThrow(/comparisonThreshold/);
    const candidate = release([
      member("login"),
    ]);
    Object.assign(candidate.members![0]!, {
      comparisonThreshold: threshold,
    });
    expect(() => validateDesignRelease(candidate)).toThrow(/comparisonThreshold/);
  });

  it.each([
    0,
    0.01,
    1,
  ])("preserves explicit comparison threshold %s in resolved membership", (comparisonThreshold) => {
    const input = plan();
    input.changes.add[0]!.comparisonThreshold = comparisonThreshold;
    const normalized = validateReleasePlan(input);
    expect(normalized.schemaVersion === 2 && normalized.changes.add[0]?.comparisonThreshold).toBe(
      comparisonThreshold,
    );
    const candidate = release([
      {
        ...member("login"),
        comparisonThreshold,
      },
    ]);
    expect(validateDesignRelease(candidate).members?.[0]?.comparisonThreshold).toBe(
      comparisonThreshold,
    );
  });

  it("binds the allowed comparison threshold to the reviewed release hash", () => {
    const original = release([
      {
        ...member("login"),
        comparisonThreshold: 0.01,
      },
    ]);
    const changed = structuredClone(original);
    changed.members![0]!.comparisonThreshold = 0.05;
    expect(hashDesignRelease(original)).not.toBe(hashDesignRelease(changed));
  });

  it("pins the default comparison threshold during normalization", () => {
    const normalized = validateReleasePlan(plan());
    expect(normalized.schemaVersion === 2 && normalized.changes.add[0]?.comparisonThreshold).toBe(
      0.05,
    );
    expect(
      validateDesignRelease(
        release([
          member("login"),
        ]),
      ).members?.[0]?.comparisonThreshold,
    ).toBe(0.05);
  });

  it("freezes additions, replacements and removals without mutating the previous inventory", () => {
    const previous = [
      member("login", "retained"),
      member("candidate", "retained"),
      member("obsolete", "retained"),
    ];
    const replacement = member("candidate");
    replacement.source.frameId = "new-candidate-frame";
    const resolved = resolveReleaseMemberChanges(previous, {
      add: [
        member("email"),
      ],
      replace: [
        replacement,
      ],
      remove: [
        {
          id: "obsolete",
          reason: "Retired route",
        },
      ],
    });
    expect(resolved.map((entry) => entry.id)).toEqual([
      "login",
      "candidate",
      "email",
    ]);
    expect(resolved[0]).toEqual(previous[0]);
    expect(resolved[1]?.source.frameId).toBe("new-candidate-frame");
    resolved[0]!.source.label = "Changed local draft";
    expect(previous[0]?.source.label).toBe("login");
    expect(previous).toHaveLength(3);
  });

  it("preserves stable historical identities through unchanged-only generations", () => {
    const original = [
      member("login", "retained"),
    ];
    const next = resolveReleaseMemberChanges(original, {
      add: [],
      replace: [],
      remove: [],
    });
    const later = resolveReleaseMemberChanges(next, {
      add: [],
      replace: [],
      remove: [],
    });
    expect(later).toEqual(original);
    expect(later[0]?.approval).toBeUndefined();
  });

  it.each([
    "add",
    "replace",
    "remove",
  ] as const)("rejects conflicting or unknown %s operations", (operation) => {
    const changes = {
      add: [] as ReleaseMember[],
      replace: [] as ReleaseMember[],
      remove: [] as Array<{
        id: string;
        reason: string;
      }>,
    };
    if (operation === "add") {
      changes.add.push(member("login"));
    }
    if (operation === "replace") {
      changes.replace.push(member("missing"));
    }
    if (operation === "remove") {
      changes.remove.push({
        id: "missing",
        reason: "Retired",
      });
    }
    expect(() =>
      resolveReleaseMemberChanges(
        [
          member("login", "retained"),
        ],
        changes,
      ),
    ).toThrow();
  });

  it("rejects multiple operations on the same member", () => {
    const input = plan();
    input.changes.replace = input.changes.add;
    expect(() => validateReleasePlan(input)).toThrow(/Duplicate/);
  });

  it("requires a pinned base for replacement or removal", () => {
    const input = plan();
    delete input.base;
    input.changes.replace = input.changes.add;
    input.changes.add = [];
    expect(() => validateReleasePlan(input)).toThrow(/pinned finalized base/);
  });

  it("reads a schema-2 retained-only draft with an empty copy-source list", () => {
    const input = release([
      member("login", "retained"),
    ]);
    const result = validateDesignRelease(input);
    expect(result.sources).toEqual([]);
    expect(releaseMembers(result)[0]?.source.pageId).toBe("older-page");
  });

  it("rejects a draft whose changed source list differs from its inventory", () => {
    const input = release([
      member("login"),
    ]);
    input.sources = [];
    expect(() => validateDesignRelease(input)).toThrow(/Changed release members/);
  });

  it("requires historical origins only for retained membership", () => {
    const input = release([
      member("login", "retained"),
    ]);
    delete input.members![0]!.origin;
    expect(() => validateDesignRelease(input)).toThrow(/historical origin/);
  });

  it("does not promote adoption to verified approval", () => {
    const input = plan();
    const adopted = validateAdoptionPlan({
      schemaVersion: 2,
      kind: "design-release-adoption",
      id: input.id,
      title: input.title,
      productVersion: input.productVersion,
      fileId: input.fileId,
      screens: input.changes.add,
      contracts: input.contracts,
    });
    expect(adopted.screens[0]?.approval).toBeUndefined();
    const draft = release([
      member("login", "adopted"),
    ]);
    expect(validateDesignRelease(draft).status).toBe("planned");
    draft.status = "verified";
    expect(() => validateDesignRelease(draft)).toThrow(/owner approval/);
  });

  it("requires independently bound continuity evidence for every retained member", () => {
    const input = release([
      member("login", "retained"),
    ]);
    input.memberEvidence = [
      {
        id: "wrong-case",
        inspection: reference,
        render: reference,
        contentHash: "b".repeat(64),
        decodedPixelsHash: "c".repeat(64),
        width: 1,
        height: 1,
      },
    ];
    expect(() => validateDesignRelease(input)).toThrow(/continuity evidence/);
  });

  it("rejects self-inheritance and duplicate source identities", () => {
    const input = release([
      member("login", "retained"),
    ]);
    input.members![0]!.origin!.releaseId = input.id;
    expect(() => validateDesignRelease(input)).toThrow(/inherit itself/);
    const duplicates = release([
      member("login"),
      member("email"),
    ]);
    duplicates.members![1]!.source.frameId = duplicates.members![0]!.source.frameId;
    expect(() => validateDesignRelease(duplicates)).toThrow(/Duplicate/);
  });

  it("preserves removal reasons and rejects contradictory frozen changes", () => {
    const input = release([
      member("login", "retained"),
    ]);
    input.changes = {
      added: [],
      replaced: [],
      removed: [
        {
          id: "obsolete",
          reason: "Feature retired",
        },
      ],
    };
    expect(validateDesignRelease(input).changes?.removed[0]?.reason).toBe("Feature retired");
    input.changes.added = [
      "missing",
    ];
    expect(() => validateDesignRelease(input)).toThrow(/do not match full membership/);
  });

  it("does not allow newer membership fields to alter a legacy record", () => {
    const input = release([
      member("login"),
    ]);
    input.schemaVersion = 1;
    expect(() => validateDesignRelease(input)).toThrow(/Legacy releases/);
  });
});

async function planningFixture() {
  const root = await mkdtemp(path.join(tmpdir(), "release-membership-"));
  const save = async (name: string, value: unknown) => {
    const bytes = Buffer.from(JSON.stringify(value));
    await writeFile(path.join(root, name), bytes);
    return {
      path: name,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  };
  const inspection = await save("screen.json", {
    schemaVersion: 1,
    kind: "shape-inspection",
    fileId: "file",
    pageId: "older-page",
    revision: 1,
    complete: true,
    counts: {
      visited: 1,
      returned: 1,
      total: 1,
    },
    reasons: [],
    producer: {
      name: "penpair",
      version: "test",
    },
    scope: {
      shapeId: "login-frame",
      fields: [
        "geometry",
        "text",
        "layout",
        "component",
        "tokens",
        "style",
        "metadata",
      ],
      depth: 1,
    },
    nodes: [
      {
        id: "login-frame",
        parentId: null,
        index: 0,
        depth: 0,
        name: "Login",
        type: "board",
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
            horizontalSizing: "fix",
            verticalSizing: "fix",
          },
          constraints: {
            constraintsHorizontal: null,
            constraintsVertical: null,
            fixedWhenScrolling: false,
          },
        },
        component: {},
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
  });
  const journey: MapContract = {
    schemaVersion: 1,
    kind: "journey-map",
    id: "journey",
    title: "Journey",
    goal: "Log in",
    sources: [],
    nodes: [
      {
        id: "login",
        kind: "screen",
        label: "Login",
        origin: "owner-decision",
        requirementIds: [
          "login-required",
        ],
      },
    ],
    edges: [],
    requirements: [
      {
        id: "login-required",
        text: "Login is required",
        origin: "owner-decision",
      },
    ],
    findings: [],
  };
  const journeyRef = await save("journey.json", journey);
  const integrationRef = await save("integration.json", {
    ...journey,
    kind: "integration-map",
    id: "integration",
    journey: {
      path: journeyRef.path,
      sha256: hashMapContract(journey),
    },
  });
  const source = {
    id: "login",
    label: "Login",
    pageId: "older-page",
    frameId: "login-frame",
    inspection,
  };
  return {
    root,
    source,
    contracts: [
      journeyRef,
      integrationRef,
    ],
    save,
  };
}

describe("release planning from original artifacts", () => {
  it("adopts an existing source without copying, manufacturing approval or mutating the input", async () => {
    const fixture = await planningFixture();
    try {
      const input = {
        schemaVersion: 2,
        kind: "design-release-adoption",
        id: "release",
        title: "Adopt existing",
        productVersion: "1.0.0",
        fileId: "file",
        screens: [
          fixture.source,
        ],
        contracts: fixture.contracts,
      };
      const before = JSON.stringify(input);
      const result = await adoptRelease(fixture.root, input);
      expect(result.status).toBe("planned");
      expect(result.sources).toEqual([]);
      expect(result.members?.[0]?.disposition).toBe("adopted");
      expect(result.members?.[0]?.source.frameId).toBe("login-frame");
      expect(result.members?.[0]?.approval).toBeUndefined();
      expect(result.memberEvidence).toEqual([]);
      expect(JSON.stringify(input)).toBe(before);
    } finally {
      await rm(fixture.root, {
        recursive: true,
        force: true,
      });
    }
  });

  it("plans a new full-inventory base using changed members and rejects modified inspection bytes", async () => {
    const fixture = await planningFixture();
    try {
      const input = {
        ...plan(),
        base: undefined,
        changes: {
          add: [
            {
              ...fixture.source,
              comparisonThreshold: 0.01,
            },
          ],
          replace: [],
          remove: [],
        },
        contracts: fixture.contracts,
      };
      const result = await planRelease(fixture.root, input);
      expect(result.sources[0]?.id).toBe("login");
      expect(result.members?.[0]?.comparisonThreshold).toBe(0.01);
      expect(result.members?.[0]?.source).toEqual(result.sources[0]);
      expect(result.changes?.added).toEqual([
        "login",
      ]);
      await writeFile(path.join(fixture.root, fixture.source.inspection.path), "{}");
      await expect(planRelease(fixture.root, input)).rejects.toThrow(/hash|bytes/i);
    } finally {
      await rm(fixture.root, {
        recursive: true,
        force: true,
      });
    }
  });

  it("rejects an unfinalized predecessor before inheritance", async () => {
    const fixture = await planningFixture();
    try {
      const predecessor = release([
        member("login", "adopted"),
      ]);
      const saved = await fixture.save("draft.json", predecessor);
      const input = {
        ...plan(),
        base: {
          release: saved,
          bundle: reference,
        },
      };
      await expect(planRelease(fixture.root, input)).rejects.toThrow(/exact finalized/);
    } finally {
      await rm(fixture.root, {
        recursive: true,
        force: true,
      });
    }
  });
});

async function lineageFixture() {
  const root = await mkdtemp(path.join(tmpdir(), "release-lineage-"));
  const save = async (name: string, value: unknown) => {
    const bytes = Buffer.from(JSON.stringify(value));
    await writeFile(path.join(root, name), bytes);
    return {
      path: name,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  };
  const adopted = member("login", "adopted");
  adopted.approval = {
    record: reference,
    recordId: "owner-review",
    image: reference,
  };
  const verified = release([
    adopted,
  ]);
  verified.id = "earlier-release";
  verified.productVersion = "1.0.0";
  verified.target = {
    name: "release/1.0.0",
    ownerKey: observationHash({
      id: verified.id,
      fileId: verified.fileId,
      productVersion: verified.productVersion,
    }),
  };
  verified.memberEvidence = [
    {
      id: "login",
      inspection: reference,
      render: reference,
      contentHash: "b".repeat(64),
      decodedPixelsHash: "c".repeat(64),
      width: 1,
      height: 1,
    },
  ];
  verified.fidelity = {
    schemaVersion: 1,
    kind: "design-release-fidelity",
    verifiedAt: "2026-10-29T00:00:00.000Z",
    receiptsHash: observationHash({
      receipts: verified.receipts,
      memberEvidence: verified.memberEvidence,
    }),
    exactDecodedPixels: true,
    nativeStructure: true,
  };
  verified.status = "verified";
  const candidate = validateDesignRelease(verified);
  const designHash = hashDesignRelease(candidate);
  const review = createArtifactReview({
    artifactKind: "design-release",
    artifactId: candidate.id,
    artifactHash: designHash,
    by: "Owner",
    note: "Reviewed this membership fixture",
  });
  const bundle = await save("bundle.json", {
    schemaVersion: 1,
    kind: "approved-design-release",
    designHash,
    release: candidate,
    review,
    artifacts: releaseReferences(candidate).map((original) => ({
      original,
      snapshot: original,
    })),
  });
  const final: DesignRelease = {
    ...candidate,
    status: "final",
    finalized: {
      bundle,
      markerHash: bundle.sha256,
      reviewHash: review.hash,
    },
  };
  const predecessor = await save("release.json", final);
  const inherited: ReleaseMember = {
    ...candidate.members![0]!,
    disposition: "retained",
    origin: {
      releaseId: candidate.id,
      productVersion: candidate.productVersion,
      bundle,
    },
  };
  const next = release([
    inherited,
  ]);
  next.base = {
    release: predecessor,
    bundle,
  };
  next.changes = {
    added: [],
    replaced: [],
    removed: [],
  };
  return {
    root,
    next,
  };
}

describe("persisted immediate release lineage", () => {
  it("requires retained members to name the immediate predecessor", async () => {
    await expect(
      validateReleaseMembership(
        "unused",
        release([
          member("login", "retained"),
        ]),
      ),
    ).rejects.toThrow(/immediate pinned base/);
  });

  it("validates unchanged membership against the pinned immediate predecessor", async () => {
    const fixture = await lineageFixture();
    try {
      await expect(validateReleaseMembership(fixture.root, fixture.next)).resolves.toBeUndefined();
      delete fixture.next.changes;
      await expect(validateReleaseMembership(fixture.root, fixture.next)).rejects.toThrow(
        /explicit changes/,
      );
    } finally {
      await rm(fixture.root, {
        recursive: true,
        force: true,
      });
    }
  });

  it.each([
    "source",
    "approval",
    "threshold",
    "route",
  ])("rejects a retained %s rewritten outside replacement", async (field) => {
    const fixture = await lineageFixture();
    try {
      const retained = fixture.next.members![0]!;
      if (field === "source") {
        retained.source.frameId = "another-frame";
      }
      if (field === "approval") {
        retained.approval!.recordId = "another-approval";
      }
      if (field === "threshold") {
        retained.comparisonThreshold = 0.5;
      }
      if (field === "route") {
        retained.route = "/unreviewed-route";
      }
      await expect(validateReleaseMembership(fixture.root, fixture.next)).rejects.toThrow(
        /immediate predecessor/,
      );
    } finally {
      await rm(fixture.root, {
        recursive: true,
        force: true,
      });
    }
  });

  it("rejects resurrecting an older member omitted by the immediate predecessor", async () => {
    const fixture = await lineageFixture();
    try {
      const resurrected = {
        ...member("retired", "retained"),
        origin: fixture.next.members![0]!.origin,
      };
      fixture.next.members!.push(resurrected);
      await expect(validateReleaseMembership(fixture.root, fixture.next)).rejects.toThrow(
        /immediate predecessor/,
      );
    } finally {
      await rm(fixture.root, {
        recursive: true,
        force: true,
      });
    }
  });

  it("rejects removing an ID absent from the immediate predecessor", async () => {
    const fixture = await lineageFixture();
    try {
      fixture.next.changes!.removed.push({
        id: "unknown",
        reason: "Not present",
      });
      await expect(validateReleaseMembership(fixture.root, fixture.next)).rejects.toThrow(
        /unknown release member/,
      );
    } finally {
      await rm(fixture.root, {
        recursive: true,
        force: true,
      });
    }
  });
});

describe("canonical release comparison loader", () => {
  it("rejects unfinalized records even when their supplied labels look usable", async () => {
    const fixture = await planningFixture();
    try {
      const record = await fixture.save(
        "unfinalized.json",
        release([
          member("login"),
        ]),
      );
      await expect(
        loadReleaseComparison(fixture.root, {
          record,
          bundle: reference,
        }),
      ).rejects.toThrow(/exact finalized record/);
    } finally {
      await rm(fixture.root, {
        recursive: true,
        force: true,
      });
    }
  });

  it("rejects mutated record bytes and a bundle different from the final pointer", async () => {
    const fixture = await lineageFixture();
    try {
      const bound = {
        record: fixture.next.base!.release,
        bundle: fixture.next.base!.bundle,
      };
      await expect(
        loadReleaseComparison(fixture.root, {
          ...bound,
          record: {
            ...bound.record,
            sha256: "f".repeat(64),
          },
        }),
      ).rejects.toThrow(/hash|bytes/i);
      await expect(
        loadReleaseComparison(fixture.root, {
          ...bound,
          bundle: {
            ...bound.bundle,
            sha256: "f".repeat(64),
          },
        }),
      ).rejects.toThrow(/exact finalized record/);
    } finally {
      await rm(fixture.root, {
        recursive: true,
        force: true,
      });
    }
  });

  it("rejects a structurally finalized record lacking independently validated native evidence", async () => {
    const fixture = await lineageFixture();
    try {
      await expect(
        loadReleaseComparison(fixture.root, {
          record: fixture.next.base!.release,
          bundle: fixture.next.base!.bundle,
        }),
      ).rejects.toThrow(/comparison evidence is invalid/);
    } finally {
      await rm(fixture.root, {
        recursive: true,
        force: true,
      });
    }
  });
});
