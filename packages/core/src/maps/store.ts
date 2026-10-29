import { createHash } from "node:crypto";
import { mkdir, open, unlink } from "node:fs/promises";
import path from "node:path";
import { atomicWriteFile } from "../atomic-output.js";
import { readProjectBytes } from "../bounded-file.js";
import { resolveProjectOutput } from "../project-input.js";
import { validateMapProposal } from "./proposal.js";
import { validateArtifactReview } from "./review.js";
import type { ArtifactReview, MapContract, MapProposal } from "./types.js";
import {
  hashMapContract,
  mapObject,
  maxMapBytes,
  validateMapContract,
  validateMapDetail,
} from "./validation.js";

export interface MapWriteOptions {
  replace?: boolean;
  expectedHash?: string;
  redact?: (text: string) => string;
}

async function readBoundedBytes(root: string, file: string): Promise<Buffer> {
  return readProjectBytes(root, file, maxMapBytes);
}

async function readMapJson(root: string, file: string): Promise<unknown> {
  const bytes = await readBoundedBytes(root, file);
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(
      "Map artifact is not valid JSON; inspect the explicitly referenced file privately",
    );
  }
}

function encodeMapArtifact(value: unknown, redact?: (text: string) => string): string {
  const encoded = `${JSON.stringify(value, null, 2)}\n`;
  if (Buffer.byteLength(encoded) > maxMapBytes) {
    throw new Error("Map artifact exceeds the 16 MiB byte budget");
  }
  if (redact && redact(encoded) !== encoded) {
    throw new Error("Map artifact requires credential redaction; previous evidence preserved");
  }
  return encoded;
}

async function withArtifactLock<T>(
  root: string,
  file: string,
  work: (target: string) => Promise<T>,
): Promise<T> {
  const target = await resolveProjectOutput(root, file);
  await mkdir(path.dirname(target), {
    recursive: true,
  });
  const lock = await open(`${target}.lock`, "wx", 0o600);
  try {
    return await work(target);
  } finally {
    await lock.close();
    await unlink(`${target}.lock`);
  }
}

export async function readMapContract(root: string, file: string): Promise<MapContract> {
  return validateMapContract(await readMapJson(root, file));
}

export async function writeMapContract(
  root: string,
  file: string,
  raw: MapContract,
  options: MapWriteOptions = {},
): Promise<void> {
  const contract = validateMapContract(raw);
  const encoded = encodeMapArtifact(contract, options.redact);
  await withArtifactLock(root, file, async (target) => {
    if (
      options.expectedHash !== undefined &&
      hashMapContract(await readMapContract(root, file)) !== options.expectedHash
    ) {
      throw new Error("Canonical map changed before publication; inspect the current revision");
    }
    await atomicWriteFile(target, encoded, {
      replace: options.replace ?? false,
    });
  });
}

export async function readMapProposal(root: string, file: string): Promise<MapProposal> {
  return validateMapProposal(await readMapJson(root, file));
}

