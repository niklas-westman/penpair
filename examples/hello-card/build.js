// penpair: write
// penpair: idempotent
const observation = inspectHelloExample();
if (!CFG.inspection || JSON.stringify(observation.rootIds) !== JSON.stringify(CFG.inspection.rootIds)) throw new Error("Page source changed before creating the example");
if (observation.satisfied) return { ok: true, alreadyBuilt: true, rootId: observation.id };
if (observation.id) throw new Error("Existing example needs a separate reviewed edit");
let root = null, built = false;
try {
  root = penpot.createBoard();
  root.name = CFG.name;
  root.setSharedPluginData("penpair", "example", CFG.marker);
  root.fills = [];
  root.resize(300, 180);
  pp.recipe("hello-card", root, {
    box: { name: "Hello card", w: 240, gap: CFG.space, pad: [CFG.space, CFG.space, CFG.space, CFG.space], stroke: CFG.color, radius: CFG.radius },
    text: { typo: CFG.typo, color: CFG.color },
    label: "Hello, card",
  });
  await pp.flush({ root });
  built = true;
  return { ok: true, rootId: root.id };
} finally {
  if (!built && root) root.remove();
}
