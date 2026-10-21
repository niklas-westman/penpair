// penpair: read
const raw = penpot.currentFile.getSharedPluginData("penpair", "trial-hold-" + CFG.marker);
let record = null;
try { record = raw ? JSON.parse(raw) : null; } catch {}
return { ok: true, verification: {
  expected: { fileId: CFG.fileId, pageId: CFG.pageId, children: 0, marker: CFG.marker, holdMs: Number(CFG.holdMs), state: "complete" },
  actual: { fileId: penpot.currentFile.id, pageId: penpot.currentPage.id, children: penpot.currentPage.root.children.length, marker: record?.marker ?? null, holdMs: record?.holdMs ?? null, state: record?.state ?? null }
} };
