import { releaseStatus } from "./status.js";
import { releaseContractContexts } from "./store.js";
import { observationHash } from "../journal.js";
import type { MapContext } from "../maps/types.js";
import { readArtifact, hashBytes } from "./artifact-paths.js";
import { readProjectBytes } from "../bounded-file.js";
import { checkRelease, readReleaseBundle } from "./check.js";
import { hashDesignRelease, validateDesignRelease } from "./validation.js";
import type { DesignRelease, ReleaseArtifactRef, ReleaseContext, ReleaseOptions } from "./types.js";

export async function releaseContext(
  root: string,
  raw: DesignRelease,
  options: ReleaseOptions = {},
): Promise<ReleaseContext> {
  const release = validateDesignRelease(raw);
  const checked = await checkRelease(undefined, root, release);
  const bundle =
    release.status === "final" && checked.valid
      ? await readReleaseBundle(root, release)
      : undefined;
  const artifact = async (reference: ReleaseArtifactRef): Promise<Buffer> => {
    if (!bundle) {
      return readArtifact(root, reference, 64 * 1024 * 1024);
    }
    const frozen = bundle.artifacts.find(
      (item) => item.original.path === reference.path && item.original.sha256 === reference.sha256,
    );
    if (!frozen) {
      throw new Error("Approved context is missing frozen evidence");
    }
    return readArtifact(root, frozen.snapshot, 64 * 1024 * 1024);
  };
  const mapContexts: MapContext[] = [];
  const nextActions: string[] = [];
  if (checked.valid) {
    mapContexts.push(
      ...(await releaseContractContexts(root, release.contracts, artifact, release.fileId)),
    );
    for (const map of mapContexts) {
      for (const finding of map.findings) {
        if (finding.status === "open") {
          nextActions.push(`${map.mapKind}/${map.mapId}: ${finding.message}`);
        }
      }
    }
  }
  const context: ReleaseContext = {
    schemaVersion: release.schemaVersion,
    kind: "release-context",
    id: release.id,
    productVersion: release.productVersion,
    designHash: hashDesignRelease(release),
    finalized: release.status === "final",
    ready:
      checked.valid &&
      release.status === "final" &&
      mapContexts.every((map) => map.ready && !map.truncated),
    reasons: [
      ...checked.reasons,
      ...(release.status !== "final"
        ? [
            "Design release is not finalized",
          ]
        : []),
    ],
    implementation: release.implementation,
    mapContexts,
    mapTargets: release.maps.map((map) => ({
      kind: map.kind,
      id: map.id,
      fileId: release.fileId,
      pageId: release.target.pageId!,
      frameId: map.boardId,
      contractHash: map.contractHash,
    })),
    nextActions,
    screens: (release.schemaVersion === 2
      ? (release.members ?? []).map((member) => member.source)
      : release.sources
    ).map((source) => ({
      id: source.id,
      label: source.label,
      sourceFrameId: source.frameId,
      targetFrameId:
        release.receipts.find((receipt) => receipt.sourceId === source.id)?.targetFrameId ??
        (release.members?.find((member) => member.id === source.id)?.disposition !== "changed" &&
        release.schemaVersion === 2
          ? source.frameId
          : null),
      ...(release.schemaVersion === 2
        ? {
            effectivePageId:
              release.receipts.find((receipt) => receipt.sourceId === source.id)?.targetPageId ??
              source.pageId,
            effectiveFrameId:
              release.receipts.find((receipt) => receipt.sourceId === source.id)?.targetFrameId ??
              source.frameId,
            disposition: release.members?.find((member) => member.id === source.id)?.disposition,
          }
        : {}),
    })),
    contracts: release.contracts,
    proposedBaselines: {
      page: release.target.name,
      root: `design/releases/${release.productVersion}/baselines`,
      format: "webp",
      frames:
        release.schemaVersion === 2
          ? (release.members ?? []).map((member) => {
              const receipt = release.receipts.find(
                (candidate) => candidate.sourceId === member.id,
              );
              return {
                id: member.id,
                frameId: receipt?.targetFrameId ?? member.source.frameId,
                pageId: receipt?.targetPageId ?? member.source.pageId,
                threshold: member.comparisonThreshold ?? 0.05,
                ...(member.route
                  ? {
                      route: member.route,
                    }
                  : {}),
                ...(member.case
                  ? {
                      case: member.case,
                    }
                  : {}),
              };
            })
          : release.receipts.map((receipt) => ({
              id: `screen-${observationHash(receipt.sourceId).slice(0, 24)}`,
              frameId: receipt.targetFrameId,
            })),
    },
    truncated: mapContexts.some((map) => map.truncated),
  };
  if (release.status === "final" && checked.valid && options.pointerPath) {
    const bytes = await readProjectBytes(root, options.pointerPath, 16 * 1024 * 1024);
    const recorded = validateDesignRelease(JSON.parse(bytes.toString("utf8")));
    if (observationHash(recorded) !== observationHash(release)) {
      throw new Error("Release context record path differs from the verified finalized release");
    }
    context.releaseReference = {
      record: {
        path: options.pointerPath,
        sha256: hashBytes(bytes),
      },
      bundle: release.finalized!.bundle,
    };
  }
  context.caseIds =
    release.schemaVersion === 2
      ? (release.members ?? []).filter((member) => member.route).map((member) => member.id)
      : [];
  context.caseThresholds = Object.fromEntries(
    (release.members ?? [])
      .filter((member) => member.route)
      .map((member) => [
        member.id,
        member.comparisonThreshold ?? 0.05,
      ]),
  );
  context.workflow = await releaseStatus(root, release, {
    ...options,
    checked,
  });
  context.implementationAssessment = context.workflow.implementation;
  const assessment = context.implementationAssessment;
  if (assessment.comparison === "passed") {
    context.nextActions.push(
      "Current implementation comparison passed; independent owner acceptance remains unrecorded. Frozen implementation status records the design-release handoff only.",
    );
  } else if (assessment.comparison === "drift") {
    context.nextActions.push(
      "Current implementation comparison has measured drift; fix and recheck the application without rewriting the approved design.",
    );
  } else {
    context.nextActions.push(
      `Current implementation comparison is ${assessment.comparison}; collect complete evidence for the frozen inventory. Frozen implementation status is historical.`,
    );
    context.nextActions.push(...assessment.reasons);
  }
  const collections = [
    "screens",
    "contracts",
    "mapContexts",
    "mapTargets",
    "nextActions",
  ] as const;
  while (Buffer.byteLength(JSON.stringify(context)) > 127 * 1024) {
    context.truncated = true;
    context.ready = false;
    const largest = collections.reduce((before, key) =>
      JSON.stringify(context[key]).length > JSON.stringify(context[before]).length ? key : before,
    );
    if (context[largest].length) {
      context[largest].splice(Math.floor(context[largest].length / 2));
    } else if (context.proposedBaselines.frames.length) {
      context.proposedBaselines.frames.splice(
        Math.floor(context.proposedBaselines.frames.length / 2),
      );
    } else if (context.implementation.evidence.length) {
      context.implementation = {
        status: context.implementation.status,
        evidence: [],
      };
    } else {
      context.reasons = [
        "Release context exceeded byte budget; inspect canonical release artifacts",
      ];
      break;
    }
  }
  if (context.truncated) {
    context.ready = false;
    context.reasons.push("Context omits evidence; canonical release artifacts are required");
  }
  return context;
}
