import type { CaptureProgress } from "../capture-progress.js";

/** The steps of a native copy that run after the paste has been dispatched, each with its own deadline. */
export type CopyStage =
  | "paste-settle"
  | "backend-wait-paste"
  | "backend-wait-arrange"
  | "structure-check"
  | "pixel-check";

export type CopyStageDeadlines = Partial<Record<CopyStage, number>>;

/** What the tool saw in the destination when a stage stopped; enough to look for the boards by hand. */
export interface CopySeen {
  /** Root boards on the destination page that were not there before the paste. */
  newRootIds: string[];
  /** The editor's selection right after the paste, which is what Penpot selects once it has pasted. */
  selection: Array<{
    id: string;
    name: string;
    parentId: string | null;
    parentName: string | null;
  }>;
}

export const defaultStageDeadlinesMs: Record<CopyStage, number> = {
  "paste-settle": 300_000,
  "backend-wait-paste": 90_000,
  "backend-wait-arrange": 90_000,
  "structure-check": 120_000,
  "pixel-check": 120_000,
};

/** Rendering is the slow part of the pixel check, so its deadline grows with the number of boards. */
export const pixelCheckMsPerPair = 30_000;

export const stageLabels: Record<CopyStage, string> = {
  "paste-settle": "waiting for the pasted boards to appear on the destination page",
  "backend-wait-paste": "waiting for the Penpot backend to show the pasted boards",
  "backend-wait-arrange": "waiting for the Penpot backend to show the arranged boards",
  "structure-check": "comparing the stored data of every pair",
  "pixel-check": "comparing rendered pixels",
};

export class CopyStageTimeoutError extends Error {
  constructor(
    readonly stage: CopyStage,
    readonly afterMs: number,
    readonly seen?: CopySeen,
    detail?: string,
  ) {
    super(
      `Stage "${stage}" (${stageLabels[stage]}) timed out after ${Math.round(afterMs / 1000)} s; ${detail ? `${detail}; ` : ""}${describeSeen(seen)}`,
    );
  }
}

/** The pasted boards are not where the destination page's own boards are: Penpot put them inside another board. */
export class MisplacedPasteError extends Error {
  constructor(readonly seen: CopySeen) {
    super(
      `The paste landed inside another board instead of on the page root: ${seen.selection
        .filter((entry) => entry.parentId !== null)
        .map((entry) => `${entry.id} in ${entry.parentId} (${entry.parentName ?? "unnamed"})`)
        .join(", ")}`,
    );
  }
}

export function describeSeen(seen: CopySeen | undefined): string {
  if (!seen) {
    return "nothing was recorded about the destination";
  }
  const roots = seen.newRootIds.length
    ? `new root boards ${seen.newRootIds.join(", ")}`
    : "no new root boards";
  const selected = seen.selection.length
    ? `selection ${seen.selection
        .map(
          (entry) =>
            `${entry.id} (${entry.parentId === null ? "page root" : `in ${entry.parentId}`})`,
        )
        .join(", ")}`
    : "nothing selected";
  return `${roots}; ${selected}. Find them with --find-pasted RUN_ID before any other step`;
}

/** Stops waiting for `work` after `milliseconds`. The work itself cannot be cancelled, so the caller ends the command. */
export async function withStageDeadline<T>(
  stage: CopyStage,
  milliseconds: number,
  work: () => Promise<T>,
  seen?: () => CopySeen | undefined,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new CopyStageTimeoutError(stage, milliseconds, seen?.())),
      milliseconds,
    );
    timer.unref();
  });
  try {
    return await Promise.race([
      work(),
      deadline,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** One progress line per stage change and then one every `intervalMs`, so a long wait never looks like a hang. */
export function stageAnnouncer(
  onProgress: ((event: CaptureProgress) => void) | undefined,
  runId: string,
  intervalMs = 10_000,
): (stage: string, message: string, force?: boolean) => void {
  const started = Date.now();
  let lastStage = "";
  let lastAt = 0;
  return (stage, message, force = false) => {
    if (!onProgress) {
      return;
    }
    const now = Date.now();
    if (!force && stage === lastStage && now - lastAt < intervalMs) {
      return;
    }
    lastStage = stage;
    lastAt = now;
    onProgress({
      schemaVersion: 1,
      kind: "progress",
      command: "design-release copy",
      phase: "stage",
      status: "info",
      elapsedMs: now - started,
      runId,
      message: `${stage}: ${message}`,
    });
  };
}
