import { capturePhase } from "./capture-progress.js";
import { createHash } from "node:crypto";
import { mkdir, lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { atomicWriteFile } from "./atomic-output.js";
import type { PenpotToolClient } from "./client.js";
import { exportShapePng, type ExportOptions } from "./export.js";
import { resolveProjectOutput } from "./project-input.js";
import { requirePage, snippet } from "./snippet.js";
import { runOnPage } from "./operation.js";

export interface FrameRequest {
  id: string;
  /** File name without extension; defaults to the id. */
  name: string;
}
export type FrameOutcome = "exported" | "cached" | "failed";
export interface FrameResult {
  id: string;
  file: string;
  outcome: FrameOutcome;
  bytes?: number;
  elapsedMs: number;
  message?: string;
}
export interface BatchReport {
  schemaVersion: 1;
  complete: boolean;
  out: string;
  cache: boolean;
  frames: FrameResult[];
  summary: {
    exported: number;
    cached: number;
    failed: number;
  };
}
interface CacheEntry {
  fingerprint: string;
  sha256: string;
  bytes: number;
  savedAt: string;
}
type CacheFile = Record<string, CacheEntry>;

const namePattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const cachePath = [
  ".penpair",
  "export-cache.json",
];

/** `ID` or `ID=NAME`, comma separated. Distinct ids and names; names are plain file stems. */
export function parseFrames(text: string): FrameRequest[] {
  const frames = text.split(",").map((entry): FrameRequest => {
    const parts = entry.trim().split("=");
    const id = parts[0] ?? "";
    const name = parts.length === 1 ? id : (parts[1] ?? "");
    if (!id || parts.length > 2 || !namePattern.test(name) || name.includes("..")) {
      throw new Error(
        `--frames entries are ID or ID=NAME (NAME: letters, digits, dot, dash, underscore); got ${JSON.stringify(entry)}`,
      );
    }
    return {
      id,
      name,
    };
  });
  if (frames.length < 1 || frames.length > 200) {
    throw new Error("--frames takes 1 to 200 frames");
  }
  if (
    new Set(frames.map((frame) => frame.id)).size !== frames.length ||
    new Set(frames.map((frame) => frame.name)).size !== frames.length
  ) {
    throw new Error("--frames ids and names must be distinct");
  }
  return frames;
}

/**
 * A fast stand-in for "has this board changed": the visible properties of every shape under it plus the active token values.
 * It is not a pixel proof (fonts, image bytes and effects outside the listed properties are not read), which is why the cache is opt-in
 * and a cached frame is reported as cached, never as freshly exported.
 */
const fingerprintSnippet = (frameId: string, page?: string) =>
  snippet(
    "export-fingerprint",
    `${requirePage}
const root = penpot.currentPage.getShapeById(CFG.id);
if (!root) return { ok: false, message: "no shape " + CFG.id + " on " + penpot.currentPage.name };
const keys = ["type","name","x","y","width","height","rotation","opacity","blendMode","hidden","visible","fills","strokes","shadows","blur","borderRadius","borderRadiusTopLeft","borderRadiusTopRight","borderRadiusBottomRight","borderRadiusBottomLeft","clipContent","characters","fontFamily","fontSize","fontWeight","fontStyle","lineHeight","letterSpacing","textTransform","textDecoration","align","verticalAlign","growType","tokens","proportionLock","constraintsHorizontal","constraintsVertical","content"];
const flexKeys = ["dir","wrap","alignItems","alignContent","justifyContent","justifyItems","rowGap","columnGap","verticalPadding","horizontalPadding","topPadding","rightPadding","bottomPadding","leftPadding","horizontalSizing","verticalSizing"];
const childKeys = ["horizontalSizing","verticalSizing","absolute","zIndex","minWidth","maxWidth","minHeight","maxHeight"];
const read = (target, names) => names.map((key) => { try { const value = target ? target[key] : undefined; return value === undefined ? null : value; } catch (error) { return "!"; } });
const parts = [], stack = [root];
let truncated = false;
while (stack.length) {
  if (parts.length >= CFG.maxNodes) { truncated = true; break; }
  const shape = stack.pop();
  let row;
  try { row = JSON.stringify([shape.id, read(shape, keys), read(shape.flex, flexKeys), read(shape.layoutChild, childKeys)]); } catch (error) { row = "unreadable:" + shape.id; }
  parts.push(row);
  const kids = shape.children || [];
  for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]);
}
let tokens = "";
try { tokens = JSON.stringify((penpot.library.local.tokens.sets || []).filter((set) => set.active).map((set) => [set.name, (set.tokens || []).map((token) => [token.name, token.type, token.value])])); } catch (error) { tokens = "tokens-unreadable"; }
const themes = (penpot.library?.local?.tokens?.themes || []).filter((theme) => theme.active).map((theme) => theme.group + "/" + theme.name).sort();
const text = parts.join("\\n") + "\\n" + tokens + "\\n" + themes.join(",");
let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
for (let i = 0; i < text.length; i++) { const code = text.charCodeAt(i); h1 = Math.imul(h1 ^ code, 2654435761); h2 = Math.imul(h2 ^ code, 1597334677); }
h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
const fingerprint = (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16) + ":" + parts.length + ":" + text.length;
return { ok: true, fileId: penpot.currentFile.id, pageId: penpot.currentPage.id, frameId: root.id, nodes: parts.length, truncated, fingerprint };`,
    {
      id: frameId,
      page,
      maxNodes: 20000,
    },
    "read",
  );

async function readCache(file: string): Promise<CacheFile> {
  try {
    const parsed = JSON.parse(await readFile(file, "utf8")) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as CacheFile)
      : {};
  } catch {
    return {};
  }
}
const sha256 = (data: Uint8Array): string => createHash("sha256").update(data).digest("hex");

