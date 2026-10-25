import { observationHash } from "../journal.js";
import { validateArtifactReview } from "../maps/review.js";
import { mapObject, mapText, mapId, mapHash, mapPath } from "../maps/validation.js";
import type {
  DesignRelease,
  DesignReleasePlanInput,
  ReleaseArtifactRef,
  ReleaseScreenInput,
  ReleaseContractInput,
  ReleaseReceipt,
} from "./types.js";

export function releaseReference(raw: unknown): ReleaseArtifactRef {
  const value = mapObject(raw, "Release artifact reference", [
    "path",
    "sha256",
  ]);
  return {
    path: mapPath(value.path, "Release artifact path"),
    sha256: mapHash(value.sha256, "Release artifact hash"),
  };
}

function screen(raw: unknown, planned = true): ReleaseScreenInput {
  const value = mapObject(raw, "Release screen", [
    "id",
    "label",
    "pageId",
    "frameId",
    "inspection",
    "render",
    "dependencies",
    ...(planned
      ? []
      : [
          "contentHash",
        ]),
  ]);
  return {
    id: mapId(value.id, "Screen ID"),
    label: mapText(value.label, "Screen label", 2000),
    pageId: mapId(value.pageId, "Source page ID"),
    frameId: mapId(value.frameId, "Source frame ID"),
    inspection: releaseReference(value.inspection),
    ...(value.render === undefined
      ? {}
      : {
          render: releaseReference(value.render),
        }),
    ...(value.dependencies === undefined
      ? {}
      : {
          dependencies: releaseReference(value.dependencies),
        }),
  };
}

function contract(raw: unknown, planned = true): ReleaseContractInput {
  const value = mapObject(raw, "Release contract", [
    "path",
    "sha256",
    "review",
    ...(planned
      ? []
      : [
          "kind",
          "id",
        ]),
  ]);
  return {
    ...releaseReference({
      path: value.path,
      sha256: value.sha256,
    }),
    ...(value.review === undefined
      ? {}
      : {
          review: validateArtifactReview(value.review),
        }),
  };
}

function releaseHeader(value: Record<string, unknown>): {
  id: string;
  title: string;
  productVersion: string;
  fileId: string;
} {
  const productVersion = mapText(value.productVersion, "Product SemVer", 100);
  if (
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(
      productVersion,
    )
  ) {
    throw new Error("Explicit product SemVer is required independently of the Penpair version");
  }
  return {
    id: mapId(value.id, "Release ID"),
    title: mapText(value.title, "Release title", 2000),
    productVersion,
    fileId: mapId(value.fileId, "Pinned file ID"),
  };
}

function boundedList(value: unknown, label: string, maximum: number): unknown[] {
  if (!Array.isArray(value) || !value.length || value.length > maximum) {
    throw new Error(`${label} must contain 1–${maximum} entries`);
  }
  return value;
}

function unique(values: string[], label: string): void {
  if (new Set(values).size !== values.length) {
    throw new Error(`Duplicate ${label}`);
  }
}

export function validateReleasePlan(raw: unknown): DesignReleasePlanInput {
  const value = mapObject(raw, "Design release plan", [
    "schemaVersion",
    "kind",
    "id",
    "title",
    "productVersion",
    "fileId",
    "screens",
    "contracts",
  ]);
  if (value.schemaVersion !== 1 || value.kind !== "design-release-plan") {
    throw new Error("Unsupported design release plan schema");
  }
  const screens = boundedList(value.screens, "Release screens", 100).map((entry) => screen(entry));
  const contracts = boundedList(value.contracts, "Release contracts", 100).map((entry) =>
    contract(entry),
  );
  unique(
    screens.map((entry) => entry.id),
    "screen IDs",
  );
  unique(
    screens.map((entry) => entry.frameId),
    "source frame IDs",
  );
  unique(
    contracts.map((entry) => entry.path),
    "contract paths",
  );
  return {
    schemaVersion: 1,
    kind: "design-release-plan",
    ...releaseHeader(value),
    screens,
    contracts,
  };
}

