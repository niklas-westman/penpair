import type { PenpotToolClient } from "../client.js";
import { guardFile } from "../file-guard.js";
import { readJournal } from "../journal.js";
import { selectPage, withPageSession } from "../page-session.js";
import { runSnippet } from "../snippet.js";
import { nativeCopyFindBoards, nativeCopyInspect } from "./copy-snippets.js";
import { readCopyPreview, type CopyPreview, type CopyRequest } from "./copy-plan.js";

export interface PastedBoardLocation {
  sourceFrameId: string;
  sourceName: string;
  boardId: string;
  x: number;
  y: number;
  /** True when the board sits directly on the page root, where a copy belongs. */
  atRoot: boolean;
  /** The board it was pasted into; null on the page root. */
  parentId: string | null;
  parentName: string | null;
}

export interface FindPastedResult {
  schemaVersion: 1;
  kind: "native-copy-find-pasted";
  runId: string;
  destinationPageId: string;
  destinationName: string;
  /** Boards at any depth with a source board's name, size and node count that were not root boards before the run. */
  found: PastedBoardLocation[];
  /** Source boards for which nothing matching was found. */
  missing: string[];
  /** The part of `found` that is not on the page root. */
  misplaced: PastedBoardLocation[];
  note: string;
}

interface RecordedPlan {
  kind?: string;
  request: CopyRequest;
  preview: CopyPreview;
}

/**
 * Read-only: where did a run's paste end up? Searches the whole destination page, not only its roots, because Penpot pastes into
 * a board when one lies under the viewport and a listing of the roots then looks unchanged. A board found here is a candidate
 * identified by its name, size and node count; it is never moved or deleted.
 */
export async function findPastedBoards(
  client: PenpotToolClient,
  root: string,
  runId: string,
): Promise<FindPastedResult> {
  const journal = await readJournal(root, runId);
  const plan = journal.payload as RecordedPlan | undefined;
  if (
    journal.operation !== "design-release-copy" ||
    plan?.kind !== "native-release-copy-plan" ||
    !plan.request ||
    !plan.preview
  ) {
    throw new Error("Only a design-release copy run with a recorded plan can be searched");
  }
  const { request, preview: baseline } = plan;
  const guarded = guardFile(
    client,
    {
      id: request.fileId,
    },
    {
      mode: "strict",
    },
  );
  return withPageSession(guarded, async () => {
    const current = readCopyPreview(
      await runSnippet(
        guarded,
        nativeCopyInspect(
          request.fileId,
          request.sourcePage,
          request.frameIds,
          request.releaseVersion,
          runId,
        ),
        {
          effect: "read",
          retries: 0,
        },
      ),
      request,
    );
    if (!current.destinationPageId) {
      throw new Error(`The destination page release/${request.releaseVersion} does not exist`);
    }
    await selectPage(guarded, {
      id: current.destinationPageId,
    });
    const matchers = baseline.sourceFrames.map((frame) => ({
      name: frame.name,
      width: frame.width,
      height: frame.height,
      nodeCount: frame.nodeCount,
    }));
    const listing = await runSnippet(
      guarded,
      nativeCopyFindBoards(request.fileId, current.destinationPageId, matchers),
      {
        effect: "read",
        retries: 0,
      },
    );
    if (listing.ok !== true || !Array.isArray(listing.found)) {
      throw new Error("The destination page could not be searched for pasted boards");
    }
    const before = new Set(baseline.destinationRootIds);
    const found: PastedBoardLocation[] = [];
    for (const entry of listing.found as Array<{
      id: string;
      sourceIndex: number;
      x: number;
      y: number;
      parentId: string | null;
      parentName: string | null;
    }>) {
      const atRoot = entry.parentId === null;
      // A root board that was already there when the run was planned is not something this run pasted.
      if (atRoot && before.has(entry.id)) {
        continue;
      }
      const source = baseline.sourceFrames[entry.sourceIndex]!;
      found.push({
        sourceFrameId: source.id,
        sourceName: source.name,
        boardId: entry.id,
        x: entry.x,
        y: entry.y,
        atRoot,
        parentId: entry.parentId,
        parentName: entry.parentName,
      });
    }
    const foundSources = new Set(found.map((board) => board.sourceFrameId));
    const misplaced = found.filter((board) => !board.atRoot);
    return {
      schemaVersion: 1,
      kind: "native-copy-find-pasted",
      runId,
      destinationPageId: current.destinationPageId,
      destinationName: current.destinationName,
      found,
      missing: baseline.sourceFrames
        .filter((frame) => !foundSources.has(frame.id))
        .map((frame) => frame.id),
      misplaced,
      note: misplaced.length
        ? "Some boards sit inside other boards, not on the page root. Nothing was changed; move or remove them in Penpot, then abandon the run with --destination-inspected."
        : found.length
          ? "Every board found sits on the page root. Matching is by name, size and node count, so check the ids against the run's receipt before relying on it."
          : "No pasted board was found on the destination page.",
    };
  });
}
