import { withPageSession } from "./page-session.js";
import { waitForStableLayout, type LayoutResult } from "./layout.js";
import { PenpairError } from "./errors.js";
import { commandSleep } from "./command-result.js";
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
}

export interface CaptureIdentity {
  fileId: string; pageId: string; frameId: string; revision: number;
  designSize?: { width: number; height: number };
  activeThemeIds?: string[] | null;
  scale: number; penpotApiVersion: string | null; renderEnvironment: string | null; activeThemes: string[];
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
    { id: shapeId, scale, page },
    "read",
  );

const defaultSleep = commandSleep;

/** Exports one shape as PNG. A first call can fail once and then work; this retries, and by default waits for a stable render. */
export async function exportShapePng(client: PenpotToolClient, shapeId: string, options: ExportOptions = {}): Promise<ExportResult> {
  return withPageSession(client, () => exportInSession(client, shapeId, options));
}
async function exportInSession(client: PenpotToolClient, shapeId: string, options: ExportOptions): Promise<ExportResult> {
  const { page, scale = 1, attempts = 3, stable = true, maxExports = 4, sleep = defaultSleep } = options;
  if (!Number.isFinite(scale) || scale <= 0 || scale > 8 || !Number.isInteger(attempts) || attempts < 1 || attempts > 10 || !Number.isInteger(maxExports) || maxExports < (stable ? 2 : 1) || maxExports > 20) throw new Error("Invalid export scale/attempt limits");
  const once = async (): Promise<{ png: Buffer; capture: CaptureIdentity }> => {
    for (let attempt = 1; ; attempt++) {
      try {
        const record = await runOnPage(client, exportSnippet(shapeId, scale, page), page, options);
        const capture = record.capture as CaptureIdentity | undefined;
        if (!capture || typeof capture.fileId !== "string" || !capture.fileId || typeof capture.pageId !== "string" || !capture.pageId || capture.frameId !== shapeId || !Number.isInteger(capture.revision) || capture.scale !== scale || !Array.isArray(capture.activeThemes)) throw new Error("Export did not return target provenance");
        if (capture.designSize && (![capture.designSize.width, capture.designSize.height].every(value => Number.isFinite(value) && value >= 0))) throw new Error("Export has malformed design dimensions");
        if (capture.activeThemeIds !== undefined && capture.activeThemeIds !== null && (!Array.isArray(capture.activeThemeIds) || capture.activeThemeIds.some(id => typeof id !== "string" || !id) || new Set(capture.activeThemeIds).size !== capture.activeThemeIds.length)) throw new Error("Export has malformed active theme identity");
        if (typeof record.base64 !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(record.base64)) throw new Error("Invalid export byte encoding");
        const png = Buffer.from(record.base64, "base64");
        if (!png.length || png.length !== record.length) throw new Error("Export byte length does not match its evidence");
        return {png, capture};
      } catch (error) {
        if (attempt >= attempts) throw error;
        await sleep(5_000);
      }
    }
  };
  let previous = await once();
  let layout: LayoutResult | undefined;
  if (options.layout !== false) {
    layout = await waitForStableLayout(client, { shapeId, sleep, ...options.layout });
    if (!layout.stable) throw new PenpairError("incomplete-output", `Layout did not settle before export: ${layout.reason ?? "unknown reason"}`);
  }
  if (!stable) return { layout, ...previous, stable: false, exports: 1 };
  const hash = (buffer: Buffer): string => createHash("sha256").update(buffer).digest("hex");
  for (let count = 2; count <= maxExports; count++) {
    await sleep(2_000);
    const next = await once();
    const identity = ({ designSize: _size, ...value }: CaptureIdentity) => value;
    if (JSON.stringify(identity(next.capture)) !== JSON.stringify(identity(previous.capture))) throw new Error("Export identity, revision or render environment changed between captures");
    if (JSON.stringify(next.capture.designSize ?? null) === JSON.stringify(previous.capture.designSize ?? null) && hash(next.png) === hash(previous.png)) return { layout, ...next, stable: true, exports: count };
    previous = next;
  }
  return { layout, ...previous, stable: false, exports: maxExports };
}
