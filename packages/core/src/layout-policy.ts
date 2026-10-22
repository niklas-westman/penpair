/** Trusted, dependency-free sandbox policy shared by the host observer and shipped kit. */
export const layoutPolicySource = String.raw`
const observeLayout = async (penpot, root, options) => {
 if (!Number.isInteger(options.maxNodes === undefined ? 10000 : options.maxNodes) || (options.maxNodes !== undefined && (options.maxNodes < 1 || options.maxNodes > 10000))) throw new Error("Invalid settling node budget");
 const fileId = penpot.currentFile.id, pageId = penpot.currentPage.id;
 const validTarget = () => {
  if (penpot.currentFile.id !== fileId || penpot.currentPage.id !== pageId) throw new Error("Layout target changed while waiting");
  if (root !== penpot.currentPage.root && typeof penpot.currentPage.getShapeById === "function" && !penpot.currentPage.getShapeById(root.id)) throw new Error("Layout target no longer exists");
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
  for (let index = children.length - 1; index >= 0; index--) stack.push([children[index], shape.id, index]);
 }
 validTarget();
 return { ok: true, fileId, pageId, native: nativeOutcome === "completed", nativeOutcome, nativeError, geometry, truncated: false };
};
const settleLayout = async (observe, options) => {
 const { timeoutMs, intervalMs, strategy = "auto", sleep } = options;
 if (!["auto", "native", "geometry"].includes(strategy) || !Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000 || !Number.isFinite(intervalMs) || intervalMs <= 0 || Math.ceil(timeoutMs / intervalMs) + 1 > 1000) throw new Error("Invalid layout strategy or settling budgets");
 const started = Date.now(), deadline = started + timeoutMs;
 let samples = 0, nativeOutcome = "skipped", fallbackReason, identity, previous, equal = 0;
 const result = (stable, method, reason) => ({ stable, method, samples, strategy, nativeOutcome, ...(fallbackReason ? { fallbackReason } : {}), elapsedMs: Date.now() - started, ...(reason ? { reason } : {}) });
 for (let count = 0; count < Math.ceil(timeoutMs / intervalMs) + 1; count++) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) return result(false, "geometry", "Layout observation exceeded its deadline");
  const nativeMs = count === 0 && strategy !== "geometry" ? strategy === "native" ? remaining : Math.max(1, Math.min(500, Math.floor(remaining / 4))) : 0;
  const state = await observe(nativeMs, remaining);
  samples++;
  if (!state || state.ok !== true || !state.fileId || !state.pageId) throw new Error("Layout returned no target identity evidence");
  const nextIdentity = JSON.stringify([state.fileId, state.pageId]);
  if (identity && identity !== nextIdentity) throw new Error("Layout target changed between samples");
  identity = nextIdentity;
  if (state.truncated || !Array.isArray(state.geometry) || !state.geometry.length) throw new Error("Incomplete layout geometry evidence");
  const ids = new Set();
  for (const row of state.geometry) {
   if (!Array.isArray(row) || row.length !== 7 || typeof row[0] !== "string" || !row[0] || ids.has(row[0]) || !row.slice(1,5).every(value => typeof value === "number" && Number.isFinite(value)) ||  ((row[5] !== null && !ids.has(row[5])) || !Number.isInteger(row[6]) || row[6] < 0)) throw new Error("Layout API returned no geometry evidence or malformed hierarchy");
   ids.add(row[0]);
  }
  if (count === 0) {
   nativeOutcome = state.nativeOutcome || (state.native ? state.error ? "failed" : "completed" : strategy === "geometry" ? "skipped" : "unsupported");
   if (Date.now() >= deadline) return result(false, strategy === "native" || state.native ? "native" : "geometry", "Layout observation exceeded its deadline");
   if (nativeOutcome === "completed") return result(true, "native");
   if (strategy === "native") return result(false, "native", state.nativeError || state.error || "Native layout API unavailable");
   if (strategy === "auto") fallbackReason = state.nativeError || state.error || "Native layout API unavailable";
  }
  if (Date.now() >= deadline) return result(false, "geometry", "Layout observation exceeded its deadline");
  const current = JSON.stringify(state.geometry);
  equal = current === previous ? equal + 1 : 1;
  if (equal >= 3) return result(true, "geometry");
  previous = current;
  await sleep(Math.min(intervalMs, Math.max(0, deadline - Date.now())));
 }
 return result(false, "geometry", "Layout did not settle within its bounded samples");
};
`;
