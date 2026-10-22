// penpair: read
const previewInput = () => {
 const preview = JSON.parse(CFG.preview);
 if (preview.schemaVersion !== 1 || preview.kind !== "projected-theme-preview" || preview.nativeBindings !== false || !/^[a-f0-9]{64}$/.test(preview.sourceHash) || !preview.complete || !Array.isArray(preview.resolved) || !Array.isArray(preview.unknowns) || preview.unknowns.length) throw new Error("Complete explicit projected preview required");
 const matches = preview.resolved.filter(token => token.name === CFG.color && token.type === "color");
 if (matches.length !== 1 || typeof matches[0].value !== "string" || !/^#[a-f0-9]{6}$/i.test(matches[0].value)) throw new Error("Example requires one literal opaque hex color");
 const root = penpot.currentPage.getShapeById(CFG.rootId);
 if (!root || !CFG.marker || root.getSharedPluginData("penpair", "owner") !== CFG.marker) throw new Error("Authorized owned scratch root required");
 const preserved = JSON.stringify(Object.fromEntries(Object.entries(root.tokens || {}).filter(([property]) => property !== "fill")));
 const provenance = JSON.stringify({ kind: preview.kind, sourceHash: preview.sourceHash, theme: preview.theme, sets: preview.sets, projectedProperties: { fill: CFG.color }, preservedBindings: preserved, nativeBindings: false });
 return { root, value: matches[0].value, provenance, preserved };
};
