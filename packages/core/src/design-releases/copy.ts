import { randomUUID } from "node:crypto";
import { lstat } from "node:fs/promises";
import type { PenpotToolClient } from "../client.js";
import { commandSignal, commandSleep } from "../command-result.js";
import { writeCoordinator } from "../coordination.js";
import { guardFile } from "../file-guard.js";
import {
  runJournaledSteps,
  readJournalTarget,
  readJournal,
  listJournals,
  observationHash,
  JournalRunError,
  type JournalStep,
} from "../journal.js";
import { withPageSession, selectPage, rememberPage } from "../page-session.js";
import { runSnippet } from "../snippet.js";
import type { NativeClipboard } from "../native-editor-clipboard.js";
import { ensureGitignoreEntry } from "../instance/gitignore.js";
import { atomicWriteFile } from "../atomic-output.js";
import { readProjectBytes } from "../bounded-file.js";
import { artifactPath, saveArtifact } from "./artifact-paths.js";
import { captureReleaseScreen } from "./live.js";
import {
  captureCopyEvidence,
  matchCopiedFrames,
  compareCopyEvidence,
  sourceEvidenceHash,
  type CopyFrameEvidence,
  type CopiedFramePair,
} from "./copy-evidence.js";
import {
  nativeCopyInspect,
  nativeCopyCreatePage,
  nativeCopySelect,
  nativeCopyObserve,
  nativeCopyArrange,
  type NativeCopyPlacement,
} from "./copy-snippets.js";
import {
  validateCopyRequest,
  readCopyPreview,
  copyRequestHash,
  type CopyRequest,
  type CopyPreview,
  type CopyObservation,
} from "./copy-plan.js";

export type { CopyRequest } from "./copy-plan.js";

export interface CopyOptions {
  apply?: boolean;
  resume?: boolean;
  runId?: string;
  redact?: (value: string) => string;
  onStep?: (message: string) => void;
  clipboard?: () => Promise<NativeClipboard>;
  sleep?: (milliseconds: number) => Promise<void>;
}

export interface CopyResult {
  schemaVersion: 1;
  kind: "native-release-copy";
  status: "preview" | "copied" | "incomplete";
  preview: CopyPreview;
  runId?: string;
  receiptPath?: string;
  pairs?: CopiedFramePair[];
  nativeVerified?: boolean;
  pixelsMatch?: boolean;
  problems: string[];
}

interface CopyPayload {
  kind: "native-release-copy-plan";
  request: CopyRequest;
  preview: CopyPreview;
  sources: CopyFrameEvidence[];
}

const operation = "design-release-copy";

async function observedDestination(
  client: PenpotToolClient,
  fileId: string,
  pageId: string,
): Promise<CopyObservation> {
  await selectPage(client, {
    id: pageId,
  });
  const result = await runSnippet(client, nativeCopyObserve(fileId, pageId), {
    effect: "read",
    retries: 0,
  });
  if (
    result.ok !== true ||
    result.fileId !== fileId ||
    result.pageId !== pageId ||
    !Array.isArray(result.rootIds) ||
    !Array.isArray(result.selectionIds) ||
    !Array.isArray(result.rootFrames) ||
    result.rootIds.some((id) => typeof id !== "string")
  ) {
    throw new Error("Destination inventory or selection was not independently observed");
  }
  return result as unknown as CopyObservation;
}

