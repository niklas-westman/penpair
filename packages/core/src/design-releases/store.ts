import { planDeltaRelease } from "./membership.js";
import { open, unlink } from "node:fs/promises";
import { readProjectBytes } from "../bounded-file.js";
import { atomicWriteFile } from "../atomic-output.js";
import { validateInspectionDocument, type InspectionCapture } from "../inspection.js";
import { observationHash } from "../journal.js";
import { validateMapContract, hashMapContract } from "../maps/validation.js";
import { buildMapContext } from "../maps/context.js";
import type { MapContract, MapContext } from "../maps/types.js";
import { artifactPath, maximumArtifactBytes, readArtifact } from "./artifact-paths.js";
import { inspectionContentHash, decodedPixels } from "./fidelity.js";
import { releaseContractGraph, nativeContractId } from "./contract-graph.js";
import { validateReleasePlan, validateDesignRelease } from "./validation.js";
import type {
  DesignRelease,
  ReleaseArtifactRef,
  ReleaseContract,
  ReleaseOptions,
} from "./types.js";

export async function readDesignRelease(root: string, file: string): Promise<DesignRelease> {
  await artifactPath(root, file);
  return validateDesignRelease(
    JSON.parse((await readProjectBytes(root, file, maximumArtifactBytes)).toString("utf8")),
  );
}

