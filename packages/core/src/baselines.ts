import { pngSize } from "./png.js";
export { pngSize } from "./png.js";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import type { PenpotToolClient } from "./client.js";
import { baselineCoverage, type BaselineCoverage } from "./baseline-coverage.js";
import { resolveProjectOutput } from "./project-input.js";
import { validateBaselines, type BaselineCase, type BaselinesConfig } from "./baselines-config.js";
import type { LayoutResult } from "./layout.js";
import { version } from "./version.js";
import { atomicWriteFile } from "./atomic-output.js";
import { observationHash } from "./journal.js";
import { exportShapePng, type CaptureIdentity, type ExportOptions } from "./export.js";
import { runOnPage } from "./operation.js";
import { frames } from "./snippets/read.js";

export * from "./baselines-config.js";

export type BaselineStatus =
  /** No image in the folder yet. */
  | "new"
  /** The image in the folder is byte-identical to the design now. */
  | "same"
  /** The design differs from the image in the folder. Replaced only with `update`. */
  | "changed"
  /** The export never settled (two identical renders in a row), so it is not trusted. */
  | "unstable"
  /** The page has no top-level frame with that name. */
  | "missing"
  | "case-mismatch";

export interface ArtifactProvenance extends CaptureIdentity { case?: BaselineCase; layout?: LayoutResult; sha256: string; capturedAt: string; toolVersion: string; file: string }
export interface BaselineResult {
  case?: BaselineCase;
  problems?: string[];
  captured?: ArtifactProvenance;
  approved?: ArtifactProvenance | { legacy: true; sha256: string };
  id: string;
  frame: string;
  frameId?: string;
  width?: number;
  height?: number;
  file: string;
  status: BaselineStatus;
  /** Whether the image was written to the folder in this run. */
  written: boolean;
  /** The image now in the folder: its hash, size in bytes and pixel size. For a design that changed and was not updated this is the old image. */
  sha256?: string;
  bytes?: number;
  imageWidth?: number;
  imageHeight?: number;
}

export interface BaselinesReport {
  coverage: BaselineCoverage;
  complete: boolean;
  fileId: string;
  pageId: string;
  page: string;
  penpotFile: string;
  revn: number;
  results: BaselineResult[];
  /** Files written: images, the manifest and the generated checks. */
  wrote: string[];
}

export interface BaselinesOptions extends ExportOptions {
  signal?: AbortSignal;
  /** Write images that are new. Without it nothing is written, whatever is found. */
  apply?: boolean;
  /** Also replace images whose design has changed. This is the act of approving the new design as the reference; it is the owner's call. */
  update?: boolean;
}

const sha = (buffer: Buffer): string => createHash("sha256").update(buffer).digest("hex");

