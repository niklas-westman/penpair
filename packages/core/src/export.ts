import { withPageSession } from "./page-session.js";
import { waitForStableLayout, type LayoutResult } from "./layout.js";
import { capturePhase } from "./capture-progress.js";
import { PenpairError } from "./errors.js";
import { commandSignal, commandSleep } from "./command-result.js";
import { applyCapturePolicy, type CapturePolicyName } from "./capture-policy.js";
import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import type { PenpotToolClient } from "./client.js";
import { snippet, requirePage } from "./snippet.js";
import { runOnPage, type OperationOptions } from "./operation.js";

export interface ExportOptions extends OperationOptions {
  /** Page the shape is on; the runner opens it if needed. */
  page?: string;
  scale?: number;
  /** Tries to get a first export through before giving up. */
  attempts?: number;
  /** Exports until two in a row are identical, because the first export after a write or a page switch can be a stale render. */
  stable?: boolean;
  maxExports?: number;
  /** Opt-in capture profile; stamped on each capture when its evidence is present. */
  capturePolicy?: CapturePolicyName;
}

export interface CaptureIdentity {
  fileId: string;
  pageId: string;
  frameId: string;
  revision: number;
  designSize?: {
    width: number;
    height: number;
  };
  activeThemeIds?: string[] | null;
  scale: number;
  penpotApiVersion: string | null;
  renderEnvironment: string | null;
  activeThemes: string[];
  /** Present only for an opt-in profile; it becomes part of the approval fingerprint. */
  capturePolicy?: CapturePolicyName;
}
export interface ExportResult {
  layout?: LayoutResult;
  capture: CaptureIdentity;
  png: Buffer;
  /** Whether two consecutive exports were byte-identical. Always false when `stable` is off. */
  stable: boolean;
  exports: number;
}

const exportSnippet = (shapeId: string, scale: number, page?: string) =>
  snippet(
    "export",
    `${requirePage}
const s = penpot.currentPage.getShapeById(CFG.id);
if (!s) return { ok: false, message: "no shape " + CFG.id + " on " + penpot.currentPage.name };
const active = (penpot.library?.local?.tokens?.themes || []).filter(t=>t.active);
const capture = {designSize:{width:s.width,height:s.height},activeThemeIds:active.every(t=>typeof t.id==="string"&&t.id)?active.map(t=>t.id).sort():null,fileId:penpot.currentFile.id, pageId:penpot.currentPage.id, frameId:s.id, revision:penpot.currentFile.revn, scale:CFG.scale,
  penpotApiVersion:typeof penpot.version === "string" ? penpot.version : null,
  renderEnvironment:typeof navigator !== "undefined" ? navigator.userAgent : null,
  activeThemes:(penpot.library?.local?.tokens?.themes || []).filter(t=>t.active).map(t=>t.group+"/"+t.name).sort()};
const geometry = JSON.stringify([s.x,s.y,s.width,s.height]);
const bytes = await s.export({ type: "png", scale: CFG.scale });
const afterShape = penpot.currentPage.getShapeById(CFG.id);
if (penpot.currentFile.id !== capture.fileId || penpot.currentPage.id !== capture.pageId || penpot.currentFile.revn !== capture.revision || !afterShape || afterShape.id !== capture.frameId || JSON.stringify([afterShape.x,afterShape.y,afterShape.width,afterShape.height]) !== geometry)
 return {ok:false, message:"Export source changed during capture"};
let bin = ""; for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
return { ok: true, base64: btoa(bin), length: bytes.length, capture };`,
    {
      id: shapeId,
      scale,
      page,
    },
    "read",
  );

function parseExportRecord(
  record: Record<string, unknown>,
  shapeId: string,
  scale: number,
  capturePolicy: CapturePolicyName | undefined,
): {
  png: Buffer;
  capture: CaptureIdentity;
} {
  const capture = record.capture as CaptureIdentity | undefined;
  if (
    !capture ||
    typeof capture.fileId !== "string" ||
    !capture.fileId ||
    typeof capture.pageId !== "string" ||
    !capture.pageId ||
    capture.frameId !== shapeId ||
    !Number.isInteger(capture.revision) ||
    capture.scale !== scale ||
    !Array.isArray(capture.activeThemes)
  ) {
    throw new Error("Export did not return target provenance");
  }
  if (
    capture.designSize &&
    ![
      capture.designSize.width,
      capture.designSize.height,
    ].every((value) => Number.isFinite(value) && value >= 0)
  ) {
    throw new Error("Export has malformed design dimensions");
  }
  if (
    capture.activeThemeIds !== undefined &&
    capture.activeThemeIds !== null &&
    (!Array.isArray(capture.activeThemeIds) ||
      capture.activeThemeIds.some((id) => typeof id !== "string" || !id) ||
      new Set(capture.activeThemeIds).size !== capture.activeThemeIds.length)
  ) {
    throw new Error("Export has malformed active theme identity");
  }
  if (
    typeof record.base64 !== "string" ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(record.base64)
  ) {
    throw new Error("Invalid export byte encoding");
  }
  const png = Buffer.from(record.base64, "base64");
  if (!png.length || png.length !== record.length) {
    throw new Error("Export byte length does not match its evidence");
  }
  return {
    png,
    capture: applyCapturePolicy(capture, capturePolicy),
  };
}

