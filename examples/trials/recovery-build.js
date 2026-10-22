// penpair: write
// penpair: idempotent
if (!CFG.inspection || penpot.currentFile.id !== CFG.fileId || penpot.currentPage.id !== CFG.pageId) throw new Error("Scratch identity changed");
if (JSON.stringify(penpot.currentPage.root.children.map(shape => shape.id).sort()) !== JSON.stringify(CFG.inspection.rootIds)) throw new Error("Scratch source changed before the recovery exercise");
if (CFG.inspection.existingId) {
  const frame = penpot.currentPage.getShapeById(CFG.inspection.existingId);
  if (!frame || frame.name !== CFG.name || frame.width !== 160 || frame.height !== 80 || frame.getSharedPluginData("penpair", "trial") !== CFG.marker) throw new Error("Owned frame has an unexplained third state");
  return { ok: true, alreadyBuilt: true, frameId: frame.id };
}
let frame = null, configured = false;
try {
  frame = penpot.createBoard();
  frame.name = CFG.name;
  frame.setSharedPluginData("penpair", "trial", CFG.marker);
  frame.fills = [];
  frame.resize(160, 80);
  configured = true;
} finally {
  if (!configured && frame) frame.remove();
}
// Deliberate fault: the owned write exists, but the normal acknowledgment is not returned.
if (CFG.failAfterWrite === "true") throw new Error("Controlled trial failure after the owned write; inspect before explicit resume");
return { ok: true, frameId: frame.id };
