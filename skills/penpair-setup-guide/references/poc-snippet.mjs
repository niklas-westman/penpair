// A starting point for the first POC: a project snippet that adds a small token set and a sign-in board to the open page.
// Copy it into the project (for example snippets/poc-sign-in.mjs), list the folder under "snippets" in penpair.config.json,
// then: `npx penpair run poc-sign-in` (looks only), `npx penpair run poc-sign-in --apply` (writes once, then reads back).
// Safe to run again: whatever already exists is left alone. Everything it makes starts with "POC", so it is easy to find and remove.
// It uses only calls already proven against Penpot 2.18 (boards, flex layout, text, a token set, a component). Binding a value
// to a token has its own traps: read the installed penpair-design skill and its plugin gotchas before you add that.
const page = "penpair POC";
const names = {
  board: "POC / sign-in",
  button: "POC / button",
  set: "POC · Tokens",
};
const colours = {
  surface: "#FFFFFF",
  canvas: "#F4F2EF",
  primary: "#2F5BEA",
  text: "#1D1D1F",
};

export default {
  kind: "write",
  name: "poc-sign-in",
  description: "Add a POC token set and a sign-in board to the page 'penpair POC' (open it first)",
  page,
  inspect: `const top = penpot.currentPage.root.children, lib = penpot.library.local;
return { ok: true, readOnly: true,
  board: top.some((c) => c.name === ${JSON.stringify(names.board)}),
  set: lib.tokens.sets.some((s) => s.name === ${JSON.stringify(names.set)}),
  button: lib.components.some((c) => ((c.path ? c.path + " / " : "") + c.name) === ${JSON.stringify(names.button)}) };`,
  apply: `const top = penpot.currentPage.root.children, lib = penpot.library.local, made = [];
const C = ${JSON.stringify(colours)};
if (!lib.tokens.sets.some((s) => s.name === ${JSON.stringify(names.set)})) {
  const set = lib.tokens.addSet({ name: ${JSON.stringify(names.set)} });
  for (const [key, value] of Object.entries(C)) set.addToken({ type: "color", name: "poc-color-" + key, value });
  made.push("token set " + ${JSON.stringify(names.set)});
}
const column = (b, gap, pad) => { b.addFlexLayout(); b.flex.dir = "column"; b.flex.rowGap = gap; b.flex.topPadding = pad; b.flex.bottomPadding = pad; b.flex.leftPadding = pad; b.flex.rightPadding = pad; };
let button = lib.components.find((c) => ((c.path ? c.path + " / " : "") + c.name) === ${JSON.stringify(names.button)});
if (!button) {
  const b = penpot.createBoard(); b.name = ${JSON.stringify(names.button)}; b.x = 0; b.y = -200; b.resize(160, 44);
  b.fills = [{ fillColor: C.primary, fillOpacity: 1 }]; b.borderRadius = 8;
  b.addFlexLayout(); b.flex.dir = "row"; b.flex.leftPadding = 24; b.flex.topPadding = 12;
  b.appendChild(penpot.createText("Sign in"));
  button = lib.createComponent([b]); made.push("component " + ${JSON.stringify(names.button)});
}
if (!top.some((c) => c.name === ${JSON.stringify(names.board)})) {
  let x = 0; for (const c of top) x = Math.max(x, c.x + c.width + 100);
  const screen = penpot.createBoard(); screen.name = ${JSON.stringify(names.board)}; screen.x = x; screen.y = 0; screen.resize(390, 640);
  screen.fills = [{ fillColor: C.canvas, fillOpacity: 1 }]; column(screen, 24, 32);
  screen.appendChild(penpot.createText("Welcome back"));
  for (const label of ["Email", "Password"]) {
    const field = penpot.createBoard(); field.name = "POC / field / " + label; field.resize(326, 56);
    field.fills = [{ fillColor: C.surface, fillOpacity: 1 }]; field.borderRadius = 8; column(field, 4, 12);
    field.appendChild(penpot.createText(label));
    screen.appendChild(field);
  }
  screen.appendChild(button.instance());
  made.push("board " + ${JSON.stringify(names.board)});
}
return { ok: true, made };`,
  readback: `const top = penpot.currentPage.root.children, lib = penpot.library.local, problems = [];
const board = top.find((c) => c.name === ${JSON.stringify(names.board)});
if (!board) problems.push("missing board " + ${JSON.stringify(names.board)});
else if (board.children.length < 4) problems.push("the board has " + board.children.length + " children, expected 4");
if (!lib.tokens.sets.some((s) => s.name === ${JSON.stringify(names.set)})) problems.push("missing token set");
if (!lib.components.some((c) => ((c.path ? c.path + " / " : "") + c.name) === ${JSON.stringify(names.button)})) problems.push("missing component");
return { ok: true, readOnly: true, problems, boardId: board && board.id };`,
};
