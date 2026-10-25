import { settleLayout } from "./layout-settling.js";

/** Trusted, dependency-free observation source for the Penpot sandbox. */
const layoutObservationSource = String.raw`
const observeLayout = async (penpot, root, options) => {
 if (!Number.isInteger(options.maxNodes === undefined ? 10000 : options.maxNodes) || (options.maxNodes !== undefined && (options.maxNodes < 1 || options.maxNodes > 100000))) throw new Error("Invalid settling node budget");
 const roots = Array.isArray(root) ? root : [root];
 if (!roots.length || roots.some(shape => !shape)) throw new Error("layout target does not exist");
 const fileId = penpot.currentFile.id, pageId = penpot.currentPage.id;
 const validTarget = () => {
  if (penpot.currentFile.id !== fileId || penpot.currentPage.id !== pageId) throw new Error("Layout target changed while waiting");
  for (const shape of roots) {
   if (shape.id !== penpot.currentPage.root.id && typeof penpot.currentPage.getShapeById === "function" && !penpot.currentPage.getShapeById(shape.id)) throw new Error("Layout target no longer exists");
  }
 };

 let nativeOutcome = "skipped", nativeError;
 validTarget();
 const nativeTargets = roots.every(shape => typeof shape.waitForLayoutUpdate === "function") ? roots : [penpot];
 if (options.nativeMs > 0) {
  nativeOutcome = "unsupported";
  if (nativeTargets.every(target => typeof target.waitForLayoutUpdate === "function")) {
   let timer;
   try {
    await Promise.race([Promise.all(nativeTargets.map(target => target.waitForLayoutUpdate(options.nativeMs))), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Native layout attempt timed out")), options.nativeMs); })]);
    nativeOutcome = "completed";
   } catch (error) { nativeOutcome = "failed"; nativeError = String(error && error.message || error); }
   finally { clearTimeout(timer); }
  }
 }
 validTarget();
 // Keep hierarchy and sibling order as well as geometry; repeated IDs include cycles.
 const geometry = [], stack = roots.map(shape => [shape, null, 0]).reverse(), seen = new Set();
 let truncated = false;
 while (stack.length) {
  if (geometry.length >= (options.maxNodes || 10000)) { truncated = true; break; }
  const [shape, parent, index] = stack.pop();
  if (!shape || typeof shape.id !== "string" || !shape.id || seen.has(shape.id) || ![shape.x, shape.y, shape.width, shape.height].every(Number.isFinite)) throw new Error("Malformed layout geometry or duplicate IDs");
  seen.add(shape.id);
  geometry.push([shape.id, shape.x, shape.y, shape.width, shape.height, parent, index]);
  const children = shape.children || [];
  if (!Array.isArray(children)) throw new Error("Malformed layout hierarchy");
  const available = (options.maxNodes || 10000) - geometry.length;
  if (stack.length + children.length > available) truncated = true;
  // Only retain the bounded depth-first prefix; avoid allocating a page-sized traversal stack.
  if (children.length >= available) stack.length = 0;
  else if (stack.length > available - children.length) stack.splice(0, stack.length - (available - children.length));
  for (let index = Math.min(children.length, available) - 1; index >= 0; index--) stack.push([children[index], shape.id, index]);
 }
 validTarget();
 return { ok: true, fileId, pageId, native: nativeOutcome === "completed", nativeOutcome, nativeError, geometry, rootIds: roots.map(shape => shape.id), truncated };
};
`;

export const layoutPolicySource = `${layoutObservationSource}\nconst settleLayout = ${settleLayout.toString()};`;
