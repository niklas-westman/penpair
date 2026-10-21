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

export interface ExportResult {
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
const bytes = await s.export({ type: "png", scale: CFG.scale });
let bin = ""; for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
return { ok: true, base64: btoa(bin), length: bytes.length };`,
    { id: shapeId, scale, page },
    "read",
  );

const defaultSleep = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds));

/** Exports one shape as PNG. A first call can fail once and then work; this retries, and by default waits for a stable render. */
export async function exportShapePng(client: PenpotToolClient, shapeId: string, options: ExportOptions = {}): Promise<ExportResult> {
  const { page, scale = 1, attempts = 3, stable = true, maxExports = 4, sleep = defaultSleep } = options;
  const once = async (): Promise<Buffer> => {
    for (let attempt = 1; ; attempt++) {
      try {
        const record = await runOnPage(client, exportSnippet(shapeId, scale, page), page, options);
        return Buffer.from(String(record.base64), "base64");
      } catch (error) {
        if (attempt >= attempts) throw error;
        await sleep(5_000);
      }
    }
  };
  let previous = await once();
  if (!stable) return { png: previous, stable: false, exports: 1 };
  const hash = (buffer: Buffer): string => createHash("sha256").update(buffer).digest("hex");
  for (let count = 2; count <= maxExports; count++) {
    await sleep(2_000);
    const next = await once();
    if (hash(next) === hash(previous)) return { png: next, stable: true, exports: count };
    previous = next;
  }
  return { png: previous, stable: false, exports: maxExports };
}
