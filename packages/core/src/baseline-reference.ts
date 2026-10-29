import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { artifactSha } from "./approvals.js";
import { resolveProjectInput } from "./project-input.js";
import type { ArtifactProvenance, BaselineResult } from "./baselines.js";
import type { BaselineFrame, BaselinesConfig } from "./baselines-config.js";
import type { CaptureIdentity } from "./export.js";
import { matchingApproval } from "./approvals.js";
import { observationHash } from "./journal.js";
import { crossRevisionContinuityProblem } from "./capture-policy.js";

function captureIdentity(provenance: ArtifactProvenance): CaptureIdentity {
  return {
    fileId: provenance.fileId,
    pageId: provenance.pageId,
    frameId: provenance.frameId,
    revision: provenance.revision,
    scale: provenance.scale,
    penpotApiVersion: provenance.penpotApiVersion,
    renderEnvironment: provenance.renderEnvironment,
    activeThemes: provenance.activeThemes,
    ...(provenance.capturePolicy
      ? {
          capturePolicy: provenance.capturePolicy,
        }
      : {}),
    ...(provenance.designSize
      ? {
          designSize: provenance.designSize,
        }
      : {}),
    ...(provenance.activeThemeIds !== undefined
      ? {
          activeThemeIds: provenance.activeThemeIds,
        }
      : {}),
  };
}

/** Metadata-only matching. Cross-revision references require separately verified owner evidence. */
function matchingReference(
  config: BaselinesConfig,
  frame: BaselineFrame,
  result: BaselineResult | undefined,
  verifiedOwnerEvidence = false,
): ArtifactProvenance | undefined {
  const approved = result?.approved && !("legacy" in result.approved) ? result.approved : undefined;
  const captured = result?.captured;
  if (
    !result ||
    !approved ||
    !captured ||
    approved.approval?.kind === "forced-reference" ||
    ![
      "same",
      "new",
      "changed",
    ].includes(result.status)
  ) {
    return undefined;
  }
  if (
    observationHash(approved.case ?? null) !== observationHash(frame.case ?? null) ||
    approved.sha256 !== captured.sha256 ||
    (result.sha256 !== undefined && approved.sha256 !== result.sha256) ||
    approved.file !== result.file ||
    approved.frameId !== result.frameId ||
    (frame.frameId && frame.frameId.toLowerCase() !== approved.frameId.toLowerCase())
  ) {
    return undefined;
  }
  if (result.source && frame.frame !== undefined && result.frame !== frame.frame) {
    return undefined;
  }
  const source = result.source;
  if (
    source &&
    ((frame.pageId
      ? source.pageId.toLowerCase() !== frame.pageId.toLowerCase() ||
        (frame.page !== undefined && source.page !== frame.page)
      : source.page !== (frame.page ?? config.page)) ||
      source.pageId !== captured.pageId ||
      source.fileId !== captured.fileId ||
      source.frameId !== captured.frameId ||
      source.route !== frame.route)
  ) {
    return undefined;
  }
  // Earlier manifests do not record configured page/route selection. Never infer a new per-frame selector from them.
  if (!source && (frame.page !== undefined || frame.pageId !== undefined)) {
    return undefined;
  }
  if (
    captured.revision < approved.revision ||
    approved.fileId !== captured.fileId ||
    approved.pageId !== captured.pageId ||
    approved.frameId !== captured.frameId
  ) {
    return undefined;
  }
  const original = captureIdentity(approved);
  const observed = captureIdentity(captured);
  if (
    observationHash({
      ...original,
      revision: 0,
    }) !==
    observationHash({
      ...observed,
      revision: 0,
    })
  ) {
    return undefined;
  }
  if (
    approved.revision !== captured.revision &&
    (!verifiedOwnerEvidence ||
      approved.approval?.kind !== "owner-words" ||
      !source ||
      crossRevisionContinuityProblem(approved) !== undefined)
  ) {
    return undefined;
  }
  return approved;
}

/** Metadata-only matching accepts current-revision references; retained references need validation. */
export function matchingBaselineReference(
  config: BaselinesConfig,
  frame: BaselineFrame,
  result: BaselineResult | undefined,
): ArtifactProvenance | undefined {
  return matchingReference(config, frame, result);
}

/** Verify original exact owner record and stored image before allowing revision continuity. */
export async function validateBaselineReference(
  root: string,
  config: BaselinesConfig,
  frame: BaselineFrame,
  result: BaselineResult,
): Promise<ArtifactProvenance | undefined> {
  const approved = result.approved && !("legacy" in result.approved) ? result.approved : undefined;
  if (!approved) {
    return undefined;
  }
  if (
    typeof result.file !== "string" ||
    path.isAbsolute(result.file) ||
    result.file.split(/[\\/]/).includes("..")
  ) {
    throw new Error("Approved baseline path leaves its folder");
  }
  const file = await resolveProjectInput(root, path.join(config.root, result.file));
  if (
    (await stat(file)).size > 64 * 1024 * 1024 ||
    artifactSha(await readFile(file)) !== approved.sha256
  ) {
    throw new Error("Approved baseline image bytes changed");
  }
  let verifiedOwnerEvidence = false;
  if (approved?.approval?.kind === "owner-words") {
    const record = await matchingApproval(
      root,
      captureIdentity(approved),
      approved.sha256,
      approved.case,
    );
    verifiedOwnerEvidence = Boolean(
      record && record.id === approved.approval.id && record.hash === approved.approval.recordHash,
    );
    if (!verifiedOwnerEvidence) {
      return undefined;
    }
  }
  return matchingReference(config, frame, result, verifiedOwnerEvidence);
}

/** Schema-3 sources must belong to the explicit bounded participating-page inventory. */
export function validateBaselineSources(manifest: {
  schemaVersion?: number;
  fileId?: string;
  pages?: unknown;
  frames?: BaselineResult[];
}): void {
  if (!Array.isArray(manifest.frames) || manifest.frames.length > 1000) {
    throw new Error("Baseline manifest needs at most 1000 frame records");
  }
  const frameIds = new Set<string>();
  for (const frame of manifest.frames) {
    if (
      !frame ||
      typeof frame.id !== "string" ||
      !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(frame.id) ||
      frameIds.has(frame.id)
    ) {
      throw new Error("Baseline frame identities are invalid or duplicated");
    }
    frameIds.add(frame.id);
  }
  if (manifest.schemaVersion !== 3) {
    return;
  }
  if (
    !Array.isArray(manifest.pages) ||
    manifest.pages.length < 1 ||
    manifest.pages.length > 1000 ||
    !Array.isArray(manifest.frames)
  ) {
    throw new Error("Multi-page baselines require a bounded participating-page inventory");
  }
  const names = new Set<string>();
  const ids = new Set<string>();
  for (const page of manifest.pages) {
    if (
      !page ||
      typeof page.page !== "string" ||
      !page.page ||
      typeof page.pageId !== "string" ||
      !page.pageId ||
      names.has(page.page) ||
      ids.has(page.pageId)
    ) {
      throw new Error("Multi-page baseline page identities are invalid or duplicated");
    }
    names.add(page.page);
    ids.add(page.pageId);
  }
  for (const frame of manifest.frames) {
    if (
      !frame.source ||
      frame.source.fileId !== manifest.fileId ||
      !manifest.pages.some(
        (page) => page.page === frame.source!.page && page.pageId === frame.source!.pageId,
      )
    ) {
      throw new Error("Multi-page baseline source is absent from its page inventory");
    }
  }
}
