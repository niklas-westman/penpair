import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PenpotToolClient } from "./client.js";
import type { BaselinesConfig } from "./baselines-config.js";
import { exportShapePng, type ExportOptions } from "./export.js";
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
  | "missing";

export interface BaselineResult {
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
  page: string;
  penpotFile: string;
  revn: number;
  results: BaselineResult[];
  /** Files written: images, the manifest and the generated checks. */
  wrote: string[];
}

export interface BaselinesOptions extends ExportOptions {
  /** Write images that are new. Without it nothing is written, whatever is found. */
  apply?: boolean;
  /** Also replace images whose design has changed. This is the act of approving the new design as the reference; it is the owner's call. */
  update?: boolean;
}

const sha = (buffer: Buffer): string => createHash("sha256").update(buffer).digest("hex");

/** Pixel size from a PNG's header (the IHDR chunk), or nothing when the bytes are not a PNG. */
export function pngSize(buffer: Buffer): { width: number; height: number } | undefined {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(signature) || buffer.subarray(12, 16).toString("ascii") !== "IHDR") return undefined;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

async function readIfExists(file: string): Promise<Buffer | undefined> {
  try {
    return await readFile(file);
  } catch {
    return undefined;
  }
}

/**
 * Exports the configured frames of a page as images into the project's folder: the approved design that an implementation is
 * checked against. Looks first; writes only with `apply`, and replaces an image that differs only with `update`, so a change of
 * the design never silently becomes the new reference.
 */
export async function exportBaselines(client: PenpotToolClient, projectRoot: string, config: BaselinesConfig, options: BaselinesOptions = {}): Promise<BaselinesReport> {
  const listing = await runOnPage(client, frames({ page: config.page }), config.page, options);
  const found = (listing.frames as { id: string; name: string; width: number; height: number }[]) ?? [];
  const results: BaselineResult[] = [];
  const wrote: string[] = [];
  const folder = path.join(projectRoot, config.root);
  for (const wanted of config.frames) {
    const file = `${wanted.id}.png`;
    const matches = found.filter((f) => f.name === wanted.frame);
    if (matches.length === 0) {
      results.push({ id: wanted.id, frame: wanted.frame, file, status: "missing", written: false });
      continue;
    }
    if (matches.length > 1) throw new Error(`more than one top-level frame on ${config.page} is named ${JSON.stringify(wanted.frame)}; rename one so the design reference is unambiguous`);
    const frame = matches[0]!;
    options.onStep?.(`exporting ${wanted.frame}`);
    const exported = await exportShapePng(client, frame.id, { ...options, page: config.page, stable: true });
    const base = { id: wanted.id, frame: wanted.frame, frameId: frame.id, width: frame.width, height: frame.height, file };
    if (!exported.stable) {
      results.push({ ...base, status: "unstable", written: false });
      continue;
    }
    const target = path.join(folder, file);
    const existing = await readIfExists(target);
    const status: BaselineStatus = existing === undefined ? "new" : sha(existing) === sha(exported.png) ? "same" : "changed";
    let written = false;
    if (options.apply && (status === "new" || (status === "changed" && options.update))) {
      await mkdir(folder, { recursive: true });
      await writeFile(target, exported.png);
      written = true;
      wrote.push(path.join(config.root, file));
    }
    // A new image that was not written (a look, without --apply) is described by the export; a changed one that was not updated by what is on disk.
    const onDisk = written || status === "same" || status === "new" ? exported.png : (existing as Buffer);
    const size = pngSize(onDisk);
    results.push({ ...base, status, written, sha256: sha(onDisk), bytes: onDisk.length, imageWidth: size?.width, imageHeight: size?.height });
  }
  if (options.apply) {
    const onDisk = results.filter((r) => r.status !== "missing" && r.status !== "unstable" && (r.written || r.status === "same" || r.status === "changed"));
    if (onDisk.length > 0) {
      await mkdir(folder, { recursive: true });
      const manifest = path.join(folder, "penpair-baselines.json");
      await writeFile(manifest, `${JSON.stringify(manifestOf(config, listing, onDisk), null, 2)}\n`);
      wrote.push(path.join(config.root, "penpair-baselines.json"));
      const cases = path.join(folder, "reflection-cases.json");
      await writeFile(cases, `${JSON.stringify(reflectionCases(config, onDisk), null, 2)}\n`);
      wrote.push(path.join(config.root, "reflection-cases.json"));
    }
  }
  return { page: config.page, penpotFile: String(listing.file ?? ""), revn: Number(listing.revn ?? 0), results, wrote };
}

function manifestOf(config: BaselinesConfig, listing: Record<string, unknown>, results: BaselineResult[]): unknown {
  return {
    note: "Written by `penpair baselines`. The images are the approved design for each frame; change one only on purpose (`penpair baselines --apply --update`).",
    penpotFile: listing.file,
    page: config.page,
    revn: listing.revn,
    frames: results.map((r) => ({ id: r.id, frame: r.frame, frameId: r.frameId, width: r.imageWidth, height: r.imageHeight, file: r.file, sha256: r.sha256, bytes: r.bytes })),
  };
}

/**
 * Visual cases for Reflection, one per frame that names a route: the image's exact size is the viewport (so the capture and the
 * reference have the same dimensions), the image is the baseline, and `ref` joins the check back to the frame.
 * Review-only (`strict: false`): a difference is shown to a person, not failed.
 */
export function reflectionCases(config: BaselinesConfig, results: BaselineResult[]): { note: string; routes: Record<string, { viewports: { name: string; width: number; height: number }[] }>; visualSmoke: Record<string, unknown>[] } {
  const routes: Record<string, { viewports: { name: string; width: number; height: number }[] }> = {};
  const visualSmoke: Record<string, unknown>[] = [];
  for (const wanted of config.frames) {
    const result = results.find((r) => r.id === wanted.id);
    if (!wanted.route || !result || result.imageWidth === undefined || result.imageHeight === undefined) continue;
    const viewport = { name: `design-${result.imageWidth}x${result.imageHeight}`, width: result.imageWidth, height: result.imageHeight };
    const entry = (routes[wanted.route] ??= { viewports: [] });
    if (!entry.viewports.some((v) => v.name === viewport.name)) entry.viewports.push(viewport);
    visualSmoke.push({
      id: wanted.id,
      route: wanted.route,
      viewport: viewport.name,
      baselineRoot: config.root,
      baseline: `${wanted.id}.png`,
      threshold: { maxDiffPixelRatio: config.threshold ?? 0.05 },
      strict: false,
      ref: `penpair:${wanted.id}`,
    });
  }
  return {
    note: "Generated by `penpair baselines`. Add each route's viewports to that route in your Reflection config and spread `visualSmoke` into the browser contract; baselineRoot is relative to the Reflection config's folder.",
    routes,
    visualSmoke,
  };
}
