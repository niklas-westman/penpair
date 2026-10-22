import { commandSleep } from "./command-result.js";
import { PenpairError } from "./errors.js";
import type { PenpotToolClient } from "./client.js";
import { runSnippet, snippet } from "./snippet.js";

export interface LayoutOptions {
  shapeId?: string;
  timeoutMs?: number;
  intervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
}
export interface LayoutResult {
  stable: boolean;
  method: "native" | "geometry" | "unavailable";
  samples: number;
  reason?: string;
}

const layoutState = `
const fileId = penpot.currentFile.id, pageId = penpot.currentPage.id;
const shape = CFG.shapeId ? penpot.currentPage.getShapeById(CFG.shapeId) : penpot.currentPage.root;
if (!shape) return { ok: false, message: "layout target does not exist" };
const target = CFG.shapeId && typeof shape.waitForLayoutUpdate === "function" ? shape : penpot;
let native = false;
if (CFG.native && typeof target.waitForLayoutUpdate === "function") {
  try { await target.waitForLayoutUpdate(CFG.timeout); native = true; }
  catch (error) { return { ok: true, fileId, pageId, native: true, error: String(error && error.message || error) }; }
}
if (penpot.currentFile.id !== fileId || penpot.currentPage.id !== pageId) return { ok: false, message: "layout target changed while waiting" };
const geometry = [], stack = [shape];
while (stack.length && geometry.length < 10000) {
  const s = stack.pop(); geometry.push([s.id, s.x, s.y, s.width, s.height]);
  for (const child of s.children || []) stack.push(child);
}
return { ok: true, fileId, pageId, native, geometry, truncated: stack.length > 0 };`;

/** Native completion is preferred. Older APIs fall back to bounded geometry samples; pixel verification stays separate. */
export async function waitForStableLayout(client: PenpotToolClient, options: LayoutOptions = {}): Promise<LayoutResult> {
  const { timeoutMs = 30_000, intervalMs = 200, shapeId, sleep = commandSleep } = options;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 30_000 || !Number.isFinite(intervalMs) || intervalMs <= 0)
    throw new Error("Layout timeout must be in (0, 30000] ms and the interval must be positive");
  if (Math.ceil(timeoutMs / intervalMs) + 1 > 1000) throw new Error("Layout polling must stay within 1000 samples");
  const deadline = Date.now() + timeoutMs;
  const sample = (native: boolean) => runSnippet(client, snippet("layout-state", layoutState, { shapeId, native, timeout: Math.max(1, deadline - Date.now()) }, "read"), { retries: 0, timeoutMs: Math.max(1, deadline - Date.now()) });
  const validGeometry = (value: unknown): boolean => Array.isArray(value) && value.length > 0 && value.every((row) => Array.isArray(row) && row.length === 5 && typeof row[0] === "string" && !!row[0] && row.slice(1).every((entry) => typeof entry === "number" && Number.isFinite(entry)));
  let first;
  try { first = await sample(true); } catch (error) {
    if (error instanceof PenpairError && error.code === "mcp-unavailable") return { stable: false, method: "unavailable", samples: 0, reason: "Layout observation did not complete within its request budget" };
    throw error;
  }
  if (first.ok !== true || typeof first.fileId !== "string" || !first.fileId || typeof first.pageId !== "string" || !first.pageId) throw new Error("Layout returned no target identity evidence");
  if (first.error) return { stable: false, method: "native", samples: 1, reason: String(first.error) };
  if (Date.now() > deadline) return { stable: false, method: first.native ? "native" : "geometry", samples: 1, reason: "Layout observation exceeded its deadline" };
  if (first.truncated) return { stable: false, method: first.native ? "native" : "geometry", samples: 1, reason: "Layout sample exceeded 10000 nodes" };
  if (typeof first.native !== "boolean" || typeof first.truncated !== "boolean" || !validGeometry(first.geometry)) throw new Error("Layout API returned no geometry evidence");
  if (first.native) return { stable: true, method: "native", samples: 1 };
  let previous = JSON.stringify(first.geometry);
  const maxSamples = Math.ceil(timeoutMs / intervalMs) + 1;
  let samples = 1;
  for (let count = 2; count <= maxSamples && Date.now() <= deadline; count++) {
    await sleep(Math.min(intervalMs, Math.max(0, deadline - Date.now())));
    let next;
    try { next = await sample(false); } catch (error) {
      if (error instanceof PenpairError && error.code === "mcp-unavailable") return { stable: false, method: "geometry", samples, reason: "Layout did not settle within its request budget" };
      throw error;
    }
    samples = count;
    if (Date.now() > deadline) return { stable: false, method: "geometry", samples, reason: "Layout did not settle before its deadline" };
    if (next.fileId !== first.fileId || next.pageId !== first.pageId) throw new Error("Layout target changed between samples");
    if (next.ok !== true || !validGeometry(next.geometry) || next.truncated) return { stable: false, method: "geometry", samples: count, reason: "Incomplete layout sample" };
    const current = JSON.stringify(next.geometry);
    if (current === previous) return { stable: true, method: "geometry", samples: count };
    previous = current;
  }
  return { stable: false, method: "geometry", samples, reason: "Layout did not settle within its bounded samples" };
}
