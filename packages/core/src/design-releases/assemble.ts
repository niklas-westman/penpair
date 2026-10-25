import { randomUUID } from "node:crypto";
import type { PenpotToolClient } from "../client.js";
import { exportShapePng } from "../export.js";
import { runJournaledSteps, readJournalTarget, observationHash, readJournal } from "../journal.js";
import { withPageSession, rememberPage } from "../page-session.js";
import { runSnippet } from "../snippet.js";
import { assembleReleaseMaps } from "../map-penpot/index.js";
import { saveArtifact } from "./artifact-paths.js";
import { decodedPixels, inspectionContentHash } from "./fidelity.js";
import {
  assertSourceUnchanged,
  captureReleaseScreen,
  observeRelease,
  releaseClient,
  type ReleaseObservation,
} from "./live.js";
import { readReleaseContract, assertReleaseContracts } from "./store.js";
import { assembleReleaseSnippet } from "./snippets.js";
import { validateDesignRelease } from "./validation.js";
import type { DesignRelease, ReleaseOptions } from "./types.js";

export async function assembleRelease(
  client: PenpotToolClient,
  root: string,
  raw: DesignRelease,
  options: ReleaseOptions = {},
): Promise<DesignRelease> {
  const release = validateDesignRelease(raw);
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
    for (const source of release.sources) {
      await assertSourceUnchanged(client, root, release, source);
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
    const journals: Record<
      string,
      {
        runId: string;
        resume: boolean;
      }
    > = {};
    for (const [index, contract] of contracts.entries()) {
      const mapRunId = `map-${observationHash({
        runId,
        index,
      }).slice(0, 48)}`;
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
        redact: options.redact,
        origin: {
          x: 0,
          y: 1000,
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
      assembled.maps.push({
        kind: map.mapKind,
        id: map.mapId,
        boardId: projection.boardId,
        contractHash: map.contractHash,
        projection: await saveArtifact(
          root,
          `${prefix}-${projection.fingerprint}.json`,
          `${JSON.stringify(projection, null, 2)}\n`,
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
