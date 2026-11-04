import { snippet, type Snippet } from "../snippet.js";

export interface NativeCopyPlacement {
  id: string;
  x: number;
  y: number;
}

const helpers = `
const assertFile = () => {
  if (!penpot.currentFile || penpot.currentFile.id !== CFG.fileId) {
    throw new Error("Pinned copy file changed");
  }
};
const assertPage = () => {
  assertFile();
  if (!penpot.currentPage || penpot.currentPage.id !== CFG.pageId) {
    throw new Error("Pinned copy page changed");
  }
};
const scan = page => {
  if (!page || !page.root || !Array.isArray(page.root.children)) {
    throw new Error("Copy page hierarchy is unavailable");
  }
  const found = new Map();
  const parents = new Map();
  const stack = page.root.children.map(shape => [shape, null]).reverse();
  if (stack.length > 20000) throw new Error("Copy page node budget exceeded");
  while (stack.length) {
    if (found.size >= 20000) throw new Error("Copy page node budget exceeded");
    const [shape, parentId] = stack.pop();
    if (!shape || typeof shape.id !== "string" || !shape.id || found.has(shape.id)) {
      throw new Error("Copy page has malformed or duplicate shape identities");
    }
    found.set(shape.id, shape);
    parents.set(shape.id, parentId);
    const children = shape.children === undefined ? [] : shape.children;
    if (!Array.isArray(children)) throw new Error("Copy page hierarchy is malformed");
    if (found.size + stack.length + children.length > 20000) {
      throw new Error("Copy page node budget exceeded");
    }
    for (let index = children.length - 1; index >= 0; index--) {
      stack.push([children[index], shape.id]);
    }
  }
  return { found, parents };
};
const count = shape => {
  let total = 0;
  const seen = new Set();
  const stack = [shape];
  while (stack.length) {
    const current = stack.pop();
    if (!current || seen.has(current.id) || ++total > 20000) {
      throw new Error("Copy subtree is malformed or exceeds its node budget");
    }
    seen.add(current.id);
    const children = current.children === undefined ? [] : current.children;
    if (!Array.isArray(children) || total + stack.length + children.length > 20000) {
      throw new Error("Copy subtree is malformed or exceeds its node budget");
    }
    stack.push(...children);
  }
  return total;
};
const geometry = shape => {
  if (![shape.x, shape.y, shape.width, shape.height].every(Number.isFinite) || shape.width < 0 || shape.height < 0) {
    throw new Error("Copy shape geometry is unavailable");
  }
  return { id: shape.id, name: shape.name, x: shape.x, y: shape.y, width: shape.width, height: shape.height, nodeCount: count(shape) };
};
const metadata = (shape, key) => {
  if (typeof shape.getSharedPluginData !== "function") {
    throw new Error("Copy ownership metadata API unavailable");
  }
  const raw = shape.getSharedPluginData("penpair", key);
  if (!raw) return null;
  let value;
  try { value = JSON.parse(raw); } catch { throw new Error("Malformed copy ownership metadata"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Malformed copy ownership metadata");
  }
  return value;
};
const releaseMarkers = page => {
  const release = metadata(page.root, "design-release");
  if (release && (release.schemaVersion !== 1 || release.owner !== "penpair" || release.productVersion !== CFG.releaseVersion || typeof release.releaseId !== "string" || !release.releaseId || typeof release.ownerKey !== "string" || !release.ownerKey || release.status !== "draft")) {
    throw new Error("Release destination is finalized or its ownership marker is invalid");
  }
  const copy = metadata(page.root, "native-release-copy");
  if (copy && (copy.schemaVersion !== 1 || copy.owner !== "penpair" || copy.kind !== "native-release-copy" || copy.fileId !== CFG.fileId || copy.productVersion !== CFG.releaseVersion || typeof copy.ownerKey !== "string" || !copy.ownerKey || copy.created !== true)) {
    throw new Error("Native copy page ownership marker is invalid");
  }
  return { release, copy };
};
const destination = () => {
  assertFile();
  if (!Array.isArray(penpot.currentFile.pages) || penpot.currentFile.pages.length > 1000) {
    throw new Error("Copy page list is unavailable or exceeds its budget");
  }
  const matches = penpot.currentFile.pages.filter(page => page.name === "release/" + CFG.releaseVersion);
  if (matches.length > 1) throw new Error("Release destination page name is ambiguous");
  const owned = CFG.ownerKey ? penpot.currentFile.pages.filter(page => {
    const marker = metadata(page.root, "native-release-copy");
    if (!marker || marker.ownerKey !== CFG.ownerKey) return false;
    releaseMarkers(page);
    return true;
  }) : [];
  if (owned.length > 1) throw new Error("Native copy destination ownership is ambiguous");
  if (owned.length && matches.some(page => page.id !== owned[0].id)) {
    throw new Error("Owned copy destination conflicts with another release page");
  }
  const page = owned[0] || matches[0] || null;
  if (page) releaseMarkers(page);
  return page;
};
const frameSelection = (page, frameIds) => {
  if (!Array.isArray(frameIds) || frameIds.length > 100 || new Set(frameIds).size !== frameIds.length || frameIds.some(id => typeof id !== "string" || !id)) {
    throw new Error("Copy selection requires distinct board IDs within its budget");
  }
  const tree = scan(page);
  const selected = frameIds.map(id => {
    const shape = tree.found.get(id);
    if (!shape || shape.type !== "board") throw new Error("Copy source board is missing or not a board");
    let parentId = tree.parents.get(id);
    while (parentId !== null && parentId !== undefined) {
      if (frameIds.includes(parentId)) throw new Error("Copy source boards overlap");
      parentId = tree.parents.get(parentId);
    }
    return shape;
  });
  if (selected.reduce((total, shape) => total + count(shape), 0) > 20000) {
    throw new Error("Copy selection node budget exceeded");
  }
  return selected;
};
`;

