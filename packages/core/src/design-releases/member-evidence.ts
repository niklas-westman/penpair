import { applyCapturePolicy, crossRevisionContinuityProblem } from "../capture-policy.js";
import type { PenpotToolClient } from "../client.js";
import { validateApprovals } from "../approvals.js";
import { exportShapePng } from "../export.js";
import { encodeBaselineImage } from "../image-codec.js";
import { inspectImageEvidence } from "../image-evidence.js";
import { observationHash } from "../journal.js";
import type { InspectionCapture } from "../inspection.js";
import { readArtifact, saveArtifact, hashBytes } from "./artifact-paths.js";
import { decodedPixels, inspectionContentHash } from "./fidelity.js";
import { hashDesignRelease, validateDesignRelease } from "./validation.js";
import { validateArtifactReview, findArtifactReview } from "../maps/review.js";
import { assertSourceUnchanged } from "./live.js";
import type {
  DesignRelease,
  ReleaseArtifactRef,
  ReleaseMember,
  ReleaseMemberEvidence,
  ReleaseOptions,
} from "./types.js";

export type ReleaseArtifactReader = (reference: ReleaseArtifactRef) => Promise<Buffer>;

async function validateRetainedOrigin(
  member: ReleaseMember,
  artifact: ReleaseArtifactReader,
): Promise<void> {
  if (member.disposition !== "retained") {
    return;
  }
  if (!member.origin) {
    throw new Error("Retained release member has no original finalized source");
  }
  const bundle = JSON.parse((await artifact(member.origin.bundle)).toString("utf8"));
  const original = validateDesignRelease(bundle.release);
  const review = validateArtifactReview(bundle.review);
  if (
    bundle.schemaVersion !== 1 ||
    bundle.kind !== "approved-design-release" ||
    bundle.designHash !== hashDesignRelease(original) ||
    original.id !== member.origin.releaseId ||
    original.productVersion !== member.origin.productVersion ||
    !findArtifactReview(
      [
        review,
      ],
      "design-release",
      original.id,
      bundle.designHash,
    )
  ) {
    throw new Error("Retained member origin is not its exact approved release bundle");
  }
  const oldMember = original.members?.find((candidate) => candidate.id === member.id);
  const source =
    oldMember?.source ?? original.sources.find((candidate) => candidate.id === member.id);
  const receipt = original.receipts.find((candidate) => candidate.sourceId === member.id);
  const changed = !oldMember || oldMember.disposition === "changed";
  const approval = oldMember?.approval ?? receipt?.approval;
  if (
    !source ||
    !approval ||
    !member.approval ||
    (changed && !receipt) ||
    member.source.pageId !== (changed ? receipt!.targetPageId : source.pageId) ||
    member.source.frameId !== (changed ? receipt!.targetFrameId : source.frameId) ||
    member.source.inspection.sha256 !==
      (changed ? receipt!.targetInspection.sha256 : source.inspection.sha256) ||
    member.source.render?.sha256 !==
      (changed ? receipt!.targetRender.sha256 : source.render?.sha256) ||
    member.source.dependencies?.sha256 !== source.dependencies?.sha256 ||
    member.approval.record.sha256 !== approval.record.sha256 ||
    member.approval.image.sha256 !== approval.image.sha256 ||
    member.approval.recordId !== approval.recordId ||
    (member.comparisonThreshold ?? 0.05) !== (oldMember?.comparisonThreshold ?? 0.05) ||
    member.route !== oldMember?.route ||
    observationHash(member.case ?? null) !== observationHash(oldMember?.case ?? null)
  ) {
    throw new Error(
      `Retained member ${member.id} differs from its original approved release membership`,
    );
  }
}

