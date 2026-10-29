import { lstat } from "node:fs/promises";
import type { PenpotToolClient } from "../client.js";
import { observationHash, readJournalTarget, runJournaledSteps } from "../journal.js";
import type { ArtifactReview } from "../maps/types.js";
import { validateArtifactReview, findArtifactReview } from "../maps/review.js";
import { guardRevision } from "../coordination.js";
import { withPageSession } from "../page-session.js";
import { runSnippet } from "../snippet.js";
import { artifactPath, readArtifact, saveArtifact } from "./artifact-paths.js";
import { checkRelease, releaseReferences, type ReleaseBundle } from "./check.js";
import { observeRelease, releaseClient, type ReleaseObservation } from "./live.js";
import { readReleaseContract, writeDesignRelease, readDesignRelease } from "./store.js";
import { finalizeReleaseSnippet } from "./snippets.js";
import { validateDesignRelease, hashDesignRelease } from "./validation.js";
import type { DesignRelease, ReleaseOptions } from "./types.js";

export async function finalizeRelease(
  client: PenpotToolClient,
  root: string,
  raw: DesignRelease,
  suppliedReview: ArtifactReview | undefined,
  options: ReleaseOptions = {},
): Promise<DesignRelease> {
  const release = validateDesignRelease(raw);
  if (release.status !== "verified" && release.status !== "final") {
    throw new Error("Only fully verified design evidence can be finalized");
  }
  client = releaseClient(client, release);
  const checkStart = await readJournalTarget(client);
  const checked = await checkRelease(client, root, release, options);
  const checkedTarget = await readJournalTarget(client);
  if (
    checkStart.fileId !== checkedTarget.fileId ||
    checkStart.revision !== checkedTarget.revision
  ) {
    throw new Error("Release changed during the independent final check");
  }
  if (!checked.valid) {
    throw new Error(`Release finalization is blocked: ${checked.reasons.join("; ")}`);
  }
  if (!options.apply || release.status === "final") {
    return release;
  }
  let review = validateArtifactReview(suppliedReview);
  const designHash = hashDesignRelease(release);
  if (
    !findArtifactReview(
      [
        review,
      ],
      "design-release",
      release.id,
      designHash,
    )
  ) {
    throw new Error("Owner review must bind the exact verified release design hash");
  }
  client = releaseClient(client, release);
  return withPageSession(client, async () => {
    const pointer = options.pointerPath ?? `design/releases/${release.productVersion}/release.json`;
    const pointerFile = await artifactPath(root, pointer, true);
    try {
      await lstat(pointerFile);
      const existing = await readDesignRelease(root, pointer);
      if (existing.status === "final") {
        throw new Error(
          "This product version is already finalized; ordinary writes cannot replace it",
        );
      }
      if (existing.id !== release.id || existing.productVersion !== release.productVersion) {
        throw new Error("Final pointer belongs to another release identity");
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
    const bundlePath = `design/releases/${release.productVersion}/approved/bundle.json`;
    const bundleFile = await artifactPath(root, bundlePath, true);
    let storedBundle: ReleaseBundle | undefined;
    try {
      await lstat(bundleFile);
      const { readProjectBytes } = await import("../bounded-file.js");
      storedBundle = JSON.parse(
        (await readProjectBytes(root, bundlePath, 16 * 1024 * 1024)).toString("utf8"),
      ) as ReleaseBundle;
      const originalReview = validateArtifactReview(storedBundle.review);
      if (
        storedBundle.schemaVersion !== 1 ||
        storedBundle.kind !== "approved-design-release" ||
        storedBundle.designHash !== designHash ||
        hashDesignRelease(storedBundle.release) !== designHash ||
        originalReview.by !== review.by ||
        originalReview.note !== review.note ||
        originalReview.artifactHash !== review.artifactHash ||
        observationHash(originalReview.artifacts ?? []) !== observationHash(review.artifacts ?? [])
      ) {
        throw new Error("Product version already has a different immutable design/review bundle");
      }
      review = originalReview;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
    const references = releaseReferences(release);
    for (const contract of release.contracts) {
      const map = await readReleaseContract(root, contract);
      for (const source of map.sources) {
        if (source.path) {
          references.push({
            path: source.path,
            sha256: source.sha256,
          });
        }
      }
    }
    for (const artifact of review.artifacts ?? []) {
      references.push(artifact);
    }
    const snapshots: ReleaseBundle["artifacts"] = [];
    for (const original of new Map(
      references.map((reference) => [
        `${reference.path}:${reference.sha256}`,
        reference,
      ]),
    ).values()) {
      const bytes = await readArtifact(root, original, 64 * 1024 * 1024);
      const snapshot = await saveArtifact(
        root,
        `design/releases/${release.productVersion}/approved/artifacts/${original.sha256}.bin`,
        bytes,
        options.redact,
      );
      snapshots.push({
        original,
        snapshot,
      });
    }
    const bundle: ReleaseBundle = storedBundle ?? {
      schemaVersion: 1,
      kind: "approved-design-release",
      designHash,
      release,
      review,
      artifacts: snapshots,
    };
    const serialized = `${JSON.stringify(bundle, null, 2)}\n`;
    if (Buffer.byteLength(serialized) > 16 * 1024 * 1024) {
      throw new Error("Immutable release bundle exceeds the 16-MiB budget");
    }
    const bundleReference = await saveArtifact(root, bundlePath, serialized, options.redact);
    for (const item of bundle.artifacts) {
      await readArtifact(root, item.snapshot, 64 * 1024 * 1024);
    }
    const final = validateDesignRelease({
      ...release,
      status: "final",
      reviews: [
        ...release.reviews,
        review,
      ],
      finalized: {
        bundle: bundleReference,
        markerHash: bundleReference.sha256,
        reviewHash: review.hash,
      },
    });
    const offline = await checkRelease(undefined, root, final, options);
    if (!offline.valid) {
      throw new Error(
        `Immutable bundle is invalid; remote marker not written: ${offline.reasons.join("; ")}`,
      );
    }
    const before = await observeRelease(client, release);
    const beforeMarker = await readJournalTarget(client);
    if (
      beforeMarker.fileId !== checkedTarget.fileId ||
      beforeMarker.revision !== checkedTarget.revision
    ) {
      throw new Error("Release changed while preparing its immutable bundle; marker not written");
    }
    const complete = (observation: ReleaseObservation): boolean =>
      Boolean(
        observation.marker?.status === "released" &&
          observation.marker.bundleHash === bundleReference.sha256 &&
          observation.marker.reviewHash === review.hash,
      );
    if (before.marker?.status === "released" && !complete(before)) {
      throw new Error("Remote release marker belongs to different immutable evidence");
    }
    if (!complete(before)) {
      await runJournaledSteps<ReleaseObservation>(
        [
          {
            key: "released-marker",
            label: "Mark independently verified design release",
            signature: finalizeReleaseSnippet(release, bundleReference.sha256, review.hash).code,
            initial: before,
            inspect: () => observeRelease(client, release),
            apply: () =>
              runSnippet(
                guardRevision(client, checkedTarget),
                finalizeReleaseSnippet(release, bundleReference.sha256, review.hash),
                {
                  retries: 0,
                  effect: "write",
                },
              ),
            verify: complete,
            reconcile: (_before, current) =>
              complete(current)
                ? "complete"
                : current.marker?.status === "draft"
                  ? "pending"
                  : "conflict",
          },
        ],
        {
          root,
          operation: "design-release-finalize",
          payload: {
            kind: "design-release-operation",
            releaseId: release.id,
            productVersion: release.productVersion,
            designHash,
          },
          input: {
            designHash,
            bundleHash: bundleReference.sha256,
            reviewHash: review.hash,
          },
          runId: options.runId ?? `finalize-${release.target.ownerKey.slice(0, 32)}`,
          resume: options.resume,
          target: () => readJournalTarget(client),
          redact: options.redact,
          onStep: options.onStep,
        },
      );
    }
    const observed = await observeRelease(client, release);
    if (!complete(observed)) {
      throw new Error(
        "Independent finalized marker readback failed; local final pointer not written",
      );
    }

    const rechecked = await checkRelease(client, root, final, options);
    if (!rechecked.valid) {
      throw new Error(
        `Release changed after its remote marker; local final pointer not written: ${rechecked.reasons.join("; ")}`,
      );
    }
    // The immutable bundle and remote readback exist before the authoritative local pointer changes.
    await writeDesignRelease(root, pointer, final, options);
    return final;
  });
}
