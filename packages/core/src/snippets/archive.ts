import { requirePage, snippet, type Snippet } from "../snippet.js";

export interface ArchiveParams {
  page: string;
  /** Name of the board the archived frames are nested into. */
  archiveName: string;
  /** Top-level boards whose names start with one of these stay live. */
  keepPrefixes: string[];
  /** Library parts (component mains): never archived. */
  partPrefixes: string[];
  /** Where the archive board is placed, to the right of the live work. */
  x: number;
}

// The plan every phase shares: boards that are not parts and not kept, found directly on the page.
const select = `${requirePage}
const top = penpot.currentPage.root.children;
const isPart = (n) => CFG.partPrefixes.some((p) => n.startsWith(p));
const isKept = (n) => CFG.keepPrefixes.some((p) => n.startsWith(p));
const existing = top.find((c) => c.name === CFG.archiveName && c.type === "board");
const candidates = top.filter((c) => c.type === "board" && c !== existing && !isPart(c.name) && !isKept(c.name));
const plan = candidates.map((c) => ({ id: c.id, name: c.name, x: Math.round(c.x), y: Math.round(c.y), w: Math.round(c.width), h: Math.round(c.height) }));`;

/** Read-only: what would move and what stays. */
export function archiveInspect(params: ArchiveParams): Snippet {
  return snippet(
    "archive-inspect",
    `${select}
return { ok: true, readOnly: true, archiveExists: !!existing, willMove: plan.length, stays: top.filter((c) => c !== existing && !candidates.includes(c)).length, plan };`,
    params,
  );
}

/** One write: nests the frames in the archive board and moves the board aside. Safe to run again; frames already inside are not touched. */
export function archiveApply(params: ArchiveParams): Snippet {
  return snippet(
    "archive-apply",
    `${select}
if (plan.length === 0) return { ok: true, moved: 0, archiveId: existing ? existing.id : null };
const minX = Math.min(...plan.map((p) => p.x)), minY = Math.min(...plan.map((p) => p.y));
const maxX = Math.max(...plan.map((p) => p.x + p.w)), maxY = Math.max(...plan.map((p) => p.y + p.h));
let archive = existing;
if (!archive) {
  archive = penpot.createBoard();
  archive.name = CFG.archiveName; archive.fills = []; archive.clipContent = false;
  archive.x = minX; archive.y = minY; archive.resize(maxX - minX, maxY - minY);
}
for (const p of plan) archive.appendChild(penpot.currentPage.getShapeById(p.id));
archive.x = CFG.x; archive.y = 0;
return { ok: true, submitted: true, moved: plan.length, archiveId: archive.id };`,
    params,
  );
}

/** Independent readback: what is in the archive board and what is still loose on the page. */
export function archiveReadback(params: ArchiveParams): Snippet {
  return snippet(
    "archive-readback",
    `${requirePage}
const top = penpot.currentPage.root.children;
const archive = top.find((c) => c.name === CFG.archiveName && c.type === "board");
const inside = archive ? archive.children.map((c) => c.id) : [];
const isPart = (n) => CFG.partPrefixes.some((p) => n.startsWith(p));
const isKept = (n) => CFG.keepPrefixes.some((p) => n.startsWith(p));
const loose = top.filter((c) => c !== archive && c.type === "board" && !isPart(c.name) && !isKept(c.name)).map((c) => c.name);
return { ok: true, readOnly: true, archive: archive ? { id: archive.id, x: Math.round(archive.x), y: Math.round(archive.y), children: inside.length } : null, loose };`,
    params,
  );
}
