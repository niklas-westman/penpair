import type { PenpotToolClient } from "../client.js";
import { exportShapePng } from "../export.js";
import { observationHash } from "../journal.js";
import { projection as validateProjection } from "../map-penpot/projection.js";
import { validateMapContract, hashMapContract } from "../maps/validation.js";
import { releaseContractGraph, nativeContractId } from "./contract-graph.js";
import { readProjection } from "../map-penpot/index.js";
import { findArtifactReview, validateArtifactReview } from "../maps/review.js";
import { withPageSession, selectPage } from "../page-session.js";
import type { InspectionCapture } from "../inspection.js";
import { readArtifact } from "./artifact-paths.js";
import {
  compareNativeCopy,
  decodedPixels,
  inspectionContentHash,
  deriveNodeMap,
} from "./fidelity.js";
import {
  assertSourceUnchanged,
  captureReleaseScreen,
  observeRelease,
  releaseClient,
} from "./live.js";
import { assertReleaseContracts } from "./store.js";
import { hashDesignRelease, validateDesignRelease } from "./validation.js";
import type { DesignRelease, ReleaseArtifactRef, ReleaseCheck, ReleaseOptions } from "./types.js";

export interface ReleaseBundle {
  schemaVersion: 1;
  kind: "approved-design-release";
  designHash: string;
  release: DesignRelease;
  review: DesignRelease["reviews"][number];
  artifacts: Array<{
    original: ReleaseArtifactRef;
    snapshot: ReleaseArtifactRef;
  }>;
}

export function releaseReferences(release: DesignRelease): ReleaseArtifactRef[] {
  const references = [
    ...release.sources.flatMap((source) => [
      source.inspection,
      ...(source.render
        ? [
            source.render,
          ]
        : []),
      ...(source.dependencies
        ? [
            source.dependencies,
          ]
        : []),
    ]),
    ...release.contracts.flatMap((contract) => [
      {
        path: contract.path,
        sha256: contract.sha256,
      },
      ...(contract.review?.artifacts ?? []),
    ]),
    ...release.receipts.flatMap((receipt) => [
      receipt.sourceInspection,
      receipt.targetInspection,
      receipt.originalRender,
      receipt.targetRender,
    ]),
    ...release.maps.flatMap((map) => [
      map.projection,
      map.render,
    ]),
    ...(release.overview
      ? [
          release.overview.render,
        ]
      : []),
  ];
  return [
    ...new Map(
      references.map((reference) => [
        `${reference.path}:${reference.sha256}`,
        reference,
      ]),
    ).values(),
  ];
}

export async function readReleaseBundle(
  root: string,
  release: DesignRelease,
): Promise<ReleaseBundle> {
  if (!release.finalized) {
    throw new Error("Finalized bundle pointer missing");
  }
  const bundle = JSON.parse(
    (await readArtifact(root, release.finalized.bundle)).toString("utf8"),
  ) as ReleaseBundle;
  if (
    bundle.schemaVersion !== 1 ||
    bundle.kind !== "approved-design-release" ||
    bundle.designHash !== hashDesignRelease(release) ||
    hashDesignRelease(bundle.release) !== bundle.designHash ||
    !Array.isArray(bundle.artifacts) ||
    bundle.artifacts.length > 2000
  ) {
    throw new Error("Immutable release bundle does not match its final pointer");
  }
  const keys = new Set<string>();
  for (const item of bundle.artifacts) {
    if (
      !item ||
      !item.original ||
      !item.snapshot ||
      item.original.sha256 !== item.snapshot.sha256
    ) {
      throw new Error("Immutable artifact snapshot differs from its original approved hash");
    }
    const key = `${item.original.path}:${item.original.sha256}`;
    if (keys.has(key)) {
      throw new Error("Duplicate immutable artifact mapping");
    }
    keys.add(key);
  }
  for (const reference of releaseReferences(release)) {
    if (!keys.has(`${reference.path}:${reference.sha256}`)) {
      throw new Error("Immutable bundle omits required release evidence");
    }
  }
  const review = validateArtifactReview(bundle.review);
  for (const reference of review.artifacts ?? []) {
    if (!keys.has(`${reference.path}:${reference.sha256}`)) {
      throw new Error("Immutable bundle omits owner review evidence");
    }
  }
  if (
    !findArtifactReview(
      [
        review,
      ],
      "design-release",
      release.id,
      bundle.designHash,
    ) ||
    review.hash !== release.finalized?.reviewHash ||
    release.finalized.markerHash !== release.finalized.bundle.sha256
  ) {
    throw new Error("Finalized release owner review or marker binding changed");
  }
  return bundle;
}

