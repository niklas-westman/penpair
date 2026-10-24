import { settleLayout } from "./layout-settling.js";

/** Trusted, dependency-free observation source for the Penpot sandbox. */
const layoutObservationSource = String.raw`
const observeLayout = async (penpot, root, options) => {
 if (!Number.isInteger(options.maxNodes === undefined ? 10000 : options.maxNodes) || (options.maxNodes !== undefined && (options.maxNodes < 1 || options.maxNodes > 10000))) throw new Error("Invalid settling node budget");
 const fileId = penpot.currentFile.id, pageId = penpot.currentPage.id;
 const validTarget = () => {
  if (penpot.currentFile.id !== fileId || penpot.currentPage.id !== pageId) throw new Error("Layout target changed while waiting");
  if (root.id !== penpot.currentPage.root.id && typeof penpot.currentPage.getShapeById === "function" && !penpot.currentPage.getShapeById(root.id)) throw new Error("Layout target no longer exists");
 };
 if (!root) throw new Error("layout target does not exist");
 let nativeOutcome = "skipped", nativeError;
 const target = typeof root.waitForLayoutUpdate === "function" ? root : penpot;
 if (options.nativeMs > 0) {
  nativeOutcome = "unsupported";
  if (typeof target.waitForLayoutUpdate === "function") {
   let timer;
   try {
    await Promise.race([target.waitForLayoutUpdate(options.nativeMs), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Native layout attempt timed out")), options.nativeMs); })]);
    nativeOutcome = "completed";
   } catch (error) { nativeOutcome = "failed"; nativeError = String(error && error.message || error); }
   finally { clearTimeout(timer); }
  }
 }
 validTarget();
 // Keep hierarchy and sibling order as well as geometry; repeated IDs include cycles.
 const geometry = [], stack = [[root, null, 0]], seen = new Set();
 while (stack.length) {
  if (geometry.length >= (options.maxNodes || 10000)) throw new Error("Layout sample exceeded node budget");
  const [shape, parent, index] = stack.pop();
  if (!shape || typeof shape.id !== "string" || !shape.id || seen.has(shape.id) || ![shape.x, shape.y, shape.width, shape.height].every(Number.isFinite)) throw new Error("Malformed layout geometry or duplicate IDs");
  seen.add(shape.id);
  geometry.push([shape.id, shape.x, shape.y, shape.width, shape.height, parent, index]);
  const children = shape.children || [];
  if (!Array.isArray(children)) throw new Error("Malformed layout hierarchy");
  if (geometry.length + stack.length + children.length > (options.maxNodes || 10000)) throw new Error("Layout sample exceeded node budget");
  for (let index = children.length - 1; index >= 0; index--) stack.push([children[index], shape.id, index]);
 }
 validTarget();
 return { ok: true, fileId, pageId, native: nativeOutcome === "completed", nativeOutcome, nativeError, geometry, truncated: false };
};
`;

export const layoutPolicySource = `${layoutObservationSource}\nconst settleLayout = ${settleLayout.toString()};`;