export async function writeMapProposal(
  root: string,
  file: string,
  proposal: MapProposal,
  options: MapWriteOptions & {
    allowIdentical?: boolean;
  } = {},
): Promise<void> {
  const encoded = encodeMapArtifact(validateMapProposal(proposal), options.redact);
  await withArtifactLock(root, file, async (target) => {
    try {
      await atomicWriteFile(target, encoded, {
        replace: options.replace ?? false,
      });
    } catch (error) {
      if (!options.allowIdentical || (error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
      const existing = await readBoundedBytes(root, file);
      if (!existing.equals(Buffer.from(encoded))) {
        throw Object.assign(
          new Error(
            `Map proposal ${JSON.stringify(file)} already exists with different bytes; choose a new --out path. Previous evidence was preserved.`,
          ),
          {
            code: "EEXIST",
          },
        );
      }
    }
  });
}

export async function readArtifactReviews(root: string, file: string): Promise<ArtifactReview[]> {
  let raw: unknown;
  try {
    raw = await readMapJson(root, file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
  const document = mapObject(raw, "Artifact reviews", [
    "schemaVersion",
    "kind",
    "records",
  ]);
  if (
    document.schemaVersion !== 1 ||
    document.kind !== "artifact-reviews" ||
    !Array.isArray(document.records) ||
    document.records.length > 10000
  ) {
    throw new Error("Unsupported artifact reviews document");
  }
  const reviews = document.records.map(validateArtifactReview);
  if (new Set(reviews.map((review) => review.id)).size !== reviews.length) {
    throw new Error("Duplicate artifact review ID");
  }
  return reviews;
}

export async function verifyArtifactReviewEvidence(
  root: string,
  raw: ArtifactReview,
): Promise<boolean> {
  const review = validateArtifactReview(raw);
  for (const artifact of review.artifacts ?? []) {
    let bytes: Buffer;
    try {
      bytes = await readProjectBytes(root, artifact.path, 64 * 1024 * 1024);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return false;
      }
      throw error;
    }
    if (createHash("sha256").update(bytes).digest("hex") !== artifact.sha256) {
      return false;
    }
  }
  return true;
}

export async function writeArtifactReview(
  root: string,
  file: string,
  raw: ArtifactReview,
  options: MapWriteOptions = {},
): Promise<ArtifactReview> {
  const review = validateArtifactReview(raw);
  if (!(await verifyArtifactReviewEvidence(root, review))) {
    throw new Error("Reviewed artifact bytes changed; no review was recorded");
  }
  await withArtifactLock(root, file, async (target) => {
    const previous = await readArtifactReviews(root, file);
    const duplicate = previous.find((entry) => entry.id === review.id);
    if (duplicate) {
      if (duplicate.hash !== review.hash) {
        throw new Error("A different review already uses this record ID");
      }
      return;
    }
    if (previous.length >= 10000) {
      throw new Error("Artifact review record limit reached");
    }
    const encoded = encodeMapArtifact(
      {
        schemaVersion: 1,
        kind: "artifact-reviews",
        records: [
          ...previous,
          review,
        ],
      },
      options.redact,
    );
    await atomicWriteFile(target, encoded, {
      replace: true,
    });
  });
  return review;
}

export interface MapSourceObservation {
  sourceHashes: Record<string, string>;
  journeyHash?: string;
  journeyRequirementIds?: string[];
  detailMaps: Record<string, MapContract>;
}

/** Only explicitly referenced project files are read; a hash does not prove live design freshness. */
export async function observeMapSources(
  root: string,
  raw: MapContract,
): Promise<MapSourceObservation> {
  const contract = validateMapContract(raw);
  const sourceHashes: Record<string, string> = Object.create(null);
  const detailMaps: Record<string, MapContract> = Object.create(null);
  const detailSourceIds = new Set(
    contract.nodes
      .filter((node) => node.kind === "detail-link")
      .flatMap((node) => node.sourceIds ?? []),
  );
  let detailBytes = 0;
  for (const source of contract.sources) {
    if (!source.path) {
      continue;
    }
    try {
      const bytes = await readBoundedBytes(root, source.path);
      sourceHashes[source.id] = createHash("sha256").update(bytes).digest("hex");
      if (detailSourceIds.has(source.id) && sourceHashes[source.id] === source.sha256) {
        detailBytes += bytes.length;
        if (detailBytes > 128 * 1024 * 1024) {
          throw new Error("Direct detail contracts exceed the 128 MiB total input budget");
        }
        let rawDetail: unknown;
        try {
          rawDetail = JSON.parse(bytes.toString("utf8"));
        } catch {
          throw new Error("Linked detail contract is not valid JSON; no source text was included");
        }
        let detail: MapContract | undefined;
        for (const node of contract.nodes.filter(
          (entry) => entry.kind === "detail-link" && entry.sourceIds?.[0] === source.id,
        )) {
          detail = validateMapDetail(contract, node, rawDetail);
        }
        detailMaps[source.id] = detail!;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        sourceHashes[source.id] = "missing";
      } else {
        throw error;
      }
    }
  }
  if (!contract.journey) {
    return {
      sourceHashes,
      detailMaps,
    };
  }
  let journey: MapContract;
  try {
    journey = await readMapContract(root, contract.journey.path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        sourceHashes,
        detailMaps,
        journeyHash: "missing",
      };
    }
    throw error;
  }
  if (journey.kind !== "journey-map") {
    throw new Error("Integration journey reference must resolve to a journey map");
  }
  return {
    sourceHashes,
    detailMaps,
    journeyHash: hashMapContract(journey),
    journeyRequirementIds: journey.requirements.map((requirement) => requirement.id),
  };
}
