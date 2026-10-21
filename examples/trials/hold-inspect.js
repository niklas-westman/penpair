// penpair: read
if (penpot.currentFile.id !== CFG.fileId || penpot.currentPage.id !== CFG.pageId) throw new Error("Confirm the owner-authorized scratch file/page IDs");
if (penpot.currentPage.root.children.length !== 0) throw new Error("Use the dedicated empty scratch page for the writer exercise");
if (typeof CFG.marker !== "string" || !CFG.marker) throw new Error("A fresh trial marker is required");
return { ok: true, fileId: penpot.currentFile.id, pageId: penpot.currentPage.id, children: 0 };