const defaultSleep = commandSleep;

/** Several shapes of one page exported concurrently in one plugin call; Penpot renders them in parallel, about three times faster than one by one. */
const batchExportSnippet = (shapeIds: string[], scale: number, page?: string) =>
  snippet(
    "export-batch",
    `${requirePage}
const one = async (id) => {
  const s = penpot.currentPage.getShapeById(id);
  if (!s) return { id, ok: false, message: "no shape " + id };
  const active = (penpot.library?.local?.tokens?.themes || []).filter(t=>t.active);
  const capture = {designSize:{width:s.width,height:s.height},activeThemeIds:active.every(t=>typeof t.id==="string"&&t.id)?active.map(t=>t.id).sort():null,fileId:penpot.currentFile.id, pageId:penpot.currentPage.id, frameId:s.id, revision:penpot.currentFile.revn, scale:CFG.scale,
    penpotApiVersion:typeof penpot.version === "string" ? penpot.version : null,
    renderEnvironment:typeof navigator !== "undefined" ? navigator.userAgent : null,
    activeThemes:(penpot.library?.local?.tokens?.themes || []).filter(t=>t.active).map(t=>t.group+"/"+t.name).sort()};
  const geometry = JSON.stringify([s.x,s.y,s.width,s.height]);
  const bytes = await s.export({ type: "png", scale: CFG.scale });
  const afterShape = penpot.currentPage.getShapeById(id);
  if (penpot.currentFile.id !== capture.fileId || penpot.currentPage.id !== capture.pageId || !afterShape || JSON.stringify([afterShape.x,afterShape.y,afterShape.width,afterShape.height]) !== geometry)
    return { id, ok: false, message: "Export source changed during capture" };
  let bin = ""; for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
  return { id, ok: true, base64: btoa(bin), length: bytes.length, capture };
};
return { ok: true, items: await Promise.all(CFG.ids.map(one)) };`,
    {
      ids: shapeIds,
      scale,
      page,
    },
    "read",
  );

/** Opt-in explanation of why a shape fell back to the slower one-by-one export. */
function traceExport(message: string): void {
  if (process.env.PENPAIR_TRACE_EXPORT) {
    console.error(`export-trace ${message}`);
  }
}

function isInterruption(error: unknown): boolean {
  return (
    commandSignal()?.aborted === true || (error instanceof Error && error.name === "AbortError")
  );
}

async function exportBatchRound(
  client: PenpotToolClient,
  shapeIds: string[],
  scale: number,
  limit: {
    concurrency: number;
  },
  options: ExportOptions,
): Promise<Map<string, ReturnType<typeof parseExportRecord>>> {
  const rendered = new Map<string, ReturnType<typeof parseExportRecord>>();
  const queue = [
    ...shapeIds,
  ];
  while (queue.length) {
    const chunk = queue.splice(0, limit.concurrency);
    let record: Record<string, unknown>;
    try {
      record = await runOnPage(
        client,
        batchExportSnippet(chunk, scale, options.page),
        options.page,
        options,
      );
    } catch (error) {
      if (isInterruption(error)) {
        throw error;
      }
      // Penpot refuses answers of a few megabytes ("http error"), so large frames need smaller groups. Halve and ask again;
      // a shape that fails alone is rendered one by one by the caller.
      if (chunk.length > 1) {
        limit.concurrency = Math.max(1, Math.floor(chunk.length / 2));
        queue.unshift(...chunk);
      }
      continue;
    }
    const items = Array.isArray(record.items) ? (record.items as Record<string, unknown>[]) : [];
    for (const item of items) {
      const id = typeof item.id === "string" ? item.id : "";
      if (item.ok !== true || !chunk.includes(id)) {
        continue;
      }
      try {
        rendered.set(id, parseExportRecord(item, id, scale, options.capturePolicy));
      } catch {
        /* A malformed item is simply not rendered; the caller falls back to the one-by-one export. */
      }
    }
  }
  return rendered;
}

/**
 * Stable renders for many shapes of one page: layout settled per shape, then two concurrent rounds that must match byte for byte.
 * Shapes that did not settle or differ are absent from the result; export them one by one with exportShapePng.
 */
