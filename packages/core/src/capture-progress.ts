import { commandProgress } from "./command-result.js";

export type CapturePhase =
  | "prepare"
  | "journal"
  | "selection"
  | "fingerprint"
  | "cache"
  | "render"
  | "layout"
  | "stability"
  | "encode"
  | "verify"
  | "stage"
  | "publish";
export interface CaptureProgress {
  schemaVersion: 1;
  kind: "progress";
  command: string;
  phase: CapturePhase;
  status: "started" | "waiting" | "completed" | "failed" | "cached" | "info";
  elapsedMs: number;
  frame?: string;
  index?: number;
  total?: number;
  runId?: string;
  message?: string;
}
export interface ProgressOptions {
  onProgress?: (event: CaptureProgress) => void;
  signal?: AbortSignal;
}

/** A timer exists only while real work is pending; cancellation stops it immediately. */
export async function capturePhase<T>(
  options: ProgressOptions,
  command: string,
  phase: CapturePhase,
  work: () => Promise<T>,
  frame?: string,
): Promise<T> {
  options.signal?.throwIfAborted();
  const started = Date.now();
  const emit = (status: CaptureProgress["status"]): void =>
    options.onProgress?.({
      schemaVersion: 1,
      kind: "progress",
      command,
      phase,
      status,
      elapsedMs: Date.now() - started,
      ...(frame === undefined
        ? {}
        : {
            frame,
          }),
    });
  emit("started");
  const timer = options.onProgress ? setInterval(() => emit("waiting"), 5000) : undefined;
  timer?.unref();
  const cleanup = (): void => {
    if (timer) {
      clearInterval(timer);
    }
  };
  options.signal?.addEventListener("abort", cleanup, {
    once: true,
  });
  try {
    const result = await work();
    options.signal?.throwIfAborted();
    emit("completed");
    return result;
  } catch (error) {
    emit("failed");
    throw error;
  } finally {
    cleanup();
    options.signal?.removeEventListener("abort", cleanup);
  }
}

export function progressReporter(
  mode: string | undefined,
  command: string,
  redact: (text: string) => string = (text) => text,
): (event: CaptureProgress) => void {
  if (
    mode !== undefined &&
    ![
      "human",
      "json",
      "off",
    ].includes(mode)
  ) {
    throw new Error("--progress must be human, json or off; see penpair help diagnostics.progress");
  }
  return (event) => {
    if (mode === "off") {
      return;
    }
    const value = {
      ...event,
      command,
    };
    commandProgress(
      redact(
        mode === "json"
          ? JSON.stringify(value)
          : `${command}: ${event.phase} ${event.status}${event.frame === undefined ? "" : ` ${JSON.stringify(event.frame)}`}${event.index === undefined ? "" : ` (${event.index}/${event.total})`} ${(event.elapsedMs / 1000).toFixed(1)}s${event.runId ? ` run ${JSON.stringify(event.runId)}` : ""}${event.message ? ` ${JSON.stringify(event.message)}` : ""}`,
      ),
    );
  };
}
