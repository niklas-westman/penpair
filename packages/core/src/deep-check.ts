import { randomBytes } from "node:crypto";
import { executeCode, type ExecuteOptions, type PenpotToolClient } from "./client.js";
import { wrap } from "./snippet.js";

export interface DeepStep {
  step: string;
  ok: boolean;
  ms: number;
  detail: string;
}

export interface DeepReport {
  /** The name every temporary object carried, so a leftover can be found and removed by hand. */
  tag: string;
  penpotVersion?: string;
  steps: DeepStep[];
  /** What the clean-up said about each temporary object. */
  cleanup: string[];
  /** Temporary objects still in the file after the clean-up, found by a separate look. Empty means the file is as it was. */
  leftovers: string[];
  ok: boolean;
}

/**
 * Creates a temporary board off to the side of the open page, then tries what penpair relies on: flex layout, text, a token set
 * and its binding, components and a swap, a clone and a PNG export. Everything it makes carries the tag, and everything is
 * removed again at the end whether or not a step failed. Needs a file the owner is happy to see touched.
 */
export const deepCheckBody = `
const tag = CFG.tag, steps = [], made = { board: null, set: null, comps: [] };
const step = async (name, fn) => {
  const t0 = Date.now();
  try { const detail = await fn(); steps.push({ step: name, ok: true, ms: Date.now() - t0, detail: detail === undefined ? "" : String(detail) }); }
  catch (e) { steps.push({ step: name, ok: false, ms: Date.now() - t0, detail: String(e && e.message || e).slice(0, 160) }); }
};
const page = penpot.currentPage, lib = penpot.library.local;
let right = 0;
for (const c of page.root.children) right = Math.max(right, c.x + c.width);
let board, rect, text;
await step("create board", async () => {
  board = penpot.createBoard(); board.name = tag + "-board"; board.x = right + 1000; board.y = 0; board.resize(320, 200);
  board.fills = [{ fillColor: "#336699", fillOpacity: 1 }]; made.board = board;
  return Math.round(board.width) + "x" + Math.round(board.height);
});
await step("flex layout and children", async () => {
  board.addFlexLayout(); board.flex.dir = "column"; board.flex.rowGap = 8; board.flex.topPadding = 16; board.flex.leftPadding = 16;
  rect = penpot.createRectangle(); rect.name = tag + "-rect"; rect.resize(100, 40); board.appendChild(rect);
  text = penpot.createText("penpair deep check"); if (!text) throw new Error("no text shape was made"); board.appendChild(text);
  if (board.waitForLayoutUpdate) await board.waitForLayoutUpdate();
  return board.children.length + " children, row gap " + board.flex.rowGap;
});
await step("text content", async () => { if (text.characters !== "penpair deep check") throw new Error("the text reads " + JSON.stringify(text.characters)); return "reads back"; });
await step("token set, token and binding", async () => {
  const set = lib.tokens.addSet({ name: tag + "-set" }); made.set = set;
  const wasActive = !!set.active;
  const token = set.addToken({ type: "color", name: tag + "-color", value: "#336699" });
  rect.applyToken(token, ["fill"]);
  // The binding is recorded a few seconds after the call, so wait for it instead of reading it at once.
  const t0 = Date.now();
  while (Date.now() - t0 < 12000 && !(rect.tokens && rect.tokens.fill === token.name)) await new Promise((r) => setTimeout(r, 500));
  if (!rect.tokens || rect.tokens.fill !== token.name) throw new Error("the token was not bound to the fill within 12 s");
  return "bound after " + (Date.now() - t0) + " ms; the new set was " + (wasActive ? "active" : "inactive") + " when made";
});
await step("component and swap", async () => {
  const one = lib.createComponent([rect]); one.name = tag + "-one"; made.comps.push(one);
  const other = penpot.createRectangle(); other.name = tag + "-other"; other.resize(60, 30); board.appendChild(other);
  const two = lib.createComponent([other]); two.name = tag + "-two"; made.comps.push(two);
  const copy = one.instance(); board.appendChild(copy);
  const swapped = copy.swapComponent(two) || copy;
  const now = swapped.component ? swapped.component() : null;
  if (!now || now.id !== two.id) throw new Error("the instance did not switch to the other component");
  return "instance swapped";
});
await step("clone", async () => { const copy = board.clone(); const ok = copy && copy.id !== board.id; if (copy) copy.remove(); if (!ok) throw new Error("no copy was made"); return "ok"; });
await step("export png", async () => { const bytes = await board.export({ type: "png", scale: 1 }); if (!bytes || !bytes.length) throw new Error("the export was empty"); return bytes.length + " bytes"; });
const cleanup = [];
const attempt = (name, fn) => { try { fn(); cleanup.push(name + ": removed"); } catch (e) { cleanup.push(name + ": FAILED " + String(e && e.message || e).slice(0, 100)); } };
for (const c of made.comps) attempt("component " + c.name, () => c.remove());
if (made.set) attempt("token set", () => made.set.remove());
if (made.board) attempt("board", () => made.board.remove());
return { ok: true, tag, penpotVersion: penpot.version, steps, cleanup };`;

/** A separate look, from scratch, for anything the check made and did not remove. */
export const deepLeftoversBody = `
const tag = CFG.tag, left = [];
for (const c of penpot.currentPage.root.children) if (c.name.startsWith(tag)) left.push("board " + c.name);
for (const s of penpot.library.local.tokens.sets) if (s.name.startsWith(tag)) left.push("token set " + s.name);
for (const c of penpot.library.local.components) if (c.name.startsWith(tag)) left.push("component " + c.name);
return { ok: true, readOnly: true, left };`;

export interface DeepOptions extends ExecuteOptions {
  /** Waited between the check and the look for leftovers. */
  settleMs?: number;
}

export async function runDeepCheck(client: PenpotToolClient, options: DeepOptions = {}): Promise<DeepReport> {
  const tag = `penpair-deep-${randomBytes(3).toString("hex")}`;
  const first = (await executeCode(client, wrap(deepCheckBody, { tag }), { ...options, effect: "write" })).result as { ok?: boolean; message?: string; steps?: DeepStep[]; cleanup?: string[]; penpotVersion?: string };
  if (first.ok === false) throw new Error(`the deep check could not run: ${first.message ?? "unknown error"}`);
  await new Promise((resolve) => setTimeout(resolve, options.settleMs ?? 3_000));
  const second = (await executeCode(client, wrap(deepLeftoversBody, { tag }), { ...options, effect: "read" })).result as { left?: string[] };
  const steps = first.steps ?? [];
  const leftovers = second.left ?? [];
  return {
    tag,
    ...(first.penpotVersion ? { penpotVersion: first.penpotVersion } : {}),
    steps,
    cleanup: first.cleanup ?? [],
    leftovers,
    ok: steps.every((s) => s.ok) && leftovers.length === 0,
  };
}

export function formatDeepReport(report: DeepReport): string {
  const lines = report.steps.map((s) => `${s.ok ? "ok  " : "FAIL"} ${s.step} (${s.ms} ms)${s.detail ? `: ${s.detail}` : ""}`);
  lines.push(report.leftovers.length === 0 ? "ok   clean-up: nothing left in the file" : `FAIL clean-up: left in the file, remove by hand: ${report.leftovers.join(", ")}`);
  if (report.penpotVersion) lines.push(`Penpot ${report.penpotVersion}`);
  return lines.join("\n");
}
