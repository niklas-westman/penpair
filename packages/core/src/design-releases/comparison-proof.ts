import { validateApprovals } from "../approvals.js";
import { validateBaselineCase } from "../baselines-config.js";
import { observationHash } from "../journal.js";
import { mapObject } from "../maps/validation.js";
import { readArtifact } from "./artifact-paths.js";
import { checkRelease, readReleaseBundle } from "./check.js";
import { releaseMembers } from "./membership.js";
import { validateDesignRelease, hashDesignRelease, releaseReference } from "./validation.js";
import type { ReleaseArtifactReader } from "./member-evidence.js";
import type {
  ReleaseComparisonReference,
  ReleaseComparisonProof,
  ReleaseComparisonCase,
} from "./types.js";

/** Load reviewed comparison identity from immutable release evidence, never from context labels. */
export async function loadReleaseComparison(
  root: string,
  rawReference: ReleaseComparisonReference,
): Promise<ReleaseComparisonProof> {
  const value = mapObject(rawReference, "Release comparison reference", [
    "record",
    "bundle",
  ]);
  const reference = {
    record: releaseReference(value.record),
    bundle: releaseReference(value.bundle),
  };
  const release = validateDesignRelease(
    JSON.parse((await readArtifact(root, reference.record)).toString("utf8")),
  );
  if (
    release.status !== "final" ||
    !release.finalized ||
    observationHash(release.finalized.bundle) !== observationHash(reference.bundle)
  ) {
    throw new Error("Release comparison requires the exact finalized record and pinned bundle");
  }
  const checked = await checkRelease(undefined, root, release);
  if (!checked.valid) {
    throw new Error(`Release comparison evidence is invalid: ${checked.reasons.join("; ")}`);
  }
  const bundle = await readReleaseBundle(root, release);
  const artifacts = new Map(
    bundle.artifacts.map((entry) => [
      `${entry.original.path}:${entry.original.sha256}`,
      entry.snapshot,
    ]),
  );
  const artifact: ReleaseArtifactReader = async (reference) => {
    const snapshot = artifacts.get(`${reference.path}:${reference.sha256}`);
    if (!snapshot) {
      throw new Error("Finalized comparison bundle omits required member evidence");
    }
    return readArtifact(root, snapshot, 64 * 1024 * 1024);
  };
  const cases: ReleaseComparisonCase[] = [];
  for (const member of releaseMembers(release)) {
    if (!member.route) {
      continue;
    }
    if (!member.case || !member.approval) {
      throw new Error(
        `Release comparison case ${member.id} is missing approved route/case evidence`,
      );
    }
    validateBaselineCase(member.case, (message) => {
      throw new Error(message);
    });
    const receipt = release.receipts.find((entry) => entry.sourceId === member.id);
    if (member.disposition === "changed" && !receipt) {
      throw new Error(`Release comparison case ${member.id} has no copied target receipt`);
    }
    const raw = JSON.parse((await artifact(member.approval.record)).toString("utf8"));
    const approvals = validateApprovals(
      raw.kind === "design-approvals"
        ? raw
        : {
            schemaVersion: 1,
            kind: "design-approvals",
            records: [
              raw,
            ],
          },
    );
    const approval = approvals.records.find((record) => record.id === member.approval!.recordId);
    const pageId = member.disposition === "changed" ? receipt!.targetPageId : member.source.pageId;
    const frameId =
      member.disposition === "changed" ? receipt!.targetFrameId : member.source.frameId;
    if (
      !approval ||
      approval.capture.fileId !== release.fileId ||
      approval.capture.pageId !== pageId ||
      approval.capture.frameId !== frameId ||
      approval.sha256 !== member.approval.image.sha256 ||
      observationHash(approval.case ?? null) !== observationHash(member.case)
    ) {
      throw new Error(
        `Release comparison case ${member.id} does not bind its actual approved target`,
      );
    }
    cases.push({
      id: member.id,
      fileId: release.fileId,
      pageId,
      frameId,
      sha256: approval.sha256,
      scale: approval.capture.scale,
      route: member.route,
      intent: structuredClone(member.case),
      threshold: member.comparisonThreshold ?? 0.05,
    });
  }
  if (!cases.length) {
    throw new Error(
      "Finalized release has no complete routed comparison cases; adopt explicit case intent first",
    );
  }
  return {
    reference,
    designHash: hashDesignRelease(release),
    fileId: release.fileId,
    caseIds: cases.map((entry) => entry.id),
    caseThresholds: Object.fromEntries(
      cases.map((entry) => [
        entry.id,
        entry.threshold,
      ]),
    ),
    cases,
  };
}
