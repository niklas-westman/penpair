// penpair: read
function inspectHelloExample() {
  for (const key of ["name", "marker", "typo", "color", "space", "radius"]) {
    if (typeof CFG[key] !== "string" || !CFG[key]) throw new Error("Required example parameter: " + key);
  }
  const roots = penpot.currentPage.root.children.filter(shape => shape.name === CFG.name);
  if (roots.length > 1) throw new Error("Example root name is ambiguous");
  const expected = { name: CFG.name, marker: CFG.marker, title: "Hello, card", typo: CFG.typo, color: CFG.color, space: CFG.space, radius: CFG.radius, count: 3 };
  const root = roots[0];
  const owned = penpot.currentPage.root.children.filter(shape => typeof shape.getSharedPluginData === "function" && shape.getSharedPluginData("penpair", "example") === CFG.marker);
  if (owned.length > 1 || owned.length === 1 && owned[0] !== root) throw new Error("The owned marker moved or became ambiguous; inspect it before creating another example");
  if (!root) return { expected, actual: { missing: true }, id: null, satisfied: false, rootIds: penpot.currentPage.root.children.map(shape => shape.id).sort() };
  if (typeof root.getSharedPluginData !== "function" || root.getSharedPluginData("penpair", "example") !== CFG.marker) throw new Error("Existing root is not owned by this example marker");
  const nodes = [], stack = [root], seen = new Set();
  while (stack.length) {
    if (nodes.length >= 20) throw new Error("Example subtree is unexpectedly large");
    const shape = stack.pop();
    if (!shape.id || seen.has(shape.id)) throw new Error("Invalid example identity");
    seen.add(shape.id); nodes.push(shape);
    for (const child of shape.children || []) stack.push(child);
  }
  const cards = nodes.filter(shape => shape.type === "board" && shape.name === "Hello card");
  const texts = nodes.filter(shape => shape.type === "text");
  const card = cards.length === 1 ? cards[0] : null, text = texts.length === 1 ? texts[0] : null;
  const actual = { name: root.name, marker: root.getSharedPluginData("penpair", "example"), title: text?.characters ?? null, typo: text?.tokens?.typography ?? null, color: text?.tokens?.fill ?? null, space: card?.tokens?.rowGap ?? null, radius: card?.tokens?.borderRadiusTopLeft ?? null, count: nodes.length };
  return { expected, actual, id: root.id, satisfied: JSON.stringify(expected) === JSON.stringify(actual), rootIds: penpot.currentPage.root.children.map(shape => shape.id).sort() };
}
