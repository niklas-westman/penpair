import { releaseContractContexts } from "./store.js";
import { observationHash } from "../journal.js";
import type { MapContext } from "../maps/types.js";
import { readArtifact } from "./artifact-paths.js";
import { checkRelease, readReleaseBundle } from "./check.js";
import { hashDesignRelease, validateDesignRelease } from "./validation.js";
import type { DesignRelease, ReleaseArtifactRef, ReleaseContext } from "./types.js";

export async function releaseContext(root: string, raw: DesignRelease): Promise<ReleaseContext> {
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
  if (release.implementation.status !== "verified") {
    nextActions.push(
      `Implementation verification is ${release.implementation.status}; implement the approved requirements and collect independent implementation evidence.`,
    );
  }
  const context: ReleaseContext = {
    schemaVersion: 1,
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
    screens: release.sources.map((source) => ({
      id: source.id,
      label: source.label,
      sourceFrameId: source.frameId,
      targetFrameId:
        release.receipts.find((receipt) => receipt.sourceId === source.id)?.targetFrameId ?? null,
    })),
    contracts: release.contracts,
    proposedBaselines: {
      page: release.target.name,
      root: `design/releases/${release.productVersion}/baselines`,
      format: "webp",
      frames: release.receipts.map((receipt) => ({
        id: `screen-${observationHash(receipt.sourceId).slice(0, 24)}`,
        frameId: receipt.targetFrameId,
      })),
    },
    truncated: mapContexts.some((map) => map.truncated),
  };
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