export async function checkRelease(
  client: PenpotToolClient | undefined,
  root: string,
  raw: DesignRelease,
  options: ReleaseOptions = {},
): Promise<ReleaseCheck> {
  const release = validateDesignRelease(raw);
  const reasons: string[] = [];
  const designHash = hashDesignRelease(release);
  let bundle: ReleaseBundle | undefined;
  const artifact = async (reference: ReleaseArtifactRef): Promise<Buffer> => {
    if (!bundle) {
      return readArtifact(root, reference, 64 * 1024 * 1024);
    }
    const saved = bundle.artifacts.find(
      (item) => item.original.path === reference.path && item.original.sha256 === reference.sha256,
    );
    if (!saved) {
      throw new Error("Immutable bundle omits required release evidence");
    }
    return readArtifact(root, saved.snapshot, 64 * 1024 * 1024);
  };
  try {
    if (release.status === "final") {
      bundle = await readReleaseBundle(root, release);
      for (const item of bundle.artifacts) {
        await readArtifact(root, item.snapshot, 64 * 1024 * 1024);
      }
    }
    await assertReleaseContracts(root, release.contracts, true, artifact, release.fileId);
    for (const reference of releaseReferences(release)) {
      await artifact(reference);
    }
    if (
      !release.fidelity ||
      !release.overview ||
      release.maps.length !== release.contracts.length
    ) {
      reasons.push("Complete verified native screen, map and overview evidence is missing");
    }
    const entries = await Promise.all(
      release.contracts.map(async (reference) => ({
        reference,
        map: validateMapContract(JSON.parse((await artifact(reference)).toString("utf8"))),
      })),
    );
    const graph = releaseContractGraph(entries, release.fileId);
    for (const map of release.maps) {
      const entry = entries.find(
        (candidate) => candidate.map.kind === map.kind && candidate.map.id === map.id,
      );
      if (!entry || map.contractHash !== hashMapContract(entry.map)) {
        throw new Error("Release map evidence does not match its exact explicit contract");
      }
      const raw = JSON.parse((await artifact(map.projection)).toString("utf8"));
      const observed = validateProjection(
        {
          fileId: release.fileId,
          pageId: release.target.pageId!,
          boardId: map.boardId,
        },
        nativeContractId(entry.map),
        raw,
      );
      if (
        raw.schemaVersion !== 1 ||
        raw.kind !== "native-map-projection" ||
        raw.fileId !== release.fileId ||
        raw.pageId !== release.target.pageId ||
        raw.boardId !== map.boardId ||
        raw.mapId !== nativeContractId(entry.map) ||
        observed.fingerprint !== raw.fingerprint ||
        observed.contractHash !== map.contractHash ||
        observed.conflicts.length
      ) {
        throw new Error("Stored native map projection provenance changed");
      }
      const details = graph.details.get(nativeContractId(entry.map)) ?? {};
      for (const node of entry.map.nodes.filter((node) => node.kind === "detail-link")) {
        const child = details[node.sourceIds![0]!]!;
        const target = release.maps.find(
          (candidate) => candidate.kind === child.kind && candidate.id === child.id,
        );
        if (!target || target.contractHash !== hashMapContract(child)) {
          throw new Error("Release detail target lacks an independently pinned child board");
        }
        const clickables = observed.shapes.filter(
          (shape) =>
            shape.logicalId === node.id &&
            [
              "node",
              "label",
            ].includes(shape.role),
        );
        if (
          clickables.length !== 2 ||
          clickables.some(
            (shape) =>
              !Array.isArray(shape.interactions) ||
              shape.interactions.length !== 1 ||
              shape.interactions[0]?.trigger !== "click" ||
              shape.interactions[0]?.type !== "navigate-to" ||
              shape.interactions[0]?.destinationId !== target.boardId ||
              shape.interactions[0]?.destinationPageId !== release.target.pageId ||
              shape.interactions[0]?.destinationMapHash !== target.contractHash ||
              shape.interactions[0]?.destinationMapId !== nativeContractId(child),
          )
        ) {
          throw new Error(
            "Release detail interactions must target the exact reviewed release child board",
          );
        }
      }
    }
    const completeNodeMap = Object.assign(
      {},
      ...release.receipts.map((receipt) => receipt.nodeMap),
    ) as Record<string, string>;
    for (const receipt of release.receipts) {
      const source = release.sources.find((item) => item.id === receipt.sourceId)!;
      const original = JSON.parse(
        (await artifact(receipt.sourceInspection)).toString("utf8"),
      ) as InspectionCapture;
      const copied = JSON.parse(
        (await artifact(receipt.targetInspection)).toString("utf8"),
      ) as InspectionCapture;
      const result = compareNativeCopy(original, copied, completeNodeMap);
      if (
        result.sourceHash !== source.contentHash ||
        result.sourceHash !== receipt.sourceContentHash ||
        result.targetHash !== receipt.targetContentHash
      ) {
        throw new Error("Stored receipt native fingerprints changed");
      }
      if (observationHash(receipt.nodeMap) !== observationHash(deriveNodeMap(original, copied))) {
        throw new Error("Stored receipt descendant mapping changed");
      }
      if (
        original.fileId !== release.fileId ||
        original.pageId !== source.pageId ||
        original.nodes?.[0]?.id !== source.frameId ||
        copied.fileId !== release.fileId ||
        copied.pageId !== release.target.pageId ||
        copied.nodes?.[0]?.id !== receipt.targetFrameId
      ) {
        throw new Error("Stored receipt frame provenance changed");
      }
      if (!source.render) {
        throw new Error("Pinned source render missing from release evidence");
      }
      const frozen = await decodedPixels(await artifact(source.render));
      const sourcePixels = await decodedPixels(await artifact(receipt.originalRender));
      const targetPixels = await decodedPixels(await artifact(receipt.targetRender));
      if (
        [
          frozen,
          sourcePixels,
          targetPixels,
        ].some(
          (pixels) =>
            pixels.hash !== receipt.decodedPixelsHash ||
            pixels.width !== receipt.width ||
            pixels.height !== receipt.height,
        )
      ) {
        throw new Error("Stored exact pixel fidelity evidence differs from its receipt");
      }
    }
    if (!client) {
      return {
        valid: reasons.length === 0,
        finalized: release.status === "final",
        live: false,
        designHash,
        reasons,
        implementation: release.implementation.status,
      };
    }
    client = releaseClient(client, release);
    await withPageSession(client, async () => {
      const observed = await observeRelease(client!, release);
      if (
        !observed.pageId ||
        observed.pageId !== release.target.pageId ||
        observed.overviewFrameId !== release.target.overviewFrameId
      ) {
        throw new Error("Live release page/overview ownership changed");
      }
      if (
        release.status === "final" &&
        (observed.marker?.status !== "released" ||
          observed.marker.bundleHash !== release.finalized?.bundle.sha256 ||
          observed.marker.reviewHash !== release.finalized?.reviewHash)
      ) {
        throw new Error("Live finalized release marker changed");
      }
      if (release.status !== "final") {
        for (const source of release.sources) {
          await assertSourceUnchanged(client!, root, release, source);
        }
      }
      for (const receipt of release.receipts) {
        const original = JSON.parse(
          (await artifact(receipt.sourceInspection)).toString("utf8"),
        ) as InspectionCapture;
        const target = await captureReleaseScreen(
          client!,
          release.fileId,
          receipt.targetPageId,
          receipt.targetFrameId,
        );
        compareNativeCopy(original, target, completeNodeMap);
        const image = await exportShapePng(client!, receipt.targetFrameId, {
          ...options.exportOptions,
          stable: true,
        });
        const pixels = await decodedPixels(image.png);
        if (
          !image.stable ||
          pixels.hash !== receipt.decodedPixelsHash ||
          pixels.width !== receipt.width ||
          pixels.height !== receipt.height
        ) {
          throw new Error("Finalized release screen render drifted");
        }
      }
      for (const map of release.maps) {
        const stored = JSON.parse((await artifact(map.projection)).toString("utf8"));
        const projection = await readProjection(
          client!,
          {
            fileId: release.fileId,
            pageId: release.target.pageId!,
            boardId: map.boardId,
          },
          `${map.kind}:${map.id}`,
        );
        if (
          projection.conflicts.length ||
          projection.fingerprint !== stored.fingerprint ||
          projection.contractHash !== map.contractHash
        ) {
          throw new Error("Release native map drifted from reviewed contract projection");
        }
        const image = await exportShapePng(client!, map.boardId, {
          ...options.exportOptions,
          stable: true,
        });
        if (
          !image.stable ||
          (await decodedPixels(image.png)).hash !==
            (await decodedPixels(await artifact(map.render))).hash
        ) {
          throw new Error("Release native map render drifted");
        }
      }
      if (release.overview && release.target.overviewFrameId) {
        const overview = await captureReleaseScreen(
          client!,
          release.fileId,
          release.target.pageId!,
          release.target.overviewFrameId,
        );
        const image = await exportShapePng(client!, release.target.overviewFrameId, {
          ...options.exportOptions,
          stable: true,
        });
        if (
          inspectionContentHash(overview) !== release.overview.contentHash ||
          !image.stable ||
          (await decodedPixels(image.png)).hash !== release.overview.decodedPixelsHash
        ) {
          throw new Error("Release overview content drifted");
        }
      }
      await selectPage(client!, {
        id: release.target.pageId!,
      });
    });
  } catch (error) {
    reasons.push(
      options.redact?.(error instanceof Error ? error.message : String(error)) ??
        (error instanceof Error ? error.message : String(error)),
    );
  }
  return {
    valid: reasons.length === 0,
    finalized: release.status === "final",
    live: Boolean(client),
    designHash,
    reasons,
    implementation: release.implementation.status,
  };
}