/** Verify original owner evidence without rewriting it to the current revision. */
export async function validateMemberApproval(
  root: string,
  release: DesignRelease,
  member: ReleaseMember,
  artifact: ReleaseArtifactReader = (reference) => readArtifact(root, reference, 64 * 1024 * 1024),
): Promise<void> {
  if (!member.approval || !member.source.render) {
    throw new Error(
      `Release member ${member.id} requires original owner approval and pinned render`,
    );
  }
  await validateRetainedOrigin(member, artifact);
  const raw = JSON.parse((await artifact(member.approval.record)).toString("utf8"));
  const document = validateApprovals(
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
  const record = document.records.find((record) => record.id === member.approval!.recordId);
  const inspection = JSON.parse(
    (await artifact(member.source.inspection)).toString("utf8"),
  ) as InspectionCapture;
  if (
    !record ||
    record.capture.fileId !== release.fileId ||
    record.capture.pageId !== member.source.pageId ||
    record.capture.frameId !== member.source.frameId ||
    record.sha256 !== member.approval.image.sha256 ||
    observationHash(record.case ?? null) !== observationHash(member.case ?? null) ||
    inspection.fileId !== release.fileId ||
    inspection.pageId !== member.source.pageId ||
    inspection.nodes?.[0]?.id !== member.source.frameId ||
    inspectionContentHash(inspection) !== member.source.contentHash
  ) {
    throw new Error(`Release member ${member.id} approval/source identity does not match`);
  }
  const approved = await artifact(member.approval.image);
  if (hashBytes(approved) !== record.sha256) {
    throw new Error(`Release member ${member.id} approved bytes changed`);
  }
  const { default: sharp } = await import("sharp");
  const header = inspectImageEvidence(approved);
  if (header.width * header.height > 64_000_000) {
    throw new Error("Approved release image exceeds the pixel budget");
  }
  const decoder = sharp(approved, {
    failOn: "error",
    limitInputPixels: 64_000_000,
  });
  const metadata = await decoder.metadata();
  if (metadata.depth !== "uchar" || (metadata.pages ?? 1) !== 1 || metadata.bitsPerSample === 16) {
    throw new Error("Approved release image must be static 8-bit evidence");
  }
  const approvedPixels = await decodedPixels(await decoder.png().toBuffer());
  const pinnedPixels = await decodedPixels(await artifact(member.source.render));
  if (observationHash(approvedPixels) !== observationHash(pinnedPixels)) {
    throw new Error(`Release member ${member.id} approved image differs from pinned render`);
  }
}

export async function captureRetainedMember(
  client: PenpotToolClient,
  root: string,
  release: DesignRelease,
  member: ReleaseMember,
  options: ReleaseOptions = {},
  artifact: ReleaseArtifactReader = (reference) => readArtifact(root, reference, 64 * 1024 * 1024),
): Promise<{
  inspection: InspectionCapture;
  image: Buffer;
}> {
  await validateMemberApproval(root, release, member, artifact);
  const before = await assertSourceUnchanged(client, root, release, member.source, artifact);
  const pinned = JSON.parse(
    (await artifact(member.source.inspection)).toString("utf8"),
  ) as InspectionCapture;
  if (
    observationHash(pinned.nodes?.map((node) => node.id)) !==
    observationHash(before.nodes?.map((node) => node.id))
  ) {
    throw new Error(`Release member ${member.id} pinned descendant identities changed`);
  }
  const image = await exportShapePng(client, member.source.frameId, {
    ...options.exportOptions,
    stable: true,
  });
  if (
    !image.stable ||
    image.capture.fileId !== release.fileId ||
    image.capture.pageId !== member.source.pageId ||
    image.capture.frameId !== member.source.frameId
  ) {
    throw new Error(`Release member ${member.id} stable capture identity is incomplete`);
  }
  const raw = JSON.parse((await artifact(member.approval!.record)).toString("utf8"));
  const records = validateApprovals(
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
  const approval = records.records.find((record) => record.id === member.approval!.recordId)!;
  const { revision: originalRevision, ...originalCapture } = approval.capture;
  const { revision: currentRevision, ...currentCapture } = applyCapturePolicy(
    image.capture,
    originalCapture.capturePolicy,
  );
  if (
    originalRevision !== currentRevision &&
    crossRevisionContinuityProblem(originalCapture) !== undefined
  ) {
    throw new Error(`Release member ${member.id} cross-revision capture environment is unknown`);
  }
  if (observationHash(originalCapture) !== observationHash(currentCapture)) {
    throw new Error(`Release member ${member.id} capture environment changed`);
  }
  const approved = await artifact(member.approval!.image);
  const format = inspectImageEvidence(approved).format;
  const encoded = await encodeBaselineImage(image.png, format);
  if (hashBytes(encoded) !== member.approval!.image.sha256) {
    throw new Error(`Release member ${member.id} no longer matches exact approved bytes`);
  }
  const after = await assertSourceUnchanged(client, root, release, member.source, artifact);
  if (
    observationHash(before.nodes?.map((node) => node.id)) !==
    observationHash(after.nodes?.map((node) => node.id))
  ) {
    throw new Error(`Release member ${member.id} descendant identities changed during capture`);
  }
  return {
    inspection: after,
    image: image.png,
  };
}

export async function verifyRetainedMember(
  client: PenpotToolClient,
  root: string,
  release: DesignRelease,
  member: ReleaseMember,
  options: ReleaseOptions = {},
): Promise<ReleaseMemberEvidence> {
  const { inspection, image } = await captureRetainedMember(client, root, release, member, options);
  const pixels = await decodedPixels(image);
  const prefix = `design/releases/${release.productVersion}/evidence/retained/${member.id}`;
  return {
    id: member.id,
    inspection: await saveArtifact(
      root,
      `${prefix}-${observationHash(inspection)}.json`,
      `${JSON.stringify(inspection, null, 2)}\n`,
      options.redact,
    ),
    render: await saveArtifact(root, `${prefix}-${pixels.hash}.png`, image, options.redact),
    contentHash: inspectionContentHash(inspection),
    decodedPixelsHash: pixels.hash,
    width: pixels.width,
    height: pixels.height,
  };
}

export async function checkRetainedEvidence(
  root: string,
  release: DesignRelease,
  member: ReleaseMember,
  evidence: ReleaseMemberEvidence,
  artifact: ReleaseArtifactReader,
): Promise<void> {
  await validateMemberApproval(root, release, member, artifact);
  const original = JSON.parse(
    (await artifact(member.source.inspection)).toString("utf8"),
  ) as InspectionCapture;
  const observed = JSON.parse(
    (await artifact(evidence.inspection)).toString("utf8"),
  ) as InspectionCapture;
  const pixels = await decodedPixels(await artifact(evidence.render));
  const pinned = await decodedPixels(await artifact(member.source.render!));
  if (
    evidence.id !== member.id ||
    observed.fileId !== release.fileId ||
    observed.pageId !== member.source.pageId ||
    observed.nodes?.[0]?.id !== member.source.frameId ||
    inspectionContentHash(observed) !== member.source.contentHash ||
    evidence.contentHash !== member.source.contentHash ||
    observationHash(original.nodes?.map((node) => node.id)) !==
      observationHash(observed.nodes?.map((node) => node.id)) ||
    pixels.hash !== evidence.decodedPixelsHash ||
    pixels.width !== evidence.width ||
    pixels.height !== evidence.height ||
    observationHash(pinned) !== observationHash(pixels)
  ) {
    throw new Error(`Stored retained member evidence changed: ${member.id}`);
  }
}
