import { requirePage, snippet, type Snippet } from "../snippet.js";

const readSnippet = (name: string, body: string, params: unknown = {}): Snippet => snippet(name, body, params, "read");

export function pages(): Snippet {
  return readSnippet(
    "pages",
    `return { ok: true, readOnly: true, file: penpot.currentFile.name, revn: penpot.currentFile.revn, current: penpot.currentPage.name,
  pages: penpot.currentFile.pages.map((p) => ({ id: p.id, name: p.name, count: p.root.children.length })) };`,
  );
}

/** The editor can only change page between snippets: it switches, and the next snippet sees the new page. */
export function switchPage(name: string): Snippet {
  return snippet(
    "switch-page",
    `const target = penpot.currentFile.pages.find((p) => p.name === CFG.name);
if (!target) return { ok: false, message: "no page named " + CFG.name };
if (penpot.currentPage.id === target.id) return { ok: true, alreadyThere: true };
penpot.openPage(target);
return { ok: true, switched: true };`,
    { name },
  );
}

export interface FramesParams {
  page: string;
}

/** The top-level frames of a page: id, name and size, so they can be found by name and exported. */
export function frames(params: FramesParams): Snippet {
  return readSnippet(
    "frames",
    `${requirePage}
return { ok: true, readOnly: true, file: penpot.currentFile.name, fileId: penpot.currentFile.id, revn: penpot.currentFile.revn, page: penpot.currentPage.name, pageId: penpot.currentPage.id,
  frames: penpot.currentPage.root.children.filter((c) => c.type === "board").map((c) => ({ id: c.id, name: c.name, width: Math.round(c.width), height: Math.round(c.height) })) };`,
    params,
  );
}

export interface TreeParams {
  page: string;
  depth?: number;
  /** Only top-level shapes whose name starts with this. */
  namePrefix?: string;
  /** Stop after this many lines, so the answer stays small. */
  limit?: number;
}

/** One line per shape: type, name, size, position on the page, layout and sizing, the text it carries. */
export function tree(params: TreeParams): Snippet {
  return readSnippet(
    "tree",
    `${requirePage}
const depth = CFG.depth === undefined ? 3 : CFG.depth, limit = CFG.limit || 400, lines = [];
const fx = (s) => (s.flex ? " flex:" + s.flex.dir + "/" + s.flex.horizontalSizing + "-" + s.flex.verticalSizing : "");
const lc = (s) => (s.layoutChild ? " lc:" + (s.layoutChild.horizontalSizing || "") + "-" + (s.layoutChild.verticalSizing || "") + (s.layoutChild.absolute ? " ABS" : "") : "");
const walk = (s, d) => {
  if (d > depth || lines.length >= limit) return;
  lines.push("  ".repeat(d) + s.type[0] + " " + s.name + " " + Math.round(s.width) + "x" + Math.round(s.height) + "@" + Math.round(s.x) + "," + Math.round(s.y) + fx(s) + lc(s) + (s.type === "text" ? " «" + (s.characters || "").slice(0, 24) + "»" : "") + (s.hidden ? " HIDDEN" : ""));
  (s.children || []).forEach((c) => walk(c, d + 1));
};
penpot.currentPage.root.children.filter((c) => !CFG.namePrefix || c.name.startsWith(CFG.namePrefix)).forEach((c) => walk(c, 0));
return { ok: true, readOnly: true, page: penpot.currentPage.name, lines, truncated: lines.length >= limit };`,
    params,
  );
}

export interface AuditParams {
  page: string;
  /** Top-level frames to audit: names starting with this. */
  framePrefix: string;
  /** The allowed gap and padding values. Omit to skip the spacing check. */
  spacingSteps?: number[];
  /** Shapes whose names start with one of these are not reported as unbound (library parts that carry their own fills). */
  ignoreUnbound?: string[];
}

/** Blank text, colours and strokes not bound to a token, children sticking out of their parent, gaps off the allowed steps. */
export function audit(params: AuditParams): Snippet {
  return readSnippet(
    "audit",
    `${requirePage}
const frames = penpot.currentPage.root.children.filter((c) => c.name.startsWith(CFG.framePrefix));
const skip = (n) => (CFG.ignoreUnbound || []).some((p) => n.startsWith(p));
const out = {};
for (const fr of frames) {
  const f = { nodes: 0, texts: 0, blankText: 0, unboundFills: [], unboundStrokes: [], badSpacing: [], overflow: [] };
  const walk = (s, parent) => {
    f.nodes++;
    const tk = s.tokens ? Object.keys(s.tokens) : [];
    if (s.type === "text") { if (!(s.characters || "").trim()) f.blankText++; else f.texts++; }
    else if (!skip(s.name) && s.fills && s.fills.some((x) => x.fillColor) && !tk.some((k) => k.startsWith("fill"))) f.unboundFills.push(s.name + ":" + s.fills[0].fillColor);
    if (s.type !== "text" && !skip(s.name) && s.strokes && s.strokes.length && !tk.some((k) => k.startsWith("stroke"))) f.unboundStrokes.push(s.name);
    if (s.flex && CFG.spacingSteps) for (const v of [s.flex.rowGap, s.flex.columnGap, s.flex.topPadding, s.flex.rightPadding, s.flex.bottomPadding, s.flex.leftPadding])
      if (v !== undefined && v !== null && !CFG.spacingSteps.includes(Math.round(v))) f.badSpacing.push(s.name + ":" + v);
    if (parent && parent.type === "board" && !(s.layoutChild && s.layoutChild.absolute) && (s.x + s.width > parent.x + parent.width + 1 || s.x < parent.x - 1)) f.overflow.push(s.name + " in " + parent.name);
    (s.children || []).forEach((c) => { if (!c.hidden) walk(c, s); });
  };
  walk(fr, null);
  for (const k of ["unboundFills", "unboundStrokes", "badSpacing", "overflow"]) f[k] = f[k].slice(0, 8);
  out[fr.name] = f;
}
return { ok: true, readOnly: true, frames: out };`,
    params,
  );
}

/** Token sets (in order, with whether each is active) and themes. Object-valued tokens print as [object Object]; compare names for those. */
export function tokensDump(): Snippet {
  return readSnippet(
    "tokens-dump",
    `const tokens = penpot.library.local.tokens;
return { ok: true, readOnly: true,
  sets: tokens.sets.map((s, i) => ({ order: i, name: s.name, active: !!s.active, tokens: s.tokens.map((t) => t.name + "=" + t.value) })),
  themes: tokens.themes.map((t) => ({ group: t.group, name: t.name, active: !!t.active, sets: (t.activeSets || []).map((x) => (typeof x === "string" ? x : x.name)) })) };`,
  );
}
