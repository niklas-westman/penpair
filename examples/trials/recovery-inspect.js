// penpair: read
if (penpot.currentFile.id !== CFG.fileId || penpot.currentPage.id !== CFG.pageId) throw new Error("Confirm the authorized scratch file/page IDs");
if (typeof CFG.name !== "string" || !CFG.name || typeof CFG.marker !== "string" || !CFG.marker) throw new Error("A unique trial name and ownership marker are required");
const matches = penpot.currentPage.root.children.filter(shape => shape.name === CFG.name);
if (matches.length > 1) throw new Error("Recovery trial name is ambiguous");
const frame = matches[0];
const marked = penpot.currentPage.root.children.filter(shape => typeof shape.getSharedPluginData === "function" && shape.getSharedPluginData("penpair", "trial") === CFG.marker);
if (marked.length > 1 || (marked.length === 1 && marked[0] !== frame)) throw new Error("Trial ownership marker moved or duplicated; inspect before recovery");
if (frame && (typeof frame.getSharedPluginData !== "function" || frame.getSharedPluginData("penpair", "trial") !== CFG.marker)) throw new Error("Existing frame is not this trial's owned object");
return { ok: true, existingId: frame?.id ?? null, width: frame?.width ?? null, height: frame?.height ?? null, rootIds: penpot.currentPage.root.children.map(shape => shape.id).sort() };
