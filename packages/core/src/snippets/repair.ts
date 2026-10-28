import { requirePage, snippet, type Snippet } from "../snippet.js";

export interface RepairParams {
  page: string;
  /** The ghost count seen at inspection; the write refuses if the page changed since. */
  expectedCount?: number;
}

// A ghost is a direct child of the page root that has no id: an interrupted build leaves them, and they make every
// whole-page layout observation fail.
const ghosts = `${requirePage}
const top = penpot.currentPage.root.children;
const ghosts = top.map((shape, index) => ({ shape, index })).filter((entry) => !entry.shape || typeof entry.shape.id !== "string" || !entry.shape.id);
const described = ghosts.map((entry) => ({ index: entry.index, name: entry.shape && entry.shape.name !== undefined ? entry.shape.name : null, type: entry.shape && entry.shape.type !== undefined ? entry.shape.type : null }));`;

/** Read-only: the shapes without an id that sit on the page root. */
export function repairInspect(params: RepairParams): Snippet {
  return snippet(
    "repair-inspect",
    `${ghosts}
return { ok: true, readOnly: true, found: described.length, ghosts: described.slice(0, 50) };`,
    params,
  );
}

/** One write: asks Penpot to remove each ghost. Whether that clears them is read back independently. */
export function repairApply(params: RepairParams): Snippet {
  return snippet(
    "repair-apply",
    `${ghosts}
if (typeof CFG.expectedCount === "number" && CFG.expectedCount !== described.length) return { ok: false, message: "The page changed since inspection (" + described.length + " shapes without an id, expected " + CFG.expectedCount + "); no shape was removed" };
const errors = [];
let attempted = 0;
for (const entry of ghosts) {
  attempted++;
  try { if (entry.shape && typeof entry.shape.remove === "function") entry.shape.remove(); else errors.push("index " + entry.index + ": no remove()"); }
  catch (error) { errors.push("index " + entry.index + ": " + String(error && error.message || error)); }
}
return { ok: true, submitted: true, attempted, errors: errors.slice(0, 20) };`,
    params,
  );
}

/** Independent readback: how many are still there. */
export function repairReadback(params: RepairParams): Snippet {
  return snippet(
    "repair-readback",
    `${ghosts}
return { ok: true, readOnly: true, remaining: described.length, ghosts: described.slice(0, 50) };`,
    params,
  );
}
