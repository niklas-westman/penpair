import { childMapRunId } from "./child-journals.js";
import { randomUUID } from "node:crypto";
import type { PenpotToolClient } from "../client.js";
import { exportShapePng } from "../export.js";
import { runJournaledSteps, readJournalTarget, observationHash, readJournal } from "../journal.js";
import { withPageSession, rememberPage } from "../page-session.js";
import { runSnippet, snippet } from "../snippet.js";
import { assembleReleaseMaps } from "../map-penpot/index.js";
import { publishReleaseOverviewLinks, releaseOverviewTargets } from "./overview-links.js";
import { hashDesignRelease } from "./validation.js";
import { captureRetainedMember } from "./member-evidence.js";
import type { NativeMapProjection } from "../map-penpot/types.js";
import { readArtifact, saveArtifact, hashBytes } from "./artifact-paths.js";
import { decodedPixels, inspectionContentHash } from "./fidelity.js";
import {
  assertSourceUnchanged,
  captureReleaseScreen,
  observeRelease,
  releaseClient,
  type ReleaseObservation,
} from "./live.js";
import { readReleaseContract, assertReleaseContracts } from "./store.js";
import { assembleReleaseSnippet, releaseOverviewHeight } from "./snippets.js";
import { validateDesignRelease } from "./validation.js";
import type { DesignRelease, ReleaseOptions } from "./types.js";

