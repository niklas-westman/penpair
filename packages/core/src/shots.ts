import { randomUUID, createHash } from "node:crypto";
import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import type { PenpotToolClient } from "./client.js";
import { PenpairError } from "./errors.js";
import { snippet, requirePage } from "./snippet.js";
import { runOnPage } from "./operation.js";
import { frames } from "./snippets/read.js";
import { exportShapePng, type ExportOptions, type CaptureIdentity } from "./export.js";
import { resolveProjectOutput } from "./project-input.js";
import { atomicWriteFile } from "./atomic-output.js";
import { pngSize } from "./baselines.js";
import { observationHash } from "./journal.js";

export interface ShapeMatch { id: string; name: string; type: string }
export interface ShapeLookup { fileId: string; pageId: string; revision: number; matches: ShapeMatch[] }
/** Exact names across the selected page. A match never silently resolves an ambiguity. */
export async function findShapesByName(client: PenpotToolClient, name: string, page: string, options: ExportOptions = {}): Promise<ShapeLookup> {
  if (!name || !page) throw new Error("Name lookup requires an exact name and explicit page");
  const result = await runOnPage(client, snippet("find-shape-name", `${requirePage}
const matches = [], stack = [...penpot.currentPage.root.children]; let visited = 0;
while (stack.length && visited < 10000) {
  const shape = stack.pop(); visited++;
  if (shape.name === CFG.name) matches.push({id:shape.id,name:shape.name,type:shape.type});
  for (const child of shape.children || []) stack.push(child);
}
return {ok:true,fileId:penpot.currentFile.id,pageId:penpot.currentPage.id,revision:penpot.currentFile.revn,matches,truncated:stack.length>0};`, { name, page }, "read"), page, options);
  if (result.truncated) throw new PenpairError("incomplete-output", "Shape name search exceeded 10000 nodes; narrow the page");
  if (result.ok !== true || typeof result.truncated !== "boolean" || typeof result.fileId !== "string" || !result.fileId || typeof result.pageId !== "string" || !result.pageId || !Number.isInteger(result.revision) || !Array.isArray(result.matches) || result.matches.some((match) => !match || typeof match.id !== "string" || typeof match.name !== "string" || typeof match.type !== "string")) throw new Error("Shape search returned incomplete identity evidence");
  return result as unknown as ShapeLookup;
}

export async function exportShapeByName(client: PenpotToolClient, name: string, page: string, options: ExportOptions = {}) {
  const lookup = await findShapesByName(client, name, page, options);
  if (lookup.matches.length !== 1) throw new Error(`Exact name ${JSON.stringify(name)} matched ${lookup.matches.length} shapes on ${JSON.stringify(page)}. Candidates: ${JSON.stringify(lookup.matches.slice(0, 20))}. Use an ID for an ambiguous name.`);
  const result = await exportShapePng(client, lookup.matches[0]!.id, { ...options, page });
  if (result.capture.fileId !== lookup.fileId || result.capture.pageId !== lookup.pageId || result.capture.revision !== lookup.revision) throw new Error("Named export source changed after lookup; no output was published");
  return result;
}

export interface ShotsReport { schemaVersion: 1; complete: boolean; fileId: string; pageId: string; revision: number; captures: { name: string; file: string; sha256: string; capture: CaptureIdentity; width: number; height: number }[]; wrote: string[]; reason?: string }
/** Ad-hoc captures use immutable generations, but never carry baseline approval records. */
export async function captureShots(client: PenpotToolClient, root: string, params: { page: string; prefix?: string; out?: string }, options: ExportOptions & { signal?: AbortSignal } = {}): Promise<ShotsReport> {
  const listing = await runOnPage(client, frames({ page: params.page }), params.page, options);
  if (typeof listing.fileId !== "string" || typeof listing.pageId !== "string" || !Number.isInteger(listing.revn) || !Array.isArray(listing.frames)) throw new Error("Shots listing lacks identity/revision evidence");
  const selected = (listing.frames as ShapeMatch[]).filter((frame) => !params.prefix || frame.name.startsWith(params.prefix));
  const report: ShotsReport = { schemaVersion: 1, complete: false, fileId: listing.fileId, pageId: listing.pageId, revision: Number(listing.revn), captures: [], wrote: [] };
  if (!selected.length || selected.length > 100) return { ...report, reason: !selected.length ? "No matching top-level frames" : "More than 100 frames; narrow the prefix" };
  const folder = await resolveProjectOutput(root, params.out ?? "design/shots");
  const runId = randomUUID(), generation = `captures/${runId}`;
  const images: Buffer[] = [];
  for (const [index, frame] of selected.entries()) {
    options.signal?.throwIfAborted();
    options.onStep?.(`exporting ${JSON.stringify(frame.name)}`);
    const result = await exportShapePng(client, frame.id, { ...options, page: params.page, stable: true });
    if (!result.stable) return { ...report, reason: "A frame did not stabilize; no output was published" };
    if (result.capture.fileId !== report.fileId || result.capture.pageId !== report.pageId || result.capture.revision !== report.revision) throw new Error("Shots source changed during capture; no output was published");
    const size = pngSize(result.png);
    if (!size || size.width <= 0 || size.height <= 0) throw new Error("Shot export is missing valid PNG dimensions");
    report.captures.push({ ...size, name: frame.name, file: `${generation}/shot-${String(index + 1).padStart(4, "0")}.png`, sha256: createHash("sha256").update(result.png).digest("hex"), capture: result.capture });
    images.push(result.png);
  }
  const after = await runOnPage(client, frames({ page: params.page }), params.page, options);
  const identity = (entry: Record<string, unknown>) => ({ fileId: entry.fileId, pageId: entry.pageId, revision: entry.revn, frames: entry.frames });
  if (observationHash(identity(listing)) !== observationHash(identity(after))) throw new Error("Shots source changed before publication; previous output was preserved");
  options.signal?.throwIfAborted();
  await mkdir(path.join(folder, "captures"), { recursive: true });
  const staged = path.join(folder, `.stage-${runId}`); await mkdir(staged);
  try {
    for (const [index, bytes] of images.entries()) {
      options.signal?.throwIfAborted();
      await atomicWriteFile(path.join(staged, path.basename(report.captures[index]!.file)), bytes);
    }
    options.signal?.throwIfAborted();
    await rename(staged, path.join(folder, generation));
    options.signal?.throwIfAborted();
    report.complete = true;
    report.wrote = [...report.captures.map((entry) => entry.file), "penpair-shots.json"];
    await atomicWriteFile(path.join(folder, "penpair-shots.json"), `${JSON.stringify(report, null, 2)}\n`, { replace: true });
    return report;
  } finally { await rm(staged, { recursive: true, force: true }); }
}
