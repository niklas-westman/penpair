import { randomUUID } from "node:crypto";
import { observationHash } from "../journal.js";
import type { ArtifactReview } from "./types.js";
import { mapHash, mapId, mapObject, mapPath, mapText } from "./validation.js";

export interface ArtifactReviewInput {
  artifactKind: ArtifactReview["artifactKind"];
  artifactId: string;
  artifactHash: string;
  by: string;
  note: string;
  artifacts?: Array<{
    path: string;
    sha256: string;
  }>;
}

export function validateArtifactReview(raw: unknown): ArtifactReview {
  const review = mapObject(raw, "Artifact review", [
    "schemaVersion",
    "kind",
    "id",
    "artifactKind",
    "artifactId",
    "artifactHash",
    "by",
    "note",
    "recordedAt",
    "artifacts",
    "hash",
  ]);
  if (
    review.schemaVersion !== 1 ||
    review.kind !== "artifact-review" ||
    typeof review.artifactKind !== "string" ||
    ![
      "journey-map",
      "integration-map",
      "design-release",
      "design-evidence",
    ].includes(review.artifactKind)
  ) {
    throw new Error("Unsupported artifact review schema or kind");
  }
  const recordedAt = mapText(review.recordedAt, "Review time", 100);
  if (!Number.isFinite(Date.parse(recordedAt))) {
    throw new Error("Review requires a valid recording time");
  }
  const result: ArtifactReview = {
    schemaVersion: 1,
    kind: "artifact-review",
    id: mapId(review.id, "Review ID"),
    artifactKind: review.artifactKind as ArtifactReview["artifactKind"],
    artifactId: mapId(review.artifactId, "Reviewed artifact ID"),
    artifactHash: mapHash(review.artifactHash, "Reviewed artifact hash"),
    by: mapText(review.by, "Owner identity", 200),
    note: mapText(review.note, "Owner words", 4000),
    recordedAt,
    hash: mapHash(review.hash, "Review record hash"),
  };
  if (review.artifacts !== undefined) {
    if (!Array.isArray(review.artifacts) || review.artifacts.length > 1000) {
      throw new Error("Review artifacts must contain at most 1000 explicit references");
    }
    result.artifacts = review.artifacts.map((rawArtifact) => {
      const artifact = mapObject(rawArtifact, "Review artifact", [
        "path",
        "sha256",
      ]);
      return {
        path: mapPath(artifact.path, "Review artifact path"),
        sha256: mapHash(artifact.sha256, "Review artifact hash"),
      };
    });
    if (
      new Set(result.artifacts.map((artifact) => artifact.path)).size !== result.artifacts.length
    ) {
      throw new Error("Duplicate review artifact path");
    }
  }
  const { hash, ...body } = result;
  if (hash !== observationHash(body)) {
    throw new Error("Artifact review evidence hash mismatch");
  }
  return result;
}

/** Records supplied owner words; content hashes cannot authenticate identity or consent. */
export function createArtifactReview(input: ArtifactReviewInput): ArtifactReview {
  const body = {
    schemaVersion: 1 as const,
    kind: "artifact-review" as const,
    id: randomUUID(),
    ...input,
    recordedAt: new Date().toISOString(),
  };
  return validateArtifactReview({
    ...body,
    hash: observationHash(body),
  });
}

export function findArtifactReview(
  reviews: ArtifactReview[],
  artifactKind: ArtifactReview["artifactKind"],
  artifactId: string,
  artifactHash: string,
): ArtifactReview | undefined {
  return reviews
    .map(validateArtifactReview)
    .reverse()
    .find(
      (review) =>
        review.artifactKind === artifactKind &&
        review.artifactId === artifactId &&
        review.artifactHash === artifactHash,
    );
}