async function readIfExists(file: string): Promise<Buffer | undefined> {
  try {
    return await readFile(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

/**
 * Exports the configured frames of a page as images into the project's folder: the approved design that an implementation is
 * checked against. Looks first; writes only with `apply`, and replaces an image that differs only with `update`, so a change of
 * the design never silently becomes the new reference.
 */
export async function exportBaselines(client: PenpotToolClient, projectRoot: string, config: BaselinesConfig, options: BaselinesOptions = {}): Promise<BaselinesReport> {
  config = structuredClone(config); validateBaselines(config, message => { throw new Error(message); });
  const listing = await runOnPage(client, frames({ page: config.page }), config.page, options);
  if (listing.ok !== true || typeof listing.fileId !== "string" || !listing.fileId || typeof listing.pageId !== "string" || !listing.pageId || !Number.isInteger(listing.revn) || !Array.isArray(listing.frames)) throw new Error("Baseline listing lacks file/page/revision evidence");
  const found = listing.frames as { id: string; name: string; width: number; height: number }[];
  const results: BaselineResult[] = [];
  const wrote: string[] = [];
  const folder = await resolveProjectOutput(projectRoot, config.root);
  const manifestPath = await resolveProjectOutput(projectRoot, path.join(config.root, "penpair-baselines.json"));
  const previousBytes = await readIfExists(manifestPath);
  const previous = previousBytes ? JSON.parse(previousBytes.toString("utf8")) as { schemaVersion?: number; frames?: BaselineResult[] } : undefined;
  if (previous && (previous.schemaVersion !== undefined && previous.schemaVersion !== 2 || !Array.isArray(previous.frames))) throw new Error("Existing baseline manifest is invalid; preserve and inspect it");
  const runId = randomUUID();
  const generation = `captures/${runId}`;
  const captures = new Map<string, Buffer>();
  for (const wanted of config.frames) {
    options.signal?.throwIfAborted();
    const old = previous?.frames?.find((entry) => entry.id === wanted.id);
    const file = old?.file ?? `${wanted.id}.png`;
    if (path.isAbsolute(file) || file.split(/[\\/]/).includes("..")) throw new Error("Existing baseline path leaves its folder");
    const matches = found.filter((f) => f.name === wanted.frame);
    if (!matches.length) { results.push({ ...(wanted.case ? { case: wanted.case } : {}), id: wanted.id, frame: wanted.frame, file, status: "missing", written: false }); continue; }
    if (matches.length > 1) throw new Error(`more than one top-level frame on ${config.page} is named ${JSON.stringify(wanted.frame)}; rename one so the design reference is unambiguous`);
    const frame = matches[0]!;
    options.onStep?.(`exporting ${wanted.frame}`);
    const exported = await exportShapePng(client, frame.id, { ...options, page: config.page, stable: true });
    const base = { ...(wanted.case ? { case: wanted.case } : {}), id: wanted.id, frame: wanted.frame, frameId: frame.id, width: frame.width, height: frame.height, file };
    if (exported.capture.fileId !== listing.fileId || exported.capture.pageId !== listing.pageId || exported.capture.revision !== listing.revn) throw new Error("Baseline source changed during capture; nothing was published");
    if (!exported.stable) { results.push({ ...base, status: "unstable", written: false }); continue; }
    if (!pngSize(exported.png)) throw new Error("Baseline export is not a PNG with dimensions");
    const existing = await readIfExists(await resolveProjectOutput(projectRoot, path.join(config.root, file)));
    if (old && (!existing || old.sha256 !== sha(existing) || old.approved && old.approved.sha256 !== old.sha256)) throw new Error("Approved baseline bytes no longer match their manifest; inspect before replacing");
    const captured: ArtifactProvenance = { ...(wanted.case ? { case: wanted.case } : {}), layout: exported.layout, ...exported.capture, sha256: sha(exported.png), capturedAt: new Date().toISOString(), toolVersion: version, file: `${generation}/${wanted.id}.png` };
    const caseProblems: string[] = [];
    if (wanted.case) {
      const viewport = wanted.case.viewport, size = pngSize(exported.png)!;
      if (!exported.capture.designSize || exported.capture.designSize.width !== viewport.width || exported.capture.designSize.height !== viewport.height) caseProblems.push("Observed frame dimensions do not match the declared viewport");
      if (size.width !== Math.round(viewport.width * exported.capture.scale) || size.height !== Math.round(viewport.height * exported.capture.scale)) caseProblems.push("PNG dimensions do not match declared viewport and capture scale");
      if (wanted.case.activeThemeIds && (!exported.capture.activeThemeIds || observationHash([...wanted.case.activeThemeIds].sort()) !== observationHash([...exported.capture.activeThemeIds].sort()))) caseProblems.push("Active native theme IDs do not match the capture assertion");
    }
    if (caseProblems.length) { results.push({ ...base, status: "case-mismatch", written: false, captured, approved: old?.approved, sha256: old?.sha256, problems: caseProblems }); continue; }
    const oldCase = old?.approved && "case" in old.approved ? old.approved.case : undefined;
    const status: BaselineStatus = !existing ? "new" : sha(existing) === captured.sha256 && observationHash(oldCase ?? null) === observationHash(wanted.case ?? null) && (!old?.approved || "legacy" in old.approved || old.approved.fileId === captured.fileId && old.approved.pageId === captured.pageId && old.approved.frameId === captured.frameId) ? "same" : "changed";
    const approve = status === "new" || status === "changed" && options.update === true;
    const approved = approve ? captured : old?.approved ?? { legacy: true as const, sha256: sha(existing!) };
    const image = approve ? exported.png : existing!;
    const size = pngSize(image);
    results.push({ ...base, file: approve && options.apply ? captured.file : file, status, written: false, captured,
      approved: options.apply || !approve ? approved : undefined, sha256: sha(image), bytes: image.length, imageWidth: size?.width, imageHeight: size?.height });
    captures.set(wanted.id, exported.png);
  }
  const after = await runOnPage(client, frames({ page: config.page }), config.page, options);
  const source = (value: Record<string, unknown>) => ({ fileId: value.fileId, pageId: value.pageId, revision: value.revn, frames: value.frames });
  if (observationHash(source(listing)) !== observationHash(source(after))) throw new Error("Baseline source changed before publication; previous artifacts were preserved");
  const complete = results.length === config.frames.length && results.every((result) => result.status !== "missing" && result.status !== "unstable" && result.status !== "case-mismatch");
  if (options.apply && complete) {
    options.signal?.throwIfAborted();
    options.onStep?.("publishing complete capture");
    options.signal?.throwIfAborted();
    const captureFolder = await resolveProjectOutput(projectRoot, path.join(config.root, "captures"));
    await mkdir(captureFolder, { recursive: true });
    const staged = path.join(folder, `.stage-${runId}`);
    await mkdir(staged);
    try {
      for (const [id, bytes] of captures) { options.signal?.throwIfAborted(); await atomicWriteFile(path.join(staged, `${id}.png`), bytes); options.onStep?.(`staging ${id}`); }
      const cases = reflectionCases(config, results);
      await writeFile(path.join(staged, "reflection-cases.json"), `${JSON.stringify({ ...cases, captureId: runId }, null, 2)}\n`, { flag: "wx" });
      options.signal?.throwIfAborted();
      await rename(staged, path.join(captureFolder, runId));
      // Immutable generation first. The canonical manifest is the commit point and is published last.
      await atomicWriteFile(path.join(folder, "reflection-cases.json"), `${JSON.stringify({ ...cases, captureId: runId }, null, 2)}\n`, { replace: true });
      options.signal?.throwIfAborted();
      for (const result of results) result.written = result.status === "new" || result.status === "changed" && options.update === true;
      const manifest = { schemaVersion: 2, complete: true, captureId: runId, penpotFile: listing.file, fileId: listing.fileId, page: config.page, pageId: listing.pageId,
        coverage: baselineCoverage(config, results), capturedRevision: listing.revn, casesFile: `${generation}/reflection-cases.json`, note: "Capture provenance and approved provenance are separate. Only --apply --update approves a changed hash.", frames: results };
      await atomicWriteFile(path.join(folder, "penpair-baselines.json"), `${JSON.stringify(manifest, null, 2)}\n`, { replace: true });
      for (const result of results) {
        result.written = result.status === "new" || result.status === "changed" && options.update === true;
        if (result.written) wrote.push(path.join(config.root, result.file));
      }
      wrote.push(path.join(config.root, "reflection-cases.json"), path.join(config.root, "penpair-baselines.json"));
    } finally { await rm(staged, { recursive: true, force: true }); }
  }
  return { coverage: baselineCoverage(config, results), complete, fileId: listing.fileId, pageId: listing.pageId, page: config.page, penpotFile: String(listing.file), revn: Number(listing.revn), results, wrote };
}

/**
 * Visual cases for Reflection, one per frame that names a route: the image's exact size is the viewport (so the capture and the
 * reference have the same dimensions), the image is the baseline, and `ref` joins the check back to the frame.
 * Review-only (`strict: false`): a difference is shown to a person, not failed.
 */
export function reflectionCases(config: BaselinesConfig, results: BaselineResult[]): { note: string; routes: Record<string, { viewports: { name: string; width: number; height: number }[] }>; visualSmoke: Record<string, unknown>[]; pendingCases: Record<string, unknown>[] } {
  const routes: Record<string, { viewports: { name: string; width: number; height: number }[] }> = Object.create(null);
  const visualSmoke: Record<string, unknown>[] = [];
  const pendingCases: Record<string, unknown>[] = [];
  for (const wanted of config.frames) {
    const result = results.find((r) => r.id === wanted.id);
    if (!wanted.route || !result || result.imageWidth === undefined || result.imageHeight === undefined) continue;
    if (wanted.case) {
      const approvedCase = result.approved && "case" in result.approved ? result.approved.case : undefined;
      pendingCases.push({ id: wanted.id, route: wanted.route, case: approvedCase ?? wanted.case, baseline: result.file, ref: `penpair:${wanted.id}`, approvedProvenance: result.approved ?? null, captured: result.captured ?? null, approvedMetadata: Boolean(approvedCase && observationHash(approvedCase) === observationHash(wanted.case)), reason: "Explicit theme/state/fixture/font setup requires an implementation provider mapping", browserVerification: "not-run" });
      continue;
    }
    const viewport = { name: `design-${result.imageWidth}x${result.imageHeight}`, width: result.imageWidth, height: result.imageHeight };
    const entry = (routes[wanted.route] ??= { viewports: [] });
    if (!entry.viewports.some((v) => v.name === viewport.name)) entry.viewports.push(viewport);
    visualSmoke.push({
      id: wanted.id,
      route: wanted.route,
      viewport: viewport.name,
      baselineRoot: config.root,
      baseline: result.file,
      threshold: { maxDiffPixelRatio: config.threshold ?? 0.05 },
      strict: false,
      ref: `penpair:${wanted.id}`,
    });
  }
  return {
    note: "Generated by `penpair baselines`. Add each route's viewports to that route in your Reflection config and spread `visualSmoke` into the browser contract; baselineRoot is relative to the Reflection config's folder.",
    routes,
    visualSmoke,
    pendingCases,
  };
}
