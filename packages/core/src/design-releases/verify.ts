import type { PenpotToolClient } from "../client.js";
import { exportShapePng } from "../export.js";
import { observationHash } from "../journal.js";
import { withPageSession, selectPage } from "../page-session.js";
import { readArtifact, saveArtifact } from "./artifact-paths.js";
import {
  compareNativeCopy,
  decodedPixels,
  deriveNodeMap,
  inspectionContentHash,
} from "./fidelity.js";
import {
  assertSourceUnchanged,
  captureReleaseScreen,
  observeRelease,
  releaseClient,
} from "./live.js";
import { assertReleaseOverviewLinks } from "./overview-links.js";
import { verifyRetainedMember, captureRetainedMember } from "./member-evidence.js";
import { assertReleaseContracts } from "./store.js";
import { validateDesignRelease } from "./validation.js";
import type { DesignRelease, ReceiptInput, ReleaseOptions, ReleaseReceipt } from "./types.js";

export async function verifyRelease(
  client: PenpotToolClient,
  root: string,
  raw: DesignRelease,
  inputs: ReceiptInput[],
  options: ReleaseOptions = {},
): Promise<DesignRelease> {
  const release = validateDesignRelease(raw);
  if (release.status === "final") {
    throw new Error("Finalized releases cannot replace fidelity evidence");
  }
  if (
    !release.target.pageId ||
    !release.target.overviewFrameId ||
    !release.overview ||
    release.maps.length !== release.contracts.length
  ) {
    throw new Error("Release page, overview and native maps must be assembled first");
  }
  if (
    !Array.isArray(inputs) ||
    inputs.length !== release.sources.length ||
    new Set(inputs.map((item) => item.sourceId)).size !== inputs.length ||
    new Set(inputs.map((item) => item.targetFrameId)).size !== inputs.length
  ) {
    throw new Error(
      "Explicit complete source-to-target receipts are required; duplicate receipts conflict",
    );
  }
  if (
    inputs.some(
      (item) =>
        !release.sources.some((source) => source.id === item.sourceId) ||
        release.sources.some((source) => source.frameId === item.targetFrameId),
    )
  ) {
    throw new Error("Receipt uses an unknown source or an original source as target");
  }
  await assertReleaseContracts(root, release.contracts, false, undefined, release.fileId);
  client = releaseClient(client, release);
  return withPageSession(client, async () => {
    const owned = await observeRelease(client, release);
    if (owned.marker?.status !== "draft") {
      throw new Error("Release is not an owned mutable draft");
    }
    await assertReleaseOverviewLinks(client, {
      ...release,
      receipts: inputs.map((input) => ({
        ...input,
        targetPageId: release.target.pageId!,
      })),
    } as DesignRelease);
    const observations = [];
    const fullMap: Record<string, string> = {};
    for (const source of release.sources) {
      const input = inputs.find((item) => item.sourceId === source.id)!;
      if (!source.render) {
        throw new Error("Pinned source render is required before native fidelity verification");
      }
      const original = await assertSourceUnchanged(client, root, release, source);
      const copied = await captureReleaseScreen(
        client,
        release.fileId,
        release.target.pageId!,
        input.targetFrameId,
      );
      const mapping = deriveNodeMap(original, copied);
      for (const [from, to] of Object.entries(mapping)) {
        if (Object.hasOwn(fullMap, from) || Object.values(fullMap).includes(to)) {
          throw new Error("Duplicate or overlapping source/target descendants conflict");
        }
        fullMap[from] = to;
      }
      observations.push({
        source,
        input,
        original,
        copied,
      });
    }
    const memberEvidence = [];
    for (const member of release.members ?? []) {
      if (member.disposition !== "changed") {
        options.onStep?.(`Verify retained source ${member.id} on page ${member.source.pageId}`);
        memberEvidence.push(await verifyRetainedMember(client, root, release, member, options));
      }
    }
    const receipts: ReleaseReceipt[] = [];
    for (const { source, input, original, copied } of observations) {
      const content = compareNativeCopy(original, copied, fullMap);
      const frozen = await decodedPixels(
        await readArtifact(root, source.render!, 64 * 1024 * 1024),
      );
      await selectPage(client, {
        id: source.pageId,
      });
      const sourceImage = await exportShapePng(client, source.frameId, {
        ...options.exportOptions,
        stable: true,
      });
      await selectPage(client, {
        id: release.target.pageId!,
      });
      const targetImage = await exportShapePng(client, input.targetFrameId, {
        ...options.exportOptions,
        stable: true,
      });
      if (
        !sourceImage.stable ||
        !targetImage.stable ||
        sourceImage.capture.fileId !== release.fileId ||
        sourceImage.capture.pageId !== source.pageId ||
        targetImage.capture.fileId !== release.fileId ||
        targetImage.capture.pageId !== release.target.pageId
      ) {
        throw new Error("Stable source and target render provenance is required");
      }
      const environment = (image: typeof sourceImage): unknown => ({
        scale: image.capture.scale,
        api: image.capture.penpotApiVersion,
        render: image.capture.renderEnvironment,
        themes: image.capture.activeThemeIds,
        activeThemes: image.capture.activeThemes,
      });
      if (observationHash(environment(sourceImage)) !== observationHash(environment(targetImage))) {
        throw new Error("Source and target render environments or themes differ");
      }
      const before = await decodedPixels(sourceImage.png);
      const after = await decodedPixels(targetImage.png);
      if (
        before.width !== after.width ||
        before.height !== after.height ||
        before.width !== frozen.width ||
        before.height !== frozen.height ||
        before.hash !== after.hash ||
        before.hash !== frozen.hash
      ) {
        throw new Error(
          "Native copy or pinned source changed exact decoded pixels or image dimensions",
        );
      }
      const sourceAfter = await assertSourceUnchanged(client, root, release, source);
      const targetAfter = await captureReleaseScreen(
        client,
        release.fileId,
        release.target.pageId!,
        input.targetFrameId,
      );
      compareNativeCopy(sourceAfter, targetAfter, fullMap);
      if (
        observationHash(deriveNodeMap(sourceAfter, targetAfter)) !==
        observationHash(deriveNodeMap(original, copied))
      ) {
        throw new Error("Native descendant identities changed during fidelity capture");
      }
      if (inspectionContentHash(sourceAfter) !== source.contentHash) {
        throw new Error("Source changed during fidelity capture");
      }
      const prefix = `design/releases/${release.productVersion}/evidence/screens/${source.id}`;
      if (release.schemaVersion === 2) {
        const member = release.members!.find((member) => member.id === source.id)!;
        const approvedMember = {
          ...member,
          approval: input.approval,
          source: {
            ...source,
            pageId: release.target.pageId!,
            frameId: input.targetFrameId,
            inspection: source.inspection,
            render: source.render,
            contentHash: inspectionContentHash(targetAfter),
          },
        };
        const targetInspection = await saveArtifact(
          root,
          `${prefix}-approval-${observationHash(targetAfter)}.json`,
          `${JSON.stringify(targetAfter, null, 2)}\n`,
          options.redact,
        );
        const targetRender = await saveArtifact(
          root,
          `${prefix}-approval-${after.hash}.png`,
          targetImage.png,
          options.redact,
        );
        approvedMember.source.inspection = targetInspection;
        approvedMember.source.render = targetRender;
        await captureRetainedMember(client, root, release, approvedMember, options);
      }
      receipts.push({
        ...input,
        sourceFrameId: source.frameId,
        targetPageId: release.target.pageId!,
        nodeMap: deriveNodeMap(original, copied),
        sourceContentHash: content.sourceHash,
        targetContentHash: content.targetHash,
        sourceInspection: await saveArtifact(
          root,
          `${prefix}-source-${observationHash(sourceAfter)}.json`,
          `${JSON.stringify(sourceAfter, null, 2)}\n`,
          options.redact,
        ),
        targetInspection: await saveArtifact(
          root,
          `${prefix}-target-${observationHash(targetAfter)}.json`,
          `${JSON.stringify(targetAfter, null, 2)}\n`,
          options.redact,
        ),
        originalRender: await saveArtifact(
          root,
          `${prefix}-source-${before.hash}.png`,
          sourceImage.png,
          options.redact,
        ),
        targetRender: await saveArtifact(
          root,
          `${prefix}-target-${after.hash}.png`,
          targetImage.png,
          options.redact,
        ),
        decodedPixelsHash: before.hash,
        width: before.width,
        height: before.height,
      });
    }
    return validateDesignRelease({
      ...release,
      status: "verified",
      receipts,
      ...(release.schemaVersion === 2
        ? {
            memberEvidence,
            members: release.members!.map((member) =>
              member.disposition === "changed"
                ? {
                    ...member,
                    approval: inputs.find((input) => input.sourceId === member.id)?.approval,
                  }
                : member,
            ),
          }
        : {}),
      fidelity: {
        schemaVersion: 1,
        kind: "design-release-fidelity",
        verifiedAt: new Date().toISOString(),
        receiptsHash: observationHash(
          release.schemaVersion === 2
            ? {
                receipts,
                memberEvidence,
              }
            : receipts,
        ),
        exactDecodedPixels: true,
        nativeStructure: true,
      },
      reviews: [],
    });
  });
}