export interface BatchOptions extends ExportOptions {
  cache?: boolean;
  log?: (line: string) => void;
  signal?: AbortSignal;
  /** Stop after the first failed frame. */
  stopOnFailure?: boolean;
}

/**
 * Exports several frames, one at a time. With `cache`, a frame whose fingerprint, scale and file are unchanged since its last
 * export is not exported again. A failure is recorded and the batch goes on, so one bad frame does not cost the other 33.
 */
export async function exportFrames(
  client: PenpotToolClient,
  root: string,
  params: {
    page: string;
    frames: FrameRequest[];
    out: string;
  },
  options: BatchOptions = {},
): Promise<BatchReport> {
  const folder = await resolveProjectOutput(root, params.out);
  await mkdir(folder, {
    recursive: true,
  });
  const info = await lstat(folder);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error("Export output must be a real directory inside this project");
  }
  const cacheFile = options.cache
    ? await resolveProjectOutput(root, cachePath.join("/"))
    : undefined;
  const cache = cacheFile ? await readCache(cacheFile) : {};
  const scale = options.scale ?? 1;
  const results: FrameResult[] = [];
  const total = params.frames.length;
  for (const [index, frame] of params.frames.entries()) {
    options.signal?.throwIfAborted();
    const frameOptions = {
      ...options,
      onProgress: options.onProgress
        ? (event: import("./capture-progress.js").CaptureProgress) =>
            options.onProgress?.({
              ...event,
              frame: frame.name,
              index: index + 1,
              total,
            })
        : undefined,
    };
    const started = Date.now();
    const file = path.join(params.out, `${frame.name}.png`);
    const target = await resolveProjectOutput(root, file);
    const where = `frame ${index + 1} of ${total} "${frame.name}"`;
    try {
      let fingerprint: string | undefined;
      let key: string | undefined;
      if (options.cache) {
        const seen = await capturePhase(frameOptions, "export", "fingerprint", () =>
          runOnPage(client, fingerprintSnippet(frame.id, params.page), params.page, {
            ...options,
            effect: "read",
          }),
        );
        if (
          seen.ok !== true ||
          typeof seen.fingerprint !== "string" ||
          typeof seen.fileId !== "string" ||
          typeof seen.pageId !== "string"
        ) {
          throw new Error(
            typeof seen.message === "string"
              ? seen.message
              : "The frame could not be fingerprinted",
          );
        }
        // A fingerprint of a truncated sample is not evidence of "unchanged".
        fingerprint = seen.truncated === true ? undefined : seen.fingerprint;
        key = `${seen.fileId}/${seen.pageId}/${frame.id}/${scale}`;
        const entry = cache[key];
        if (fingerprint && entry && entry.fingerprint === fingerprint) {
          const existing = await readFile(target).catch(() => undefined);
          if (existing && sha256(existing) === entry.sha256) {
            results.push({
              id: frame.id,
              file,
              outcome: "cached",
              bytes: existing.length,
              elapsedMs: Date.now() - started,
            });
            frameOptions.onProgress?.({
              schemaVersion: 1,
              kind: "progress",
              command: "export",
              phase: "cache",
              status: "cached",
              elapsedMs: Date.now() - started,
            });
            options.log?.(`${where}: unchanged since its last export, kept ${file}`);
            continue;
          }
        }
      }
      options.log?.(`${where}: exporting`);
      const exported = await exportShapePng(client, frame.id, {
        ...frameOptions,
        page: params.page,
        stable: true,
      });
      if (!exported.stable) {
        throw new Error("Export did not stabilize; the previous file was kept");
      }
      await capturePhase(frameOptions, "export", "publish", () =>
        atomicWriteFile(target, exported.png, {
          replace: true,
        }),
      );
      if (cacheFile && key) {
        if (fingerprint) {
          cache[key] = {
            fingerprint,
            sha256: sha256(exported.png),
            bytes: exported.png.length,
            savedAt: new Date().toISOString(),
          };
        } else {
          delete cache[key];
        }
        await mkdir(path.dirname(cacheFile), {
          recursive: true,
          mode: 0o700,
        });
        await atomicWriteFile(cacheFile, `${JSON.stringify(cache, null, 2)}\n`, {
          replace: true,
        });
      }
      results.push({
        id: frame.id,
        file,
        outcome: "exported",
        bytes: exported.png.length,
        elapsedMs: Date.now() - started,
      });
      options.log?.(`${where}: exported in ${Math.round((Date.now() - started) / 100) / 10} s`);
    } catch (error) {
      if (options.signal?.aborted) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        id: frame.id,
        file,
        outcome: "failed",
        elapsedMs: Date.now() - started,
        message,
      });
      options.log?.(`${where}: failed (${message})`);
      if (options.stopOnFailure) {
        break;
      }
    }
  }
  const summary = {
    exported: results.filter((result) => result.outcome === "exported").length,
    cached: results.filter((result) => result.outcome === "cached").length,
    failed: results.filter((result) => result.outcome === "failed").length,
  };
  return {
    schemaVersion: 1,
    complete: summary.failed === 0 && results.length === total,
    out: params.out,
    cache: options.cache === true,
    frames: results,
    summary,
  };
}