function receipt(raw: unknown): ReleaseReceipt {
  const value = mapObject(raw, "Release receipt", [
    "sourceId",
    "targetFrameId",
    "sourceFrameId",
    "targetPageId",
    "nodeMap",
    "sourceContentHash",
    "targetContentHash",
    "sourceInspection",
    "targetInspection",
    "originalRender",
    "targetRender",
    "decodedPixelsHash",
    "width",
    "height",
  ]);
  const nodeMap = mapObject(
    value.nodeMap,
    "Node map",
    Object.keys(value.nodeMap && typeof value.nodeMap === "object" ? value.nodeMap : {}),
  );
  if (!Object.keys(nodeMap).length || Object.keys(nodeMap).length > 20000) {
    throw new Error("Release node map is empty or unbounded");
  }
  const mapped = Object.fromEntries(
    Object.entries(nodeMap).map(([from, to]) => [
      mapId(from, "Source node ID"),
      mapId(to, "Target node ID"),
    ]),
  );
  unique(Object.values(mapped), "target descendant IDs");
  if (
    !Number.isInteger(value.width) ||
    Number(value.width) < 1 ||
    !Number.isInteger(value.height) ||
    Number(value.height) < 1
  ) {
    throw new Error("Receipt requires exact image dimensions");
  }
  return {
    sourceId: mapId(value.sourceId, "Receipt source ID"),
    targetFrameId: mapId(value.targetFrameId, "Receipt target frame ID"),
    sourceFrameId: mapId(value.sourceFrameId, "Receipt source frame ID"),
    targetPageId: mapId(value.targetPageId, "Receipt target page ID"),
    nodeMap: mapped,
    sourceContentHash: mapHash(value.sourceContentHash, "Source content hash"),
    targetContentHash: mapHash(value.targetContentHash, "Target content hash"),
    sourceInspection: releaseReference(value.sourceInspection),
    targetInspection: releaseReference(value.targetInspection),
    originalRender: releaseReference(value.originalRender),
    targetRender: releaseReference(value.targetRender),
    decodedPixelsHash: mapHash(value.decodedPixelsHash, "Decoded pixels hash"),
    width: Number(value.width),
    height: Number(value.height),
  };
}