function validateIdentity(fileId: string): void {
  if (typeof fileId !== "string" || !fileId.trim() || fileId.length > 1000) {
    throw new Error("Copy requires a pinned file ID");
  }
}

function validateVersion(releaseVersion: string): void {
  if (
    typeof releaseVersion !== "string" ||
    !/^[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?(?:\+[A-Za-z0-9.-]+)?$/.test(releaseVersion) ||
    releaseVersion.length > 100
  ) {
    throw new Error("Copy requires a bounded release version");
  }
}

export function nativeCopyInspect(
  fileId: string,
  sourcePage: string,
  frameIds: string[],
  releaseVersion: string,
  ownerKey?: string,
): Snippet {
  validateIdentity(fileId);
  validateVersion(releaseVersion);
  if (ownerKey !== undefined && (!ownerKey.trim() || ownerKey.length > 1000)) {
    throw new Error("Copy inspection owner key must be bounded and nonempty");
  }
  if (!sourcePage.trim() || sourcePage.length > 1000 || !frameIds.length) {
    throw new Error("Copy inspection requires a source page and board IDs");
  }
  return snippet(
    "native-copy-inspect",
    `${helpers}
assertFile();
const target = destination();
const sources = penpot.currentFile.pages.filter(page => page.id === CFG.sourcePage || page.name === CFG.sourcePage);
if (sources.length !== 1) throw new Error("Copy source page is missing or ambiguous");
const source = sources[0];
if (target && source.id === target.id) throw new Error("Source and release destination must be different pages");
const selected = frameSelection(source, CFG.frameIds);
let destinationRootIds = [];
let bottom = 0;
let createdPageOwner = null;
if (target) {
  scan(target);
  destinationRootIds = target.root.children.map(shape => shape.id);
  for (const shape of target.root.children) {
    const bounds = geometry(shape);
    bottom = Math.max(bottom, bounds.y + bounds.height);
  }
  createdPageOwner = releaseMarkers(target).copy?.ownerKey || null;
}
return { ok: true, fileId: penpot.currentFile.id, revision: penpot.currentFile.revn,
  sourcePageId: source.id, sourcePageName: source.name,
  destinationPageId: target ? target.id : null, destinationName: "release/" + CFG.releaseVersion,
  destinationNamed: !!target && target.name === "release/" + CFG.releaseVersion,
  destinationRootIds, destinationBounds: { bottom }, sourceFrames: selected.map(geometry),
  createdPageOwner, destinationFinal: false };
`,
    {
      fileId,
      sourcePage,
      frameIds,
      releaseVersion,
      ownerKey,
    },
    "read",
  );
}

export function nativeCopyCreatePage(
  fileId: string,
  releaseVersion: string,
  ownerKey: string,
): Snippet {
  validateIdentity(fileId);
  validateVersion(releaseVersion);
  if (!ownerKey.trim() || ownerKey.length > 1000) {
    throw new Error("Copy page creation requires a bounded owner key");
  }
  return snippet(
    "native-copy-create-page",
    `${helpers}
let target = destination();
const created = !target;
if (!target) {
  if (typeof penpot.createPage !== "function" || typeof penpot.openPage !== "function") {
    throw new Error("Native copy page creation API unavailable");
  }
  target = penpot.createPage();
  await penpot.openPage(target);
  assertFile();
  if (penpot.currentPage.id !== target.id || typeof target.root.setSharedPluginData !== "function") {
    throw new Error("Created copy page identity or metadata API unavailable");
  }
  target.root.setSharedPluginData("penpair", "native-release-copy", JSON.stringify({
    schemaVersion: 1, owner: "penpair", kind: "native-release-copy", fileId: CFG.fileId,
    productVersion: CFG.releaseVersion, ownerKey: CFG.ownerKey, created: true
  }));
} else {
  await penpot.openPage(target);
}
assertFile();
if (penpot.currentPage.id !== target.id) throw new Error("Copy destination did not become active");
if (target.name !== "release/" + CFG.releaseVersion) target.name = "release/" + CFG.releaseVersion;
return { ok: true, fileId: CFG.fileId, pageId: target.id, created };
`,
    {
      fileId,
      releaseVersion,
      ownerKey,
    },
    "write",
  );
}

export function nativeCopySelect(fileId: string, pageId: string, frameIds: string[]): Snippet {
  validateIdentity(fileId);
  return snippet(
    "native-copy-select",
    `${helpers}
assertPage();
penpot.selection = frameSelection(penpot.currentPage, CFG.frameIds);
return { ok: true, fileId: CFG.fileId, pageId: CFG.pageId, selectionIds: penpot.selection.map(shape => shape.id) };
`,
    {
      fileId,
      pageId,
      frameIds,
    },
    "write",
  );
}

/**
 * Penpot pastes into the board under the last pointer position it saw, and the clipboard transport puts the pointer at the middle
 * of the canvas just before it pastes. This moves the viewport so that the middle of the canvas is empty: no board covers it.
 * Clearing the selection alone does not stop a paste from landing inside a board.
 */
export function nativeCopyEmptyCanvas(fileId: string, pageId: string): Snippet {
  validateIdentity(fileId);
  return snippet(
    "native-copy-empty-canvas",
    `${helpers}
assertPage();
const viewport = penpot.viewport;
if (!viewport || !viewport.center || typeof viewport.center.x !== "number") {
  return { ok: true, fileId: CFG.fileId, pageId: CFG.pageId, moved: false, reason: "viewport-unavailable" };
}
scan(penpot.currentPage);
const boards = penpot.currentPage.root.children.map(geometry);
const right = boards.reduce((max, board) => Math.max(max, board.x + board.width), 0);
const top = boards.reduce((min, board) => Math.min(min, board.y), 0);
// Far enough to the right of every board that no frame, whatever its size, lies under the centre.
viewport.center = { x: right + 4000, y: top };
const center = viewport.center;
const covering = penpot.currentPage.root.children.filter(shape => shape.type === "board" && center.x >= shape.x && center.x <= shape.x + shape.width && center.y >= shape.y && center.y <= shape.y + shape.height).map(shape => shape.id);
return { ok: true, fileId: CFG.fileId, pageId: CFG.pageId, moved: true, center: { x: center.x, y: center.y }, covering };
`,
    {
      fileId,
      pageId,
    },
    "write",
  );
}

export interface PastedBoardMatcher {
  name: string;
  width: number;
  height: number;
  nodeCount: number;
}

/** Every board of the page at any depth that has a source board's name, size and node count, with where it sits. */
export function nativeCopyFindBoards(
  fileId: string,
  pageId: string,
  matchers: PastedBoardMatcher[],
): Snippet {
  validateIdentity(fileId);
  if (!matchers.length || matchers.length > 100) {
    throw new Error("Finding pasted boards requires 1–100 source descriptions");
  }
  return snippet(
    "native-copy-find-boards",
    `${helpers}
assertPage();
const tree = scan(penpot.currentPage);
const found = [];
for (const [id, shape] of tree.found) {
  if (shape.type !== "board") continue;
  const matching = CFG.matchers.map((matcher, index) => ({ matcher, index })).filter(({ matcher }) =>
    matcher.name === shape.name && Math.abs(matcher.width - shape.width) < 0.01 && Math.abs(matcher.height - shape.height) < 0.01);
  if (!matching.length) continue;
  const nodes = count(shape);
  const hit = matching.find(({ matcher }) => matcher.nodeCount === nodes);
  if (!hit) continue;
  const parentId = tree.parents.get(id);
  const parent = parentId ? tree.found.get(parentId) : null;
  found.push({ id, name: shape.name, sourceIndex: hit.index, x: shape.x, y: shape.y, width: shape.width, height: shape.height, nodeCount: nodes,
    parentId: parentId === undefined || parentId === null ? null : parentId, parentName: parent ? String(parent.name) : null });
  if (found.length > 500) throw new Error("Too many boards match the pasted sources");
}
return { ok: true, fileId: CFG.fileId, pageId: CFG.pageId, pageRootId: penpot.currentPage.root.id, found };
`,
    {
      fileId,
      pageId,
      matchers,
    },
    "read",
  );
}

export function nativeCopyObserve(fileId: string, pageId: string): Snippet {
  validateIdentity(fileId);
  return snippet(
    "native-copy-observe",
    `${helpers}
assertPage();
const tree = scan(penpot.currentPage);
const rootFrames = penpot.currentPage.root.children.map(shape => {
  const marker = metadata(shape, "native-copy");
  if (marker && (typeof marker.runId !== "string" || !marker.runId)) throw new Error("Malformed copied-board marker");
  return { ...geometry(shape), type: shape.type, copyRunId: marker ? marker.runId : null };
});
if (!Array.isArray(penpot.selection) || penpot.selection.length > 100) throw new Error("Copy selection observation is unavailable");
// A selected shape whose parent is not the page root was pasted inside another board.
const selection = penpot.selection.map(shape => {
  const known = tree.found.has(shape.id);
  const parentId = known ? tree.parents.get(shape.id) : undefined;
  const parent = parentId ? tree.found.get(parentId) : null;
  return { id: shape.id, name: String(shape.name), parentId: known ? (parentId === undefined ? null : parentId) : "unknown", parentName: parent ? String(parent.name) : null };
});
return { ok: true, fileId: CFG.fileId, pageId: CFG.pageId, revision: penpot.currentFile.revn,
  rootIds: rootFrames.map(shape => shape.id), selectionIds: penpot.selection.map(shape => shape.id), selection, rootFrames };
`,
    {
      fileId,
      pageId,
    },
    "read",
  );
}

export function nativeCopyArrange(
  fileId: string,
  pageId: string,
  placements: NativeCopyPlacement[],
  runId: string,
): Snippet {
  validateIdentity(fileId);
  if (
    !runId.trim() ||
    runId.length > 1000 ||
    !placements.length ||
    placements.length > 100 ||
    placements.some(
      (placement) =>
        !placement.id || !Number.isFinite(placement.x) || !Number.isFinite(placement.y),
    ) ||
    new Set(placements.map((placement) => placement.id)).size !== placements.length
  ) {
    throw new Error("Copy arrangement requires distinct boards and finite positions");
  }
  return snippet(
    "native-copy-arrange",
    `${helpers}
assertPage();
const roots = penpot.currentPage.root.children;
if (!Array.isArray(roots) || roots.length > 20000) throw new Error("Copy destination roots are unavailable");
const selected = CFG.placements.map(placement => {
  const matches = roots.filter(shape => shape.id === placement.id && shape.type === "board");
  if (matches.length !== 1) throw new Error("Copied board is missing or no longer a destination root");
  const shape = matches[0];
  const marker = metadata(shape, "native-copy");
  if (marker && (typeof marker.runId !== "string" || !marker.runId || marker.runId.length > 1000)) {
    throw new Error("Copied-board transfer marker is malformed");
  }
  if (typeof shape.setSharedPluginData !== "function") throw new Error("Copied-board marker API unavailable");
  return { shape, placement, marker };
});
for (const { shape, placement, marker } of selected) {
  const provenance = marker && marker.runId === CFG.runId ? marker : {
    runId: CFG.runId,
    ...(marker ? { previousRunId: marker.runId } : {})
  };
  shape.setSharedPluginData("penpair", "native-copy", JSON.stringify(provenance));
  if (shape.x !== placement.x) shape.x = placement.x;
  if (shape.y !== placement.y) shape.y = placement.y;
}
return { ok: true, fileId: CFG.fileId, pageId: CFG.pageId, placements: selected.map(({ shape }) => ({ id: shape.id, x: shape.x, y: shape.y })) };
`,
    {
      fileId,
      pageId,
      placements,
      runId,
    },
    "write",
  );
}