export async function assembleRelease(
  client: PenpotToolClient,
  root: string,
  raw: DesignRelease,
  options: ReleaseOptions = {},
): Promise<DesignRelease> {
  const release = validateDesignRelease(raw);
  if (options.receipts) {
    releaseOverviewTargets(release, options.receipts);
  }
  const encoded = JSON.stringify(release);
  if (options.redact && options.redact(encoded) !== encoded) {
    throw new Error("Protected data in release record; no native writes applied");
  }
  if (release.status === "final" || release.status === "verified") {
    throw new Error("Verified or finalized design releases cannot be reassembled");
  }
  await assertReleaseContracts(root, release.contracts, false, undefined, release.fileId);
  const contracts = await Promise.all(
    release.contracts.map((reference) => readReleaseContract(root, reference)),
  );
  for (const contract of contracts) {
    const encoded = JSON.stringify(contract);
    if (options.redact && options.redact(encoded) !== encoded) {
      throw new Error("Protected data in release map contract; no native writes applied");
    }
  }
  client = releaseClient(client, release);
  return withPageSession(client, async () => {
    if (options.receipts) {
      const targets = releaseOverviewTargets(release, options.receipts);
      await runSnippet(
        client,
        snippet(
          "release-overview-target-preflight",
          `if(penpot.currentFile.id!==CFG.fileId)throw new Error("Pinned release file changed"); for(const target of CFG.targets){const pages=penpot.currentFile.pages.filter(page=>page.id===target.pageId);const shape=pages.length===1?pages[0].getShapeById(target.frameId):null;if(!shape || shape.type!=="board" || shape.id!==target.frameId)throw new Error("Overview receipt target unavailable: "+target.id);}return {ok:true};`,
          {
            fileId: release.fileId,
            targets,
          },
          "read",
        ),
      );
    }
    for (const source of release.sources) {
      await assertSourceUnchanged(client, root, release, source);
    }
    for (const member of release.members ?? []) {
      if (member.disposition !== "changed") {
        await captureRetainedMember(client, root, release, member, options);
      }
    }
    const initial = await observeRelease(client, release);
    if (initial.marker && initial.marker.status !== "draft") {
      throw new Error("Release version is already finalized remotely");
    }
    if (!options.apply) {
      return release;
    }
    const runId = options.runId ?? randomUUID();
    const complete = (value: ReleaseObservation): boolean =>
      Boolean(
        value.pageId &&
          value.overviewFrameId &&
          value.marker?.status === "draft" &&
          value.marker.ownerKey === release.target.ownerKey,
      );
    await runJournaledSteps<ReleaseObservation>(
      [
        {
          key: "page-and-overview",
          label: "Create owned release page and draft overview",
          signature: assembleReleaseSnippet(release).code,
          initial,
          inspect: () => observeRelease(client, release),
          apply: async () => {
            const result = await runSnippet(client, assembleReleaseSnippet(release), {
              retries: 0,
              effect: "write",
            });
            if (typeof result.pageId !== "string") {
              throw new Error("Assembly did not return page identity");
            }
            rememberPage(client, {
              fileId: release.fileId,
              pageId: result.pageId,
            });
            return result;
          },
          verify: complete,
          reconcile: (_before, current) =>
            complete(current)
              ? "complete"
              : current.marker && current.marker.status !== "draft"
                ? "conflict"
                : "pending",
        },
      ],
      {
        root,
        runId,
        resume: options.resume,
        operation: "design-release-assemble",
        payload: {
          kind: "design-release-operation",
          releaseId: release.id,
          productVersion: release.productVersion,
          designHash: hashDesignRelease(release),
        },
        input: {
          id: release.id,
          version: release.productVersion,
          ownerKey: release.target.ownerKey,
        },
        target: () => readJournalTarget(client),
        onStep: options.onStep,
        redact: options.redact,
      },
    );
    const observed = await observeRelease(client, release);
    if (!complete(observed)) {
      throw new Error("Independent release page readback failed");
    }
    const assembled: DesignRelease = {
      ...release,
      status: "awaiting-copy",
      target: {
        ...release.target,
        pageId: observed.pageId!,
        overviewFrameId: observed.overviewFrameId!,
      },
    };
    await publishReleaseOverviewLinks(client, root, assembled, runId, options);
    const journals: Record<
      string,
      {
        runId: string;
        resume: boolean;
      }
    > = {};
    for (const [index, contract] of contracts.entries()) {
      const mapRunId = childMapRunId(runId, index);
      let resume = false;
      if (options.resume) {
        try {
          await readJournal(root, mapRunId);
          resume = true;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
            throw error;
          }
        }
      }
      journals[`${contract.kind}:${contract.id}`] = {
        runId: mapRunId,
        resume,
      };
    }
    const origin = await runSnippet(
      client,
      snippet(
        "release-overview-origin",
        'const pages=penpot.currentFile.pages.filter(page=>page.id===CFG.pageId); const board=pages.length===1?pages[0].getShapeById(CFG.id):null; if(!board || board.getSharedPluginData("penpair","release-overview")!==CFG.ownerKey)throw new Error("Owned overview unavailable"); return {ok:true,x:board.x,y:board.y,height:board.height};',
        {
          id: observed.overviewFrameId!,
          pageId: observed.pageId!,
          ownerKey: release.target.ownerKey,
        },
        "read",
      ),
    );
    if (!Number.isFinite(origin.x) || !Number.isFinite(origin.y)) {
      throw new Error("Release overview position unavailable");
    }
    const projections: Record<string, NativeMapProjection> = {};
    for (const map of release.maps) {
      projections[`${map.kind}:${map.id}`] = JSON.parse(
        (await readArtifact(root, map.projection)).toString("utf8"),
      ) as NativeMapProjection;
    }
    const maps = await assembleReleaseMaps(
      client,
      root,
      {
        fileId: release.fileId,
        pageId: observed.pageId!,
      },
      contracts,
      {
        ...options.exportOptions,
        apply: true,
        journals,
        projections,
        redact: options.redact,
        origin: {
          x: Number(origin.x),
          y:
            Number(origin.y) +
            (Number.isFinite(origin.height)
              ? Number(origin.height)
              : releaseOverviewHeight(release)) +
            200,
        },
        onStep: options.onStep,
      },
    );
    for (const map of maps) {
      const { projection, image, report } = map.publication;
      if (!report.verified || !projection.boardId || !image?.stable) {
        throw new Error("Native release map publication is incomplete");
      }
      const prefix = `design/releases/${release.productVersion}/evidence/maps/${map.mapKind}-${map.mapId}`;
      assembled.maps = assembled.maps.filter(
        (item) => item.kind !== map.mapKind || item.id !== map.mapId,
      );
      const serializedProjection = `${JSON.stringify(projection, null, 2)}\n`;
      assembled.maps.push({
        kind: map.mapKind,
        id: map.mapId,
        boardId: projection.boardId,
        contractHash: map.contractHash,
        projection: await saveArtifact(
          root,
          `${prefix}-${hashBytes(serializedProjection)}.json`,
          serializedProjection,
          options.redact,
        ),
        render: await saveArtifact(
          root,
          `${prefix}-${observationHash(image.capture)}.png`,
          image.png,
          options.redact,
        ),
      });
    }
    const overview = await captureReleaseScreen(
      client,
      release.fileId,
      observed.pageId!,
      observed.overviewFrameId!,
    );
    const image = await exportShapePng(client, observed.overviewFrameId!, {
      ...options.exportOptions,
      stable: true,
    });
    if (
      !image.stable ||
      image.capture.fileId !== release.fileId ||
      image.capture.pageId !== observed.pageId
    ) {
      throw new Error("Release overview render did not stabilize");
    }
    const pixels = await decodedPixels(image.png);
    assembled.overview = {
      contentHash: inspectionContentHash(overview),
      decodedPixelsHash: pixels.hash,
      render: await saveArtifact(
        root,
        `design/releases/${release.productVersion}/evidence/overview-${pixels.hash}.png`,
        image.png,
        options.redact,
      ),
    };
    for (const source of release.sources) {
      await assertSourceUnchanged(client, root, release, source);
    }
    return validateDesignRelease(assembled);
  });
}