export function validateDesignRelease(raw: unknown): DesignRelease {
  const value = mapObject(raw, "Design release", [
    "schemaVersion",
    "kind",
    "id",
    "title",
    "productVersion",
    "fileId",
    "status",
    "sources",
    "contracts",
    "target",
    "receipts",
    "maps",
    "overview",
    "fidelity",
    "reviews",
    "implementation",
    "createdAt",
    "finalized",
  ]);
  if (
    value.schemaVersion !== 1 ||
    value.kind !== "design-release" ||
    ![
      "planned",
      "awaiting-copy",
      "verified",
      "final",
    ].includes(String(value.status))
  ) {
    throw new Error("Unsupported design release schema or state");
  }
  const sources = boundedList(value.sources, "Release sources", 100).map((entry) => {
    const source = screen(entry, false);
    return {
      ...source,
      contentHash: mapHash(
        (entry as Record<string, unknown>).contentHash,
        "Pinned source content hash",
      ),
    };
  });
  const contracts = boundedList(value.contracts, "Release contracts", 100).map((entry) => {
    const item = entry as Record<string, unknown>;
    if (item.kind !== "journey-map" && item.kind !== "integration-map") {
      throw new Error("Release contract kind unsupported");
    }
    return {
      ...contract(item, false),
      kind: item.kind as "journey-map" | "integration-map",
      id: mapId(item.id, "Release contract ID"),
    };
  });
  const target = mapObject(value.target, "Release target", [
    "name",
    "ownerKey",
    "pageId",
    "overviewFrameId",
  ]);
  const implementation = mapObject(value.implementation, "Independent implementation status", [
    "status",
    "evidence",
  ]);
  if (
    ![
      "not-assessed",
      "in-progress",
      "verified",
    ].includes(String(implementation.status)) ||
    !Array.isArray(implementation.evidence) ||
    implementation.evidence.length > 1000
  ) {
    throw new Error("Invalid implementation evidence status");
  }
  if (!Array.isArray(value.maps) || value.maps.length > 100) {
    throw new Error("Invalid release map evidence list");
  }
  if (
    !Array.isArray(value.receipts) ||
    value.receipts.length > 100 ||
    !Array.isArray(value.reviews) ||
    value.reviews.length > 100
  ) {
    throw new Error("Invalid release receipt/review list");
  }
  const result: DesignRelease = {
    schemaVersion: 1,
    kind: "design-release",
    ...releaseHeader(value),
    status: value.status as DesignRelease["status"],
    sources,
    contracts,
    target: {
      name: mapText(target.name, "Release page name", 200),
      ownerKey: mapHash(target.ownerKey, "Release ownership key"),
      ...(target.pageId === undefined
        ? {}
        : {
            pageId: mapId(target.pageId, "Release page ID"),
          }),
      ...(target.overviewFrameId === undefined
        ? {}
        : {
            overviewFrameId: mapId(target.overviewFrameId, "Overview frame ID"),
          }),
    },
    maps: value.maps.map((raw) => {
      const item = mapObject(raw, "Release map evidence", [
        "kind",
        "id",
        "boardId",
        "contractHash",
        "projection",
        "render",
      ]);
      if (item.kind !== "journey-map" && item.kind !== "integration-map") {
        throw new Error("Unsupported release map kind");
      }
      return {
        kind: item.kind,
        id: mapId(item.id, "Map ID"),
        boardId: mapId(item.boardId, "Map board ID"),
        contractHash: mapHash(item.contractHash, "Map contract hash"),
        projection: releaseReference(item.projection),
        render: releaseReference(item.render),
      };
    }),
    receipts: value.receipts.map(receipt),
    reviews: value.reviews.map(validateArtifactReview),
    implementation: {
      status: implementation.status as DesignRelease["implementation"]["status"],
      evidence: implementation.evidence.map(releaseReference),
    },
    createdAt: mapText(value.createdAt, "Release creation time", 100),
  };
  if (
    result.target.name !== `release/${result.productVersion}` ||
    result.target.ownerKey !==
      observationHash({
        id: result.id,
        fileId: result.fileId,
        productVersion: result.productVersion,
      })
  ) {
    throw new Error("Release target name or ownership key changed");
  }
  unique(
    sources.map((entry) => entry.id),
    "source screen IDs",
  );
  unique(
    sources.map((entry) => entry.frameId),
    "source frame IDs",
  );
  unique(
    result.receipts.map((entry) => entry.sourceId),
    "receipt sources",
  );
  unique(
    result.receipts.map((entry) => entry.targetFrameId),
    "receipt targets",
  );
  for (const item of result.receipts) {
    const source = sources.find((entry) => entry.id === item.sourceId);
    if (
      !source ||
      source.frameId !== item.sourceFrameId ||
      item.targetPageId !== result.target.pageId ||
      sources.some((entry) => entry.frameId === item.targetFrameId) ||
      item.nodeMap[item.sourceFrameId] !== item.targetFrameId
    ) {
      throw new Error("Receipt does not bind the pinned source to an independent release target");
    }
  }
  unique(
    result.maps.map((item) => `${item.kind}:${item.id}`),
    "release map identities",
  );
  if (value.overview !== undefined) {
    const overview = mapObject(value.overview, "Overview evidence", [
      "contentHash",
      "render",
      "decodedPixelsHash",
    ]);
    result.overview = {
      contentHash: mapHash(overview.contentHash, "Overview content hash"),
      render: releaseReference(overview.render),
      decodedPixelsHash: mapHash(overview.decodedPixelsHash, "Overview decoded pixels hash"),
    };
  }
  if (value.fidelity !== undefined) {
    const evidence = mapObject(value.fidelity, "Release fidelity", [
      "schemaVersion",
      "kind",
      "verifiedAt",
      "receiptsHash",
      "exactDecodedPixels",
      "nativeStructure",
    ]);
    if (
      evidence.schemaVersion !== 1 ||
      evidence.kind !== "design-release-fidelity" ||
      evidence.exactDecodedPixels !== true ||
      evidence.nativeStructure !== true ||
      mapHash(evidence.receiptsHash, "Receipts hash") !== observationHash(result.receipts) ||
      result.receipts.length !== sources.length
    ) {
      throw new Error("Fidelity evidence does not bind all screen receipts");
    }
    result.fidelity = {
      schemaVersion: 1,
      kind: "design-release-fidelity",
      verifiedAt: mapText(evidence.verifiedAt, "Verification time", 100),
      receiptsHash: String(evidence.receiptsHash),
      exactDecodedPixels: true,
      nativeStructure: true,
    };
  }
  if ((result.status === "verified" || result.status === "final") && !result.fidelity) {
    throw new Error("Verified releases require complete fidelity evidence");
  }
  if (value.finalized !== undefined) {
    const final = mapObject(value.finalized, "Final release pointer", [
      "bundle",
      "markerHash",
      "reviewHash",
    ]);
    result.finalized = {
      bundle: releaseReference(final.bundle),
      markerHash: mapHash(final.markerHash, "Final marker hash"),
      reviewHash: mapHash(final.reviewHash, "Final review hash"),
    };
  }
  if ((result.status === "final") !== Boolean(result.finalized)) {
    throw new Error("Final release status requires a finalized immutable bundle pointer");
  }
  return result;
}

/** Owner review scopes immutable design evidence; implementation acceptance is independent. */
export function hashDesignRelease(raw: DesignRelease): string {
  const release = validateDesignRelease(raw);
  const {
    status: _status,
    reviews: _reviews,
    createdAt: _createdAt,
    finalized: _finalized,
    implementation: _implementation,
    ...candidate
  } = release;
  return observationHash(candidate);
}