export async function exportShapesPngStable(
  client: PenpotToolClient,
  shapeIds: string[],
  options: ExportOptions & {
    concurrency?: number;
  } = {},
): Promise<Map<string, ExportResult>> {
  const { scale = 1, concurrency = 6, sleep = defaultSleep } = options;
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8 || !shapeIds.length) {
    throw new Error("Invalid batch export limits");
  }
  return withPageSession(client, async () => {
    const layouts = new Map<string, LayoutResult | undefined>();
    const ready: string[] = [];
    for (const shapeId of shapeIds) {
      if (options.layout === false) {
        layouts.set(shapeId, undefined);
        ready.push(shapeId);
        continue;
      }
      const layout = await waitForStableLayout(client, {
        shapeId,
        sleep,
        ...options.layout,
      });
      if (layout.stable) {
        layouts.set(shapeId, layout);
        ready.push(shapeId);
      } else {
        traceExport(`${shapeId} layout not settled: ${layout.reason ?? "unknown"}`);
      }
    }
    const limit = {
      concurrency,
    };
    const first = await exportBatchRound(client, ready, scale, limit, options);
    await sleep(2_000);
    const second = await exportBatchRound(client, ready, scale, limit, options);
    // The revision can move between the rounds (Penpot saves in the background); identical bytes are what prove stability.
    const identity = ({ designSize: _size, revision: _revision, ...value }: CaptureIdentity) =>
      JSON.stringify(value);
    const hash = (buffer: Buffer): string => createHash("sha256").update(buffer).digest("hex");
    const stable = new Map<string, ExportResult>();
    for (const shapeId of ready) {
      const before = first.get(shapeId);
      const after = second.get(shapeId);
      if (!before || !after) {
        traceExport(`${shapeId} missing render in round ${before ? 2 : 1}`);
      } else if (identity(before.capture) !== identity(after.capture)) {
        traceExport(`${shapeId} capture identity changed between rounds`);
      } else if (hash(before.png) !== hash(after.png)) {
        traceExport(`${shapeId} renders differ between rounds`);
      }
      if (
        before &&
        after &&
        identity(before.capture) === identity(after.capture) &&
        JSON.stringify(before.capture.designSize ?? null) ===
          JSON.stringify(after.capture.designSize ?? null) &&
        hash(before.png) === hash(after.png)
      ) {
        stable.set(shapeId, {
          layout: layouts.get(shapeId),
          ...after,
          stable: true,
          exports: 2,
        });
      }
    }
    return stable;
  });
}

/** Exports one shape as PNG. A first call can fail once and then work; this retries, and by default waits for a stable render. */
export async function exportShapePng(
  client: PenpotToolClient,
  shapeId: string,
  options: ExportOptions = {},
): Promise<ExportResult> {
  return withPageSession(client, () => exportInSession(client, shapeId, options));
}
async function exportInSession(
  client: PenpotToolClient,
  shapeId: string,
  options: ExportOptions,
): Promise<ExportResult> {
  const {
    page,
    scale = 1,
    attempts = 3,
    stable = true,
    maxExports = 4,
    sleep = defaultSleep,
  } = options;
  if (
    !Number.isFinite(scale) ||
    scale <= 0 ||
    scale > 8 ||
    !Number.isInteger(attempts) ||
    attempts < 1 ||
    attempts > 10 ||
    !Number.isInteger(maxExports) ||
    maxExports < (stable ? 2 : 1) ||
    maxExports > 20
  ) {
    throw new Error("Invalid export scale/attempt limits");
  }
  const once = async (): Promise<{
    png: Buffer;
    capture: CaptureIdentity;
  }> => {
    for (let attempt = 1; ; attempt++) {
      try {
        const record = await capturePhase(
          options,
          "export",
          "render",
          () => runOnPage(client, exportSnippet(shapeId, scale, page), page, options),
          shapeId,
        );
        return parseExportRecord(record, shapeId, scale, options.capturePolicy);
      } catch (error) {
        if (attempt >= attempts) {
          throw error;
        }
        await sleep(5_000);
      }
    }
  };
  let previous = await once();
  let layout: LayoutResult | undefined;
  if (options.layout !== false) {
    layout = await capturePhase(
      options,
      "export",
      "layout",
      () =>
        waitForStableLayout(client, {
          shapeId,
          sleep,
          ...options.layout,
        }),
      shapeId,
    );
    if (!layout.stable) {
      throw new PenpairError(
        "incomplete-output",
        `Layout did not settle before export: ${layout.reason ?? "unknown reason"}`,
      );
    }
  }
  if (!stable) {
    return {
      layout,
      ...previous,
      stable: false,
      exports: 1,
    };
  }
  const hash = (buffer: Buffer): string => createHash("sha256").update(buffer).digest("hex");
  for (let count = 2; count <= maxExports; count++) {
    await capturePhase(options, "export", "stability", () => sleep(2_000), shapeId);
    const next = await once();
    const identity = ({ designSize: _size, ...value }: CaptureIdentity) => value;
    if (JSON.stringify(identity(next.capture)) !== JSON.stringify(identity(previous.capture))) {
      throw new Error("Export identity, revision or render environment changed between captures");
    }
    if (
      JSON.stringify(next.capture.designSize ?? null) ===
        JSON.stringify(previous.capture.designSize ?? null) &&
      hash(next.png) === hash(previous.png)
    ) {
      return {
        layout,
        ...next,
        stable: true,
        exports: count,
      };
    }
    previous = next;
  }
  return {
    layout,
    ...previous,
    stable: false,
    exports: maxExports,
  };
}