/** Copy native boards through an explicitly supplied editor transport; preview never touches clipboard or selection. */
export async function copyReleaseBoards(
  client: PenpotToolClient,
  root: string,
  request: CopyRequest,
  options: CopyOptions = {},
): Promise<CopyResult> {
  validateCopyRequest(request);
  if (options.resume && (!options.apply || !options.runId)) {
    throw new Error("Copy resume requires --apply and the original run ID");
  }
  client = guardFile(
    client,
    {
      id: request.fileId,
    },
    {
      mode: "strict",
    },
  );
  return withPageSession(client, async () => {
    const inspect = async (ownerKey?: string): Promise<CopyPreview> =>
      readCopyPreview(
        await runSnippet(
          client,
          nativeCopyInspect(
            request.fileId,
            request.sourcePage,
            request.frameIds,
            request.releaseVersion,
            ownerKey,
          ),
          {
            effect: "read",
            retries: 0,
          },
        ),
        request,
      );
    const current = await inspect();
    if (!options.apply) {
      return {
        schemaVersion: 1,
        kind: "native-release-copy",
        status: "preview",
        preview: current,
        problems: [
          "Native browser copy/paste is experimental; structural and stable-render verification follow an explicit apply.",
        ],
      };
    }
    if (!options.clipboard) {
      throw new Error("Native copy requires an explicitly configured browser clipboard transport");
    }
    const runId = options.runId ?? randomUUID();
    if (!/^[A-Za-z0-9-]{1,100}$/.test(runId)) {
      throw new Error("Invalid native copy run ID");
    }
    const assertNoConflictingRuns = async (): Promise<void> => {
      const records = await listJournals(root);
      for (const previous of records.filter(
        (record) => record.operation === operation && record.target.fileId === request.fileId,
      )) {
        if (previous.runId === runId) {
          continue;
        }
        const record = await readJournal(root, previous.runId);
        const payload = record.payload as CopyPayload | undefined;
        if (
          previous.state !== "verified" ||
          (payload?.kind === "native-release-copy-plan" &&
            copyRequestHash(payload.request) === copyRequestHash(request))
        ) {
          throw new Error(
            `Copy run ${previous.runId} already covers this transfer or requires reconciliation; use its explicit --resume before another paste`,
          );
        }
      }
    };
    await assertNoConflictingRuns();
    await ensureGitignoreEntry(root, ".penpair", {
      directory: true,
      comment: "penpair: private operation evidence",
    });
    const prefix = `.penpair/native-copy/${runId}`;
    const fencePath = await artifactPath(root, `${prefix}/paste-attempt.json`, true);
    let payload: CopyPayload;
    let attempted = false;
    let pageAttempted = false;
    if (options.resume) {
      const previous = await readJournal(root, runId);
      pageAttempted = previous.steps.some(
        (step) => step.key === "page" && step.state !== "pending",
      );
      payload = previous.payload as CopyPayload;
      if (
        !payload ||
        payload.kind !== "native-release-copy-plan" ||
        copyRequestHash(payload.request) !== copyRequestHash(request)
      ) {
        throw new Error("Copy resume inputs changed; no clipboard operation was dispatched");
      }
      // The durable fence is written before the only paste call. A started
      // journal step may have stopped earlier during page/selection preparation.
      try {
        await lstat(fencePath);
        attempted = true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
      }
    } else {
      const sources = await captureCopyEvidence(
        client,
        root,
        request.fileId,
        current.sourcePageId,
        request.frameIds,
        `${prefix}/source`,
        options.redact,
      );
      payload = {
        kind: "native-release-copy-plan",
        request,
        preview: current,
        sources,
      };
      await saveArtifact(
        root,
        `${prefix}/plan.json`,
        `${JSON.stringify(payload)}\n`,
        options.redact,
      );
    }
    if (Buffer.byteLength(JSON.stringify(payload)) > 16 * 1024 * 1024) {
      throw new Error("Native transfer plan exceeds 16 MiB");
    }
    const baseline = payload.preview;
    let pinnedDestinationId = baseline.destinationPageId;
    const readSource = async (): Promise<void> => {
      for (const source of payload.sources) {
        const observed = await captureReleaseScreen(
          client,
          request.fileId,
          baseline.sourcePageId,
          source.frameId,
        );
        if (observationHash(observed.nodes) !== observationHash(source.inspection.nodes)) {
          throw new Error(
            "Source board content changed; retain the run and make a new reviewed plan",
          );
        }
      }
    };
    const targetPreview = async (): Promise<CopyPreview> => {
      const value = await inspect(runId);
      if (
        !baseline.destinationPageId &&
        value.destinationPageId &&
        value.createdPageOwner !== runId
      ) {
        throw new Error("A different page appeared at the planned destination");
      }
      if (pinnedDestinationId && value.destinationPageId !== pinnedDestinationId) {
        throw new Error("Pinned destination page was replaced or renamed");
      }
      if (value.destinationPageId) {
        pinnedDestinationId = value.destinationPageId;
      }
      if (
        value.sourcePageId !== baseline.sourcePageId ||
        (baseline.destinationPageId && value.destinationPageId !== baseline.destinationPageId)
      ) {
        throw new Error("Pinned copy page identity changed");
      }
      return value;
    };
    const addedRoots = (value: CopyPreview): string[] =>
      value.destinationRootIds.filter((id) => !baseline.destinationRootIds.includes(id));
    const inventoryComplete = (value: CopyPreview): boolean =>
      addedRoots(value).length === request.frameIds.length &&
      baseline.destinationRootIds.every((id) => value.destinationRootIds.includes(id));
    const pasteComplete = (value: CopyPreview): boolean =>
      attempted &&
      inventoryComplete(value) &&
      pairs.length === request.frameIds.length &&
      pairs.every((pair) => addedRoots(value).includes(pair.targetFrameId));
    let pairs: CopiedFramePair[] = [];
    let placements: NativeCopyPlacement[] = [];
    const mappingPath = `${prefix}/mapping.json`;
    try {
      await artifactPath(root, mappingPath);
      const saved = JSON.parse(
        (await readProjectBytes(root, mappingPath, 1024 * 1024)).toString("utf8"),
      );
      if (
        saved.requestHash !== copyRequestHash(request) ||
        !Array.isArray(saved.pairs) ||
        saved.pairs.length !== request.frameIds.length ||
        saved.pairs.some(
          (pair: CopiedFramePair, index: number) =>
            !pair ||
            pair.sourceFrameId !== request.frameIds[index] ||
            typeof pair.targetFrameId !== "string",
        ) ||
        new Set(saved.pairs.map((pair: CopiedFramePair) => pair.targetFrameId)).size !==
          saved.pairs.length
      ) {
        throw new Error("Saved native copy mapping is invalid");
      }
      pairs = saved.pairs;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
    const calculatePlacements = (): NativeCopyPlacement[] => {
      let x = 0;
      const y = Math.max(1000, baseline.destinationBounds.bottom + 160);
      return pairs.map((pair) => {
        const source = baseline.sourceFrames.find((frame) => frame.id === pair.sourceFrameId)!;
        const placement = {
          id: pair.targetFrameId,
          x,
          y,
        };
        x += source.width + 160;
        return placement;
      });
    };
    const identifyPasted = async (): Promise<CopyPreview> => {
      const value = await targetPreview();
      if (!attempted || !inventoryComplete(value) || !value.destinationPageId) {
        return value;
      }
      if (!pairs.length) {
        const observed = await observedDestination(client, request.fileId, value.destinationPageId);
        const ids = addedRoots(value);
        if (
          observationHash(
            [
              ...observed.selectionIds,
            ].sort(),
          ) !==
          observationHash(
            [
              ...ids,
            ].sort(),
          )
        ) {
          throw new Error(
            "Pasted selection does not uniquely identify the new boards; inspect without replay",
          );
        }
        const targets = await captureCopyEvidence(
          client,
          root,
          request.fileId,
          value.destinationPageId,
          ids,
          `${prefix}/pasted-${randomUUID()}`,
          options.redact,
        );
        pairs = matchCopiedFrames(payload.sources, targets);
        await saveArtifact(
          root,
          mappingPath,
          JSON.stringify({
            requestHash: copyRequestHash(request),
            pairs,
          }),
          options.redact,
        );
      }
      placements = calculatePlacements();
      return value;
    };
    const arrangementState = async (): Promise<CopyPreview> => {
      const value = await identifyPasted();
      if (!value.destinationPageId || !pasteComplete(value)) {
        return value;
      }
      const observed = await observedDestination(client, request.fileId, value.destinationPageId);
      value.arranged = placements.every((placement) =>
        observed.rootFrames.some(
          (frame) =>
            frame.id === placement.id &&
            frame.x === placement.x &&
            frame.y === placement.y &&
            frame.copyRunId === runId,
        ),
      );
      return value;
    };
    const pageStep: JournalStep<CopyPreview> = {
      key: "page",
      label: "Prepare the release destination page",
      signature: nativeCopyCreatePage(request.fileId, request.releaseVersion, runId).code,
      inspect: targetPreview,
      apply: async () => {
        await readSource();
        pageAttempted = true;
        const result = await runSnippet(
          client,
          nativeCopyCreatePage(request.fileId, request.releaseVersion, runId),
          {
            effect: "write",
            retries: 0,
          },
        );
        if (typeof result.pageId !== "string") {
          throw new Error("Created release page identity was not acknowledged");
        }
        rememberPage(client, {
          fileId: request.fileId,
          pageId: result.pageId,
        });
        return result;
      },
      verify: (value) => Boolean(value.destinationPageId) && value.destinationNamed !== false,
      reconcile: (_before, value) =>
        value.destinationPageId && value.destinationNamed !== false
          ? "complete"
          : pageAttempted && !value.destinationPageId
            ? "conflict"
            : "pending",
    };
    const pasteStep: JournalStep<CopyPreview> = {
      key: "paste",
      label: "Copy selected native boards and paste once",
      signature: "native-clipboard-batch-v1-no-replay",
      inspect: identifyPasted,
      apply: async (value) => {
        if (
          attempted ||
          !value.destinationPageId ||
          addedRoots(value).length ||
          !baseline.destinationRootIds.every((id) => value.destinationRootIds.includes(id))
        ) {
          throw new Error("Paste is fenced or destination changed; inspect without replaying");
        }
        await readSource();
        const clipboard = await options.clipboard!();
        try {
          await selectPage(client, {
            id: baseline.sourcePageId,
          });
          await runSnippet(
            client,
            nativeCopySelect(request.fileId, baseline.sourcePageId, request.frameIds),
            {
              effect: "write",
              retries: 0,
            },
          );
          const selection = await observedDestination(
            client,
            request.fileId,
            baseline.sourcePageId,
          );
          if (
            observationHash(
              [
                ...selection.selectionIds,
              ].sort(),
            ) !==
            observationHash(
              [
                ...request.frameIds,
              ].sort(),
            )
          ) {
            throw new Error("Source board selection changed before copy");
          }
          await clipboard.copy(baseline.sourcePageId, request.frameIds);
          await selectPage(client, {
            id: value.destinationPageId,
          });
          await runSnippet(client, nativeCopySelect(request.fileId, value.destinationPageId, []), {
            effect: "write",
            retries: 0,
          });
          const destination = await targetPreview();
          if (
            observationHash(destination.destinationRootIds) !==
            observationHash(baseline.destinationRootIds)
          ) {
            throw new Error("Destination changed before paste");
          }
          const empty = await observedDestination(client, request.fileId, value.destinationPageId);
          if (empty.selectionIds.length) {
            throw new Error("Destination selection changed before paste");
          }
          await atomicWriteFile(
            fencePath,
            JSON.stringify({
              schemaVersion: 1,
              runId,
              fileId: request.fileId,
              pageId: value.destinationPageId,
              requestHash: copyRequestHash(request),
            }),
          );
          attempted = true;
          await clipboard.paste(value.destinationPageId);
          for (let poll = 0; poll < 25; poll++) {
            if (inventoryComplete(await targetPreview())) {
              return {
                dispatched: true,
              };
            }
            await (options.sleep ?? commandSleep)(200);
          }
          throw new Error(
            "Paste acknowledgment did not establish new boards; reconcile without replay",
          );
        } finally {
          await clipboard.close();
        }
      },
      verify: pasteComplete,
      reconcile: (_before, value) =>
        pasteComplete(value)
          ? "complete"
          : attempted || addedRoots(value).length
            ? "conflict"
            : "pending",
    };
    const arrangeStep: JournalStep<CopyPreview> = {
      key: "arrange",
      label: "Identify and arrange only the new native copies",
      signature: "native-copy-arrange-v1",
      inspect: arrangementState,
      apply: async (value) => {
        if (!value.destinationPageId || !pasteComplete(value)) {
          throw new Error("Copied root inventory is incomplete");
        }
        placements = calculatePlacements();
        await readSource();
        await selectPage(client, {
          id: value.destinationPageId,
        });
        return runSnippet(
          client,
          nativeCopyArrange(request.fileId, value.destinationPageId, placements, runId),
          {
            effect: "write",
            retries: 0,
          },
        );
      },
      verify: (value) => pasteComplete(value) && value.arranged === true,
      reconcile: (_before, value) =>
        pasteComplete(value) ? (value.arranged === true ? "complete" : "pending") : "conflict",
    };
    let finalResult: CopyResult | undefined;
    let receiptPersisted = false;
    try {
      await runJournaledSteps(
        [
          pageStep,
          pasteStep,
          arrangeStep,
        ],
        {
          root,
          operation,
          input: request,
          payload,
          runId,
          resume: options.resume,
          target: () => readJournalTarget(client),
          coordinate: async (identity, target) => {
            const lease = await writeCoordinator(client, {
              root,
              operation,
              warn: options.onStep,
            })(identity, target);
            try {
              await assertNoConflictingRuns();
              return lease;
            } catch (error) {
              await lease.release();
              throw error;
            }
          },
          redact: options.redact,
          onStep: options.onStep,
          finalVerify: async () => {
            const destination = await arrangementState();
            if (
              !destination.destinationPageId ||
              !pasteComplete(destination) ||
              !destination.arranged
            ) {
              return false;
            }
            const targets = await captureCopyEvidence(
              client,
              root,
              request.fileId,
              destination.destinationPageId,
              pairs.map((pair) => pair.targetFrameId),
              `${prefix}/target-${randomUUID()}`,
              options.redact,
            );
            const verifiedPairs = matchCopiedFrames(payload.sources, targets);
            if (observationHash(verifiedPairs) !== observationHash(pairs)) {
              throw new Error("Copied identities changed before final readback");
            }
            const verification = compareCopyEvidence(payload.sources, targets, pairs);
            const originals = await captureCopyEvidence(
              client,
              root,
              request.fileId,
              baseline.sourcePageId,
              request.frameIds,
              `${prefix}/source-readback-${randomUUID()}`,
              options.redact,
            );
            if (sourceEvidenceHash(originals) !== sourceEvidenceHash(payload.sources)) {
              throw new Error(
                "Original boards changed during transfer; independent reconciliation is required",
              );
            }
            await selectPage(client, {
              id: destination.destinationPageId,
            });
            finalResult = {
              schemaVersion: 1,
              kind: "native-release-copy",
              status:
                verification.nativeVerified && verification.pixelsMatch ? "copied" : "incomplete",
              preview: destination,
              runId,
              receiptPath: `${prefix}/receipt.json`,
              pairs,
              nativeVerified: verification.nativeVerified,
              pixelsMatch: verification.pixelsMatch,
              problems: verification.problems,
            };
            const receipt = JSON.stringify(
              {
                ...finalResult,
                nodeMap: verification.nodeMap,
                sourceEvidence: payload.sources.map(
                  ({ inspection: _inspection, ...source }) => source,
                ),
                targetEvidence: targets.map(({ inspection: _inspection, ...target }) => target),
              },
              null,
              2,
            );
            const receiptFile = await artifactPath(root, finalResult.receiptPath!, true);
            if (options.redact && options.redact(receipt) !== receipt) {
              throw new Error("Copy receipt requires credential redaction");
            }
            await atomicWriteFile(receiptFile, `${receipt}\n`, {
              replace: true,
            });
            receiptPersisted = true;
            return verification.nativeVerified && verification.pixelsMatch;
          },
        },
      );
    } catch (error) {
      if (
        finalResult?.status === "incomplete" &&
        receiptPersisted &&
        error instanceof JournalRunError &&
        error.outcome === "failed"
      ) {
        return finalResult;
      }
      throw error;
    }
    if (!finalResult) {
      throw new Error("Native copy final verification did not run");
    }
    return finalResult;
  });
}
