// penpair: write
// penpair: idempotent
const input = previewInput();
if (!CFG.inspection || CFG.inspection.rootId !== input.root.id || CFG.inspection.provenance !== input.provenance || CFG.inspection.preserved !== input.preserved) throw new Error("Projection inputs or preserved bindings changed since inspection");
const fills = [{ fillColor: input.value, fillOpacity: 1 }];
if (JSON.stringify(input.root.fills) !== JSON.stringify(fills)) input.root.fills = fills;
if (input.root.getSharedPluginData("penpair", "projection") !== input.provenance) input.root.setSharedPluginData("penpair", "projection", input.provenance);
return {ok:true,rootId:input.root.id};
