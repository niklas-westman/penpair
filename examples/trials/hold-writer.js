// penpair: write
// penpair: idempotent
const milliseconds = Number(CFG.holdMs);
if (!Number.isInteger(milliseconds) || milliseconds < 1 || milliseconds > 30000) throw new Error("holdMs must be 1–30000");
if (!CFG.inspection || penpot.currentFile.id !== CFG.inspection.fileId || penpot.currentPage.id !== CFG.inspection.pageId || penpot.currentPage.root.children.length !== 0) throw new Error("Scratch source changed before the hold");
if (!CFG.marker) throw new Error("A fresh trial marker is required");
const key = "trial-hold-" + CFG.marker;
const prior = penpot.currentFile.getSharedPluginData("penpair", key);
if (prior) throw new Error("Trial marker already exists; inspect it before recovery");
const record = { schemaVersion: 1, state: "holding", marker: CFG.marker, fileId: CFG.fileId, pageId: CFG.pageId, holdMs: milliseconds };
penpot.currentFile.setSharedPluginData("penpair", key, JSON.stringify(record));
// This deliberate delay opens a controlled contention window. It is not layout settling.
// The operation runner owns the advisory writer lease; this body changes no design objects.
await new Promise(resolve => setTimeout(resolve, milliseconds));
penpot.currentFile.setSharedPluginData("penpair", key, JSON.stringify({ ...record, state: "complete" }));
return { ok: true, heldMilliseconds: milliseconds };
