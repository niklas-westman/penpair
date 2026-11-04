import { randomUUID } from "node:crypto";
import { capturePhase, type ProgressOptions } from "../capture-progress.js";
import { lstat } from "node:fs/promises";
import type { PenpotToolClient } from "../client.js";
import { commandSignal, commandSleep } from "../command-result.js";
import { writeCoordinator } from "../coordination.js";
import { guardFile } from "../file-guard.js";
import {
  runJournaledSteps,
  readJournalTarget,
  readJournal,
  markJournalAbandoned,
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
  inspectConcurrently,
  matchCopiedFrames,
  compareCopyEvidence,
  componentInstanceCount,
  measureFramePixelDifferences,
  pixelMismatchedPairs,
  pixelTolerance,
  withSettledPixels,
  type FramePixelDifference,
  sourceEvidenceHash,
  sourceStructureHash,
  type CopyFrameEvidence,
  type CopiedFramePair,
} from "./copy-evidence.js";
import type { PenpotBackendClient } from "../penpot-backend.js";
import { isEditorBusy, whileEditorBusy } from "./editor-busy.js";
import {
  captureBackendSources,
  changedSources,
  matchBackendFrames,
  readBackendPageWhen,
  verifyBackendPairs,
  type BackendFrameEvidence,
} from "./backend-evidence.js";
import type { BackendObjects } from "./backend-compare.js";
import {
  comparePairPixels,
  sampledPairs,
  type PixelFinding,
  type PixelVerification,
} from "./pixel-sample.js";
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

export interface CopyOptions extends ProgressOptions {
  apply?: boolean;
  resume?: boolean;
  runId?: string;
  redact?: (value: string) => string;
  onStep?: (message: string) => void;
  clipboard?: () => Promise<NativeClipboard>;
  /** Read-only backend access (a personal access token). With it, structure is verified on stored data instead of by plugin reads. */
  backend?: PenpotBackendClient;
  /** Backend route only: which boards are also compared by rendered pixels. Defaults to all of them. */
  verifyPixels?: PixelVerification;
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
  /** Frames whose pixels were not bit-identical, with the measured difference and whether it is within tolerance. */
  pixelDifferences?: FramePixelDifference[];
  /** How the pixels were proven: one render per side, or a settled double render for pairs that differed. */
  render?: {
    singleRender: number;
    settledRerender: string[];
  };
  /** What verification could not observe; present when the boards contain component instances. */
  caveats?: string[];
  /** Where the structural evidence came from: the Penpot backend's stored data, or reads through the editor plugin. */
  evidence?: "backend" | "plugin";
  /** Present when this exact transfer had already been copied and verified; nothing was pasted this time. */
  alreadyCopied?: {
    runId: string;
  };
  /**
   * Backend route: boards whose sizes or positions Penpot recomputed while pasting, because every shape that differs sits
   * under an automatic layout. Not a failure; it shows that the source holds sizes that no longer match its own layout.
   */
  layoutRecomputed?: {
    /** Source board ids. */
    frames: string[];
    shapes: number;
    note: string;
  };
  /** Backend route only: how long the backend trailed the editor before it showed the pasted and the arranged boards. */
  backendWaitMs?: {
    paste: number;
    arrange: number;
  };
  /** Backend route only: what was compared by pixels, and what was not. */
  pixels?: {
    mode: PixelVerification;
    compared: string[];
    settled: string[];
    notCompared: number;
    /** Boards left out because a recomputed layout makes them differ from their originals on purpose. */
    notComparable: string[];
    differences: PixelFinding[];
  };
}

interface CopyPayload {
  kind: "native-release-copy-plan";
  request: CopyRequest;
  preview: CopyPreview;
  sources: CopyFrameEvidence[];
  /** Present when the plan was recorded from the backend; `sources` is then empty. */
  backendSources?: BackendFrameEvidence[];
}

const operation = "design-release-copy";
const layoutRecomputedNote =
  "Penpot recomputes automatic layouts while pasting. In these boards the source holds sizes that no longer match its own layout, so the copy has the recomputed sizes and its render differs from the source's stored state on purpose. Every other attribute is identical. Refresh the source's layout in Penpot when convenient.";
