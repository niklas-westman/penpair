// penpair: read
const matches = penpot.currentPage.root.children.filter(shape => shape.name === CFG.name);
const frame = matches.length === 1 ? matches[0] : null;
return { ok: true, frameId: frame?.id ?? null, verification: {
  expected: { fileId: CFG.fileId, pageId: CFG.pageId, name: CFG.name, marker: CFG.marker, width: 160, height: 80 },
  actual: frame ? { fileId: penpot.currentFile.id, pageId: penpot.currentPage.id, name: frame.name, marker: typeof frame.getSharedPluginData === "function" ? frame.getSharedPluginData("penpair", "trial") : null, width: frame.width, height: frame.height } : { missingOrAmbiguous: true }
} };
