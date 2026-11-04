import type { PenpotToolClient } from "./client.js";
import { commandSignal } from "./command-result.js";
import {
  exportShapePng,
  exportShapesPngStable,
  type ExportOptions,
  type ExportResult,
} from "./export.js";

/** How a frame was rendered: with the others in one concurrent round trip, or on its own after the batch could not deliver it. */
export type RenderRoute = "batch" | "single";

export type RenderOutcome =
  | {
      ok: true;
      route: RenderRoute;
      result: ExportResult;
      /** Wall time from the start of the call until this frame had its image. */
      elapsedMs: number;
    }
  | {
      ok: false;
      route: RenderRoute;
      message: string;
      elapsedMs: number;
    };

export interface RenderServiceOptions extends ExportOptions {
  /** Frames rendered at once in the editor. Penpot's renderer has a fixed cost per request, so concurrency is what makes many frames fast. */
  concurrency?: number;
  /** A frame that renders on its own is given up on after this long, and the others go on. */
  frameTimeoutMs?: number;
  log?: (line: string) => void;
}

export const defaultRenderConcurrency = 4;
export const defaultFrameTimeoutMs = 120_000;

class FrameTimeoutError extends Error {
  constructor(milliseconds: number) {
    super(`The render did not finish within ${Math.round(milliseconds / 1000)} s`);
  }
}

async function withFrameTimeout<T>(milliseconds: number, work: () => Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new FrameTimeoutError(milliseconds)), milliseconds);
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

function isInterruption(error: unknown): boolean {
  return (
    commandSignal()?.aborted === true || (error instanceof Error && error.name === "AbortError")
  );
}

/**
 * The one way Penpair renders frames of a page for export, approval evidence or pixel comparison. Frames are rendered together in
 * concurrent stable rounds; a frame the batch could not deliver is rendered on its own, with the usual retries and a deadline.
 * A frame that still fails is reported and the others are returned, so one bad frame does not stop 94 others.
 */
export async function renderFrames(
  client: PenpotToolClient,
  frameIds: string[],
  options: RenderServiceOptions = {},
): Promise<Map<string, RenderOutcome>> {
  const {
    concurrency = defaultRenderConcurrency,
    frameTimeoutMs = defaultFrameTimeoutMs,
    log,
    ...exportOptions
  } = options;
  const started = Date.now();
  const outcomes = new Map<string, RenderOutcome>();
  if (!frameIds.length) {
    return outcomes;
  }
  log?.(
    `rendering ${frameIds.length} frame(s), ${Math.min(concurrency, frameIds.length)} at a time`,
  );
  let batched = new Map<string, ExportResult>();
  let stalled: string | undefined;
  try {
    const width = Math.min(concurrency, frameIds.length);
    // Two stable rounds, each of ceil(n / width) round trips.
    const rounds = 2 * Math.ceil(frameIds.length / width);
    batched = await withFrameTimeout(frameTimeoutMs * rounds, () =>
      exportShapesPngStable(client, frameIds, {
        ...exportOptions,
        concurrency: width,
      }),
    );
  } catch (error) {
    if (isInterruption(error)) {
      throw error;
    }
    stalled = error instanceof FrameTimeoutError ? error.message : undefined;
    log?.(
      `the batch render failed (${error instanceof Error ? error.message : String(error)}); rendering one by one`,
    );
  }
  for (const [id, result] of batched) {
    outcomes.set(id, {
      ok: true,
      route: "batch",
      result,
      elapsedMs: Date.now() - started,
    });
  }
  for (const id of frameIds.filter((candidate) => !outcomes.has(candidate))) {
    const singleStarted = Date.now();
    // A render that timed out is still running and holds the page session, so every later render would only queue behind it.
    if (stalled) {
      outcomes.set(id, {
        ok: false,
        route: "single",
        message: `Not rendered: an earlier render stalled (${stalled}). Run again; frames already rendered are kept by the cache`,
        elapsedMs: 0,
      });
      continue;
    }
    try {
      const result = await withFrameTimeout(frameTimeoutMs, () =>
        exportShapePng(client, id, {
          ...exportOptions,
          stable: true,
        }),
      );
      outcomes.set(
        id,
        result.stable
          ? {
              ok: true,
              route: "single",
              result,
              elapsedMs: Date.now() - singleStarted,
            }
          : {
              ok: false,
              route: "single",
              message: "Export did not stabilize",
              elapsedMs: Date.now() - singleStarted,
            },
      );
    } catch (error) {
      if (isInterruption(error)) {
        throw error;
      }
      stalled = error instanceof FrameTimeoutError ? error.message : undefined;
      outcomes.set(id, {
        ok: false,
        route: "single",
        message: error instanceof Error ? error.message : String(error),
        elapsedMs: Date.now() - singleStarted,
      });
    }
  }
  return outcomes;
}