const pasteSettlePolls = 25 + 300;
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
    const pause = options.sleep ?? commandSleep;
    const inspect = async (ownerKey?: string): Promise<CopyPreview> =>
      whileEditorBusy(
        async () =>
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
          ),
        pause,
      );
    const observe = (pageId: string): Promise<CopyObservation> =>
      whileEditorBusy(() => observedDestination(client, request.fileId, pageId), pause);
    const current = await capturePhase(options, "design-release copy", "selection", () =>
      inspect(),
    );
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
    const evidenceProgress = {
      signal: options.signal,
      onProgress: options.onProgress
        ? (event: import("../capture-progress.js").CaptureProgress) =>
            options.onProgress?.({
              ...event,
              runId,
            })
        : undefined,
    };
    options.onProgress?.({
      schemaVersion: 1,
      kind: "progress",
      command: "design-release copy",
      phase: "prepare",
      status: "started",
      elapsedMs: 0,
      runId,
      message: options.resume
        ? "Reconciling the recorded transfer; paste is not replayed automatically"
        : "Collecting source evidence before journaled writes; no paste has been dispatched",
    });
    // The fence is written immediately before the only paste, so a run without one never changed the destination boards.
    const pasteWasDispatched = async (previousRunId: string): Promise<boolean> => {
      try {
        await lstat(
          await artifactPath(
            root,
            `.penpair/native-copy/${previousRunId}/paste-attempt.json`,
            true,
          ),
        );
        return true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return false;
        }
        throw error;
      }
    };
    const assertNoConflictingRuns = async (): Promise<void> => {
      const records = await listJournals(root);
      for (const previous of records.filter(
        (record) => record.operation === operation && record.target.fileId === request.fileId,
      )) {
        if (
          previous.runId === runId ||
          (previous.state !== "verified" && !(await pasteWasDispatched(previous.runId)))
        ) {
          continue;
        }
        const record = await readJournal(root, previous.runId);
        if (record.abandoned) {
          continue;
        }
        const payload = record.payload as CopyPayload | undefined;
        if (
          previous.state !== "verified" ||
          (payload?.kind === "native-release-copy-plan" &&
            copyRequestHash(payload.request) === copyRequestHash(request))
        ) {
          throw new Error(
            `Copy run ${previous.runId} already covers this transfer or requires reconciliation. Resume it with --resume ${previous.runId} --apply, or, once you have looked at its destination page, drop it with --abandon ${previous.runId} --reason TEXT --destination-inspected`,
          );
        }
      }
    };
    // The same transfer, already verified and still in place, is answered with its receipt: nothing is pasted a second time.
    const completedEarlier = async (): Promise<CopyResult | undefined> => {
      for (const previous of await listJournals(root)) {
        if (
          previous.operation !== operation ||
          previous.target.fileId !== request.fileId ||
          previous.state !== "verified"
        ) {
          continue;
        }
        const record = await readJournal(root, previous.runId);
        const planned = record.payload as CopyPayload | undefined;
        if (
          record.abandoned ||
          planned?.kind !== "native-release-copy-plan" ||
          copyRequestHash(planned.request) !== copyRequestHash(request)
        ) {
          continue;
        }
        let receipt: Record<string, unknown>;
        try {
          receipt = JSON.parse(
            (
              await readProjectBytes(
                root,
                `.penpair/native-copy/${previous.runId}/receipt.json`,
                16 * 1024 * 1024,
              )
            ).toString("utf8"),
          );
        } catch {
          continue;
        }
        const earlierPairs = receipt.pairs as CopiedFramePair[] | undefined;
        if (
          receipt.status !== "copied" ||
          !Array.isArray(earlierPairs) ||
          !earlierPairs.every((pair) => current.destinationRootIds.includes(pair.targetFrameId))
        ) {
          continue;
        }
        const {
          nodeMap: _nodeMap,
          sourceEvidence: _sourceEvidence,
          targetEvidence: _targetEvidence,
          nodes: _nodes,
          ...result
        } = receipt;
        return {
          ...(result as unknown as CopyResult),
          preview: current,
          alreadyCopied: {
            runId: previous.runId,
          },
        };
      }
      return undefined;
    };
    if (!options.resume) {
      const earlier = await completedEarlier();
      if (earlier) {
        return earlier;
      }
    }
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
    } else if (options.backend) {
      const backendSources = await capturePhase(
        evidenceProgress,
        "design-release copy",
        "prepare",
        () =>
          captureBackendSources(
            options.backend!,
            root,
            request.fileId,
            current.sourcePageId,
            request.frameIds,
            `${prefix}/source`,
            options.redact,
            options.signal,
          ),
      );
      payload = {
        kind: "native-release-copy-plan",
        request,
        preview: current,
        sources: [],
        backendSources,
      };
      await saveArtifact(
        root,
        `${prefix}/plan.json`,
        `${JSON.stringify(payload)}\n`,
        options.redact,
      );
    } else {
      const sources = await captureCopyEvidence(
        client,
        root,
        request.fileId,
        current.sourcePageId,
        request.frameIds,
        `${prefix}/source`,
        options.redact,
        {
          ...evidenceProgress,
          phase: "prepare",
          render: "single",
        },
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
    const backendSources = payload.backendSources;
    const backend = options.backend;
    if (backendSources && !backend) {
      throw new Error(
        "This run recorded its evidence from the Penpot backend; resume it with the access token configured (PENPAIR_PAT_TOKEN)",
      );
    }
    const baseline = payload.preview;
    let pinnedDestinationId = baseline.destinationPageId;
    const readSource = async (): Promise<void> => {
      if (backendSources) {
        const page = await backend!.getPage(request.fileId, baseline.sourcePageId, options.signal);
        if (changedSources(backendSources, page.objects).length) {
          throw new Error(
            "Source board content changed; retain the run and make a new reviewed plan",
          );
        }
        return;
      }
      const inspectedAhead = await inspectConcurrently(
        client,
        request.fileId,
        baseline.sourcePageId,
        payload.sources.map((source) => source.frameId),
      );
      for (const source of payload.sources) {
        const observed =
          inspectedAhead.get(source.frameId) ??
          (await captureReleaseScreen(
            client,
            request.fileId,
            baseline.sourcePageId,
            source.frameId,
          ));
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
    let pasteWaitMs = 0;
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
        const observed = await observe(value.destinationPageId);
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
        if (backendSources) {
          // The editor saves to the backend a little later; wait until it shows every pasted board.
          const read = await capturePhase(evidenceProgress, "design-release copy", "verify", () =>
            readBackendPageWhen(
              backend!,
              request.fileId,
              value.destinationPageId!,
              (objects) => ids.every((id) => objects[id]),
              {
                signal: options.signal,
                sleep: options.sleep,
              },
            ),
          );
          pasteWaitMs = read.waitedMs;
          pairs = matchBackendFrames(backendSources, read.objects, ids);
          await saveArtifact(
            root,
            mappingPath,
            JSON.stringify({
              requestHash: copyRequestHash(request),
              pairs,
            }),
            options.redact,
          );
          placements = calculatePlacements();
          return value;
        }
        const targets = await captureCopyEvidence(
          client,
          root,
          request.fileId,
          value.destinationPageId,
          ids,
          `${prefix}/pasted-${randomUUID()}`,
          options.redact,
          {
            ...evidenceProgress,
            phase: "verify",
            // Pairing sources to pasted boards needs structure; pixels are compared once, at final verification.
            render: "none",
          },
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
      const observed = await observe(value.destinationPageId);
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
      repeatInspectionOnRevisionChange: true,
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
      repeatInspectionOnRevisionChange: true,
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
          const selection = await observe(baseline.sourcePageId);
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
          const empty = await observe(value.destinationPageId);
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
          // A large paste keeps the editor busy for minutes; a read that times out then says nothing about the paste, so keep asking.
          for (let poll = 0; poll < pasteSettlePolls; poll++) {
            try {
              if (inventoryComplete(await targetPreview())) {
                return {
                  dispatched: true,
                };
              }
            } catch (error) {
              if (!isEditorBusy(error)) {
                throw error;
              }
            }
            await (options.sleep ?? commandSleep)(poll < 25 ? 200 : 2000);
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
      repeatInspectionOnRevisionChange: true,
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
    const writeReceipt = async (result: CopyResult, evidence: object): Promise<void> => {
      const receipt = JSON.stringify(
        {
          ...result,
          ...evidence,
        },
        null,
        2,
      );
      const receiptFile = await artifactPath(root, result.receiptPath!, true);
      if (options.redact && options.redact(receipt) !== receipt) {
        throw new Error("Copy receipt requires credential redaction");
      }
      await atomicWriteFile(receiptFile, `${receipt}\n`, {
        replace: true,
      });
      receiptPersisted = true;
    };
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
            if (backendSources) {
              const destinationPageId = destination.destinationPageId;
              const isArranged = (objects: BackendObjects): boolean =>
                placements.every((placement) => {
                  const board = objects[placement.id];
                  return (
                    !!board &&
                    Math.abs(Number(board.x) - placement.x) < 0.01 &&
                    Math.abs(Number(board.y) - placement.y) < 0.01
                  );
                });
              const target = await capturePhase(
                evidenceProgress,
                "design-release copy",
                "verify",
                () =>
                  readBackendPageWhen(backend!, request.fileId, destinationPageId, isArranged, {
                    signal: options.signal,
                    sleep: options.sleep,
                  }),
              );
              const original = await backend!.getPage(
                request.fileId,
                baseline.sourcePageId,
                options.signal,
              );
              if (changedSources(backendSources, original.objects).length) {
                throw new Error(
                  "Original boards changed during transfer; independent reconciliation is required",
                );
              }
              const matched = matchBackendFrames(
                backendSources,
                target.objects,
                pairs.map((pair) => pair.targetFrameId),
              );
              if (observationHash(matched) !== observationHash(pairs)) {
                throw new Error("Copied identities changed before final readback");
              }
              const verdict = verifyBackendPairs(original.objects, target.objects, pairs);
              const pixelMode = options.verifyPixels ?? "all";
              // A board whose layout was recomputed differs from its original on purpose, so its pixels are not comparable.
              const comparable = pairs.filter(
                (pair) => !verdict.layoutDriven.frames.includes(pair.sourceFrameId),
              );
              const sampled = sampledPairs(pixelMode, comparable, backendSources);
              const pixelResult = await capturePhase(
                evidenceProgress,
                "design-release copy",
                "verify",
                () =>
                  comparePairPixels(
                    client,
                    root,
                    {
                      source: baseline.sourcePageId,
                      target: destinationPageId,
                    },
                    sampled,
                    `${prefix}/pixels-${randomUUID()}`,
                    verdict.nativeVerified,
                    options.redact,
                  ),
              );
              await selectPage(client, {
                id: destinationPageId,
              });
              const pixelsPassed = pixelResult.problems.length === 0;
              finalResult = {
                schemaVersion: 1,
                kind: "native-release-copy",
                status: verdict.nativeVerified && pixelsPassed ? "copied" : "incomplete",
                preview: destination,
                runId,
                receiptPath: `${prefix}/receipt.json`,
                pairs,
                nativeVerified: verdict.nativeVerified,
                // Nothing compared is not a match: leave the claim out rather than say it.
                ...(pixelMode === "none" || pixelResult.compared.length === 0
                  ? {}
                  : {
                      pixelsMatch: pixelsPassed,
                    }),
                problems: [
                  ...verdict.problems,
                  ...pixelResult.problems,
                ],
                evidence: "backend",
                ...(verdict.layoutDriven.shapes
                  ? {
                      layoutRecomputed: {
                        frames: verdict.layoutDriven.frames,
                        shapes: verdict.layoutDriven.shapes,
                        note: layoutRecomputedNote,
                      },
                    }
                  : {}),
                backendWaitMs: {
                  paste: pasteWaitMs,
                  arrange: target.waitedMs,
                },
                pixels: {
                  mode: pixelMode,
                  compared: pixelResult.compared,
                  settled: pixelResult.settled,
                  notCompared: pairs.length - pixelResult.compared.length,
                  notComparable: verdict.layoutDriven.frames,
                  differences: pixelResult.findings.filter(
                    (finding) => finding.acceptedAs !== "identical",
                  ),
                },
              };
              await writeReceipt(finalResult, {
                nodeMap: verdict.nodeMap,
                nodes: verdict.nodes,
                sourceEvidence: backendSources,
              });
              return verdict.nativeVerified && pixelsPassed;
            }
            const targets = await captureCopyEvidence(
              client,
              root,
              request.fileId,
              destination.destinationPageId,
              pairs.map((pair) => pair.targetFrameId),
              `${prefix}/target-${randomUUID()}`,
              options.redact,
              {
                ...evidenceProgress,
                phase: "verify",
                render: "single",
              },
            );
            const verifiedPairs = matchCopiedFrames(payload.sources, targets);
            if (observationHash(verifiedPairs) !== observationHash(pairs)) {
              throw new Error("Copied identities changed before final readback");
            }
            let comparedSources = payload.sources;
            let comparedTargets = targets;
            let pixelDifferences = await measureFramePixelDifferences(
              root,
              comparedSources,
              comparedTargets,
              pairs,
            );
            // One render per side is enough when the pair matches; only a pair that differs pays for the settled, double render.
            const unmatched = pixelMismatchedPairs(
              comparedSources,
              comparedTargets,
              pairs,
              pixelDifferences,
            );
            if (unmatched.length) {
              const settledSources = await captureCopyEvidence(
                client,
                root,
                request.fileId,
                baseline.sourcePageId,
                unmatched.map((pair) => pair.sourceFrameId),
                `${prefix}/source-settled-${randomUUID()}`,
                options.redact,
                {
                  ...evidenceProgress,
                  phase: "verify",
                },
              );
              const settledTargets = await captureCopyEvidence(
                client,
                root,
                request.fileId,
                destination.destinationPageId,
                unmatched.map((pair) => pair.targetFrameId),
                `${prefix}/target-settled-${randomUUID()}`,
                options.redact,
                {
                  ...evidenceProgress,
                  phase: "verify",
                },
              );
              comparedSources = withSettledPixels(comparedSources, settledSources);
              comparedTargets = withSettledPixels(comparedTargets, settledTargets);
              pixelDifferences = await measureFramePixelDifferences(
                root,
                comparedSources,
                comparedTargets,
                pairs,
              );
            }
            let verification = compareCopyEvidence(comparedSources, comparedTargets, pairs);
            if (!verification.pixelsMatch) {
              // Identical observed structure with a few localised pixels is rasteriser rounding of hairline strokes.
              const tolerated = new Set(
                (pixelDifferences ?? [])
                  .filter(
                    (entry) =>
                      entry.withinTolerance ||
                      (verification.nativeVerified &&
                        entry.differingPixels / entry.totalPixels <=
                          pixelTolerance.maxDifferingFraction),
                  )
                  .map((entry) => entry.sourceFrameId),
              );
              const pixelProblem = "Exported pixels differ for ";
              const pixelProblems = verification.problems.filter((problem) =>
                problem.startsWith(pixelProblem),
              );
              const onlyTolerated =
                pixelProblems.length > 0 &&
                pixelProblems.every((problem) => tolerated.has(problem.slice(pixelProblem.length)));
              if (onlyTolerated) {
                verification = {
                  ...verification,
                  pixelsMatch: true,
                  problems: verification.problems.filter(
                    (problem) => !problem.startsWith(pixelProblem),
                  ),
                };
              }
            }
            const originals = await captureCopyEvidence(
              client,
              root,
              request.fileId,
              baseline.sourcePageId,
              request.frameIds,
              `${prefix}/source-readback-${randomUUID()}`,
              options.redact,
              {
                ...evidenceProgress,
                phase: "verify",
                render: "none",
              },
            );
            if (sourceStructureHash(originals) !== sourceStructureHash(payload.sources)) {
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
              evidence: "plugin",
              status:
                verification.nativeVerified && verification.pixelsMatch ? "copied" : "incomplete",
              preview: destination,
              runId,
              receiptPath: `${prefix}/receipt.json`,
              pairs,
              nativeVerified: verification.nativeVerified,
              pixelsMatch: verification.pixelsMatch,
              problems: verification.problems,
              ...(componentInstanceCount(payload.sources) > 0
                ? {
                    caveats: [
                      `${componentInstanceCount(payload.sources)} component instances were verified by identity and every observed value; override bookkeeping (which properties count as overridden) is not observable.`,
                    ],
                  }
                : {}),
              render: {
                singleRender: pairs.length - unmatched.length,
                settledRerender: unmatched.map((pair) => pair.sourceFrameId),
              },
              ...(pixelDifferences?.length
                ? {
                    pixelDifferences,
                  }
                : {}),
            };
            await writeReceipt(finalResult, {
              nodeMap: verification.nodeMap,
              sourceEvidence: payload.sources.map(
                ({ inspection: _inspection, ...source }) => source,
              ),
              targetEvidence: targets.map(({ inspection: _inspection, ...target }) => target),
            });
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

/** Drops a copy run only when no paste was ever dispatched; otherwise the destination needs reconciliation, not abandonment. */
export async function abandonCopyRun(
  root: string,
  runId: string,
  reason: string,
  options: {
    destinationInspected?: boolean;
  } = {},
): Promise<{
  runId: string;
  abandonedAt: string;
  reason: string;
}> {
  const fence = await artifactPath(root, `.penpair/native-copy/${runId}/paste-attempt.json`, true);
  const dispatched = await lstat(fence).then(
    () => true,
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        return false;
      }
      throw error;
    },
  );
  const journal = await readJournal(root, runId);
  if (journal.operation !== operation) {
    throw new Error("Only a design-release copy run can be abandoned here");
  }
  if (dispatched && !options.destinationInspected) {
    throw new Error(
      "A paste was dispatched for this run; inspect the destination and use --resume, or abandon with --destination-inspected once you have checked what was pasted",
    );
  }
  const updated = await markJournalAbandoned(root, runId, reason);
  return {
    runId,
    abandonedAt: updated.abandoned!.at,
    reason,
  };
}