export async function writeDesignRelease(
  root: string,
  file: string,
  raw: DesignRelease,
  options: ReleaseOptions = {},
): Promise<void> {
  const release = validateDesignRelease(raw);
  const serialized = `${JSON.stringify(release, null, 2)}\n`;
  if (Buffer.byteLength(serialized) > maximumArtifactBytes) {
    throw new Error("Design release exceeds the 16-MiB artifact budget");
  }
  if (options.redact && options.redact(serialized) !== serialized) {
    throw new Error("Release record contains protected data and cannot be persisted");
  }
  const destination = await artifactPath(root, file, true);
  const lockPath = `${destination}.write-lock`;
  const lock = await open(lockPath, "wx", 0o600).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "EEXIST") {
      throw new Error("Release pointer has another writer; inspect or retry after it finishes");
    }
    throw error;
  });
  try {
    try {
      const previous = await readDesignRelease(root, file);
      if (
        previous.status === "final" ||
        previous.id !== release.id ||
        previous.productVersion !== release.productVersion
      ) {
        throw new Error("Cannot overwrite a finalized design release or change a draft identity");
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
    await atomicWriteFile(destination, serialized, {
      replace: true,
    });
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}

export async function readReleaseInspection(
  root: string,
  reference: ReleaseArtifactRef,
): Promise<InspectionCapture> {
  const bytes = await readArtifact(root, reference);
  const value = JSON.parse(bytes.toString("utf8"));
  validateInspectionDocument(value);
  if (!value.complete || value.kind !== "shape-inspection") {
    throw new Error("Release source inspection must be complete shape evidence");
  }
  return value as InspectionCapture;
}

export async function readReleaseContract(
  root: string,
  reference: ReleaseArtifactRef,
): Promise<MapContract> {
  return validateMapContract(JSON.parse((await readArtifact(root, reference)).toString("utf8")));
}

export async function releaseContractContexts(
  root: string,
  contracts: ReleaseContract[],
  reader: (reference: ReleaseArtifactRef) => Promise<Buffer> = (reference) =>
    readArtifact(root, reference, 64 * 1024 * 1024),
  fileId?: string,
): Promise<MapContext[]> {
  const maps = await Promise.all(
    contracts.map(async (reference) => ({
      reference,
      map: validateMapContract(JSON.parse((await reader(reference)).toString("utf8"))),
    })),
  );
  if (
    !maps.some((entry) => entry.map.kind === "journey-map") ||
    !maps.some((entry) => entry.map.kind === "integration-map")
  ) {
    throw new Error("A design release requires journey and integration contracts");
  }
  const graph = releaseContractGraph(maps, fileId);
  const contexts = new Map<string, MapContext>();
  for (const { reference, map } of graph.ordered) {
    if (reference.kind !== map.kind || reference.id !== map.id) {
      throw new Error("Release contract identity changed");
    }
    const journey = maps.find(
      (entry) => entry.reference.path === map.journey?.path && entry.map.kind === "journey-map",
    );
    if (map.journey && (!journey || hashMapContract(journey.map) !== map.journey.sha256)) {
      throw new Error("Integration contract does not reference the exact release journey revision");
    }
    const sourceHashes: Record<string, string> = {};
    for (const source of map.sources) {
      if (source.path) {
        await reader({
          path: source.path,
          sha256: source.sha256,
        });
        sourceHashes[source.id] = source.sha256;
      }
    }
    for (const artifact of reference.review?.artifacts ?? []) {
      await reader(artifact);
    }
    const detailMaps = graph.details.get(nativeContractId(map)) ?? {};
    const detailReadiness = Object.fromEntries(
      Object.entries(detailMaps).map(([id, child]) => [
        id,
        contexts.get(nativeContractId(child))?.ready === true,
      ]),
    );
    const context = buildMapContext(map, {
      reviews: reference.review
        ? [
            reference.review,
          ]
        : [],
      sourceHashes,
      detailMaps,
      detailReadiness,
      ...(journey
        ? {
            journeyHash: hashMapContract(journey.map),
            journeyRequirementIds: journey.map.requirements.map((item) => item.id),
          }
        : {}),
      maxItems: 1000,
      maxBytes: 128 * 1024,
    });
    contexts.set(nativeContractId(map), context);
  }
  return graph.ordered.map((entry) => contexts.get(nativeContractId(entry.map))!);
}

export async function assertReleaseContracts(
  root: string,
  contracts: ReleaseContract[],
  reviewed = false,
  reader?: (reference: ReleaseArtifactRef) => Promise<Buffer>,
  fileId?: string,
): Promise<void> {
  const contexts = await releaseContractContexts(root, contracts, reader, fileId);
  if (reviewed) {
    if (contexts.some((context) => !context.reviewed)) {
      throw new Error(
        "Release contracts need exact owner reviews of their current revisions, including every detail contract",
      );
    }
    const blocked = contexts.find((context) => !context.ready);
    if (blocked) {
      throw new Error(`Release contract is not ready: ${blocked.reasons.join("; ")}`);
    }
  }
}

export async function planRelease(
  root: string,
  raw: unknown,
  options: ReleaseOptions = {},
): Promise<DesignRelease> {
  const input = validateReleasePlan(raw);
  if (input.schemaVersion === 2) {
    return planDeltaRelease(root, input, options);
  }
  const safe = (value: unknown): void => {
    const serialized = JSON.stringify(value);
    if (options.redact && options.redact(serialized) !== serialized) {
      throw new Error("Protected data in release evidence");
    }
  };
  safe(input);
  const sources = [];
  for (const source of input.screens) {
    const inspection = await readReleaseInspection(root, source.inspection);
    safe(inspection);
    if (
      inspection.fileId !== input.fileId ||
      inspection.pageId !== source.pageId ||
      inspection.nodes?.[0]?.id !== source.frameId
    ) {
      throw new Error("Source screen inspection does not match pinned file/page/frame IDs");
    }
    if (source.render) {
      await decodedPixels(await readArtifact(root, source.render, 64 * 1024 * 1024));
    }
    if (source.dependencies) {
      await readArtifact(root, source.dependencies);
    }
    sources.push({
      ...source,
      contentHash: inspectionContentHash(inspection),
    });
  }
  const contracts = await Promise.all(
    input.contracts.map(async (reference) => {
      const map = await readReleaseContract(root, reference);
      safe(map);
      return {
        ...reference,
        kind: map.kind,
        id: map.id,
      };
    }),
  );
  await assertReleaseContracts(root, contracts, false, undefined, input.fileId);
  return validateDesignRelease({
    schemaVersion: 1,
    kind: "design-release",
    id: input.id,
    title: input.title,
    productVersion: input.productVersion,
    fileId: input.fileId,
    status: "planned",
    sources,
    contracts,
    target: {
      name: `release/${input.productVersion}`,
      ownerKey: observationHash({
        id: input.id,
        fileId: input.fileId,
        productVersion: input.productVersion,
      }),
    },
    maps: [],
    receipts: [],
    reviews: [],
    implementation: {
      status: "not-assessed",
      evidence: [],
    },
    createdAt: new Date().toISOString(),
  });
}
