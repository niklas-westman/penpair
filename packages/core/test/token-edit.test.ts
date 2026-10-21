import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { planTokenEdit, tokenEditOperation, validateTokenEdit, type EditableToken, type TokenEdit } from "../src/token-edit.js";
import { runOperation } from "../src/operation.js";
import { runSnippet } from "../src/snippet.js";
import { runCommand } from "../src/cli-main.js";
import type { PenpotToolClient } from "../src/client.js";
import * as transport from "../src/client.js";
import * as endpoints from "../src/endpoint.js";

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
function fixture() {
  class Token {
    constructor(public name: string, public type: string, public value: unknown, public description: string, private owner: Set) {}
    remove() { this.owner.tokens = this.owner.tokens.filter(t => t !== this); }
  }
  class Set {
    tokens: Token[] = [];
    active = false;
    constructor(public name: string) {}
    addToken(token: EditableToken) { const added = new Token(token.name, token.type, token.value, token.description ?? "", this); this.tokens.push(added); return added; }
  }
  const sets: Set[] = [];
  const catalog = { sets, themes: [], addSet({ name }: { name: string }) { const s = new Set(name); sets.push(s); return s; } };
  const shapes: { id: string; tokens: Record<string, string> }[] = [];
  const page = { id: "p", root: { id: "root", x: 0, y: 0, width: 0, height: 0, children: shapes }, waitForLayoutUpdate: async () => {} };
  const penpot = { library: { local: { tokens: catalog } }, currentFile: { id: "f", name: "Scratch", revn: 1, pages: [page] }, currentPage: page, waitForLayoutUpdate: async () => {} };
  let lost = false;
  let writes = 0;
  const client: PenpotToolClient = { async callTool(_name, args) {
    const code = String(args.code);
    const result = await new AsyncFunction("penpot", code)(penpot);
    if (code.includes('"tokens-edit-apply"') || code.includes("const canonical=")) { writes++; if (lost) { lost = false; throw new Error("lost response"); } }
    return { text: JSON.stringify({ result, log: "" }), isError: false };
  }, async close() {} };
  return { client, sets, catalog, shapes, get writes() { return writes; }, loseNextWrite() { lost = true; } };
}
const radius: EditableToken = { name: "radius", type: "borderRadius", value: "8", description: "Project radius" };
afterEach(() => vi.restoreAllMocks());
describe("guarded token CRUD", () => {
  it("inspects without writing, creates inactive sets, sets values and copies without removing the source", async () => {
    const f = fixture();
    expect((await runOperation(f.client, tokenEditOperation, { kind: "add-set", set: "Project" })).phase).toBe("inspected");
    expect(f.sets).toHaveLength(0);
    const edits: TokenEdit[] = [{ kind: "add-set", set: "Project" }, { kind: "set", set: "Project", token: radius }, { kind: "add-set", set: "Shared" }, { kind: "promote", set: "Project", to: "Shared" }];
    for (const edit of edits) expect((await runOperation(f.client, tokenEditOperation, edit, { apply: true, layout: false })).verified).toBe(true);
    expect(f.sets.map(s => [s.name, s.active, s.tokens.length])).toEqual([["Project", false, 1], ["Shared", false, 1]]);
    for (const edit of edits) expect((await runOperation(f.client, tokenEditOperation, edit, { apply: true, layout: false })).verified).toBe(true);
    expect(f.sets.map(s => s.tokens.length)).toEqual([1, 1]);
  });
  it("refuses referenced, bound, conflicting or type-replacing edits before mutation", async () => {
    const f = fixture();
    const source = f.catalog.addSet({ name: "Project" }); source.addToken(radius);
    const other = f.catalog.addSet({ name: "Other" }); other.addToken({ ...radius, name: "alias", value: "{radius} * 2" });
    const remove: TokenEdit = { kind: "remove", set: "Project", name: "radius" };
    await expect(runOperation(f.client, tokenEditOperation, remove, { apply: true, layout: false })).rejects.toThrow(/Retained reference/);
    other.tokens = [];
    f.shapes.push({ id: "shape", tokens: { radius: "radius" } });
    await expect(runOperation(f.client, tokenEditOperation, remove, { apply: true, layout: false })).rejects.toThrow(/bound/);
    f.shapes.length = 0; other.addToken({ ...radius, value: "12" });
    await expect(runOperation(f.client, tokenEditOperation, { kind: "promote", set: "Project", to: "Other" }, { apply: true, layout: false })).rejects.toThrow(/conflicts/);
    await expect(runOperation(f.client, tokenEditOperation, { kind: "set", set: "Project", token: { ...radius, type: "spacing" } }, { apply: true, layout: false })).rejects.toThrow(/Type replacement/);
    expect(f.writes).toBe(0);
    expect((await runOperation(f.client, tokenEditOperation, remove, { apply: true, layout: false })).verified).toBe(true);
  });
  it("checks source content again inside the delivered write", async () => {
    const f = fixture(); const set = f.catalog.addSet({ name: "Project" }); set.addToken(radius);
    const edit: TokenEdit = { kind: "set", set: "Project", token: { ...radius, value: "10" } };
    const inspected = await runSnippet(f.client, tokenEditOperation.inspect(edit), { effect: "read" });
    set.tokens[0]!.value = "designer edit";
    await expect(runSnippet(f.client, tokenEditOperation.apply(edit, inspected), { effect: "write" })).rejects.toThrow(/Token source changed/);
    expect(set.tokens[0]!.value).toBe("designer edit");
  });
  it("does not claim verification when the API silently ignores a write", async () => {
    const f = fixture(); f.catalog.addSet = () => ({}) as ReturnType<typeof f.catalog.addSet>;
    const report = await runOperation(f.client, tokenEditOperation, { kind: "add-set", set: "Project" }, { apply: true, layout: false });
    expect(report).toMatchObject({ verified: false, outcome: "failed" });
  });
  it("reconciles an applied token after lost acknowledgment without re-delivering the edit", async () => {
    const f = fixture(); f.catalog.addSet({ name: "Project" });
    const root = await mkdtemp(path.join(os.tmpdir(), "penpair-token-recovery-"));
    const edit: TokenEdit = { kind: "set", set: "Project", token: radius };
    f.loseNextWrite();
    await expect(runOperation(f.client, tokenEditOperation, edit, { apply: true, layout: false, journal: { root } })).rejects.toThrow();
    const files = await readdir(path.join(root, ".penpair/runs"));
    const record = JSON.parse(await readFile(path.join(root, ".penpair/runs", files.find(file => file.endsWith(".json"))!), "utf8"));
    const report = await runOperation(f.client, tokenEditOperation, edit, { apply: true, layout: false, journal: { root, runId: record.runId, resume: true } });
    expect(report.verified).toBe(true); expect(f.writes).toBe(1); expect(f.sets[0]!.tokens).toHaveLength(1);
  });
  it("keeps redacted journal evidence incomplete even after a confirmed mutation", async () => {
    const f = fixture(); f.catalog.addSet({ name: "Project" });
    const root = await mkdtemp(path.join(os.tmpdir(), "penpair-token-redaction-"));
    const report = await runOperation(f.client, tokenEditOperation, { kind: "set", set: "Project", token: { ...radius, description: "SENSITIVE" } }, { apply: true, layout: false, journal: { root, redact: value => value.replaceAll("SENSITIVE", "[REDACTED]") } });
    expect(report).toMatchObject({ complete: false, redacted: true, verified: false });
    expect(JSON.stringify(report)).not.toContain("SENSITIVE");
  });
  it("rejects invalid CLI input before connecting and runs the guarded service for configured writes", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "penpair-token-cli-"));
    await writeFile(path.join(root, "penpair.config.json"), JSON.stringify({ instance: "demo", profile: { type: "external", origin: "https://example.test" }, file: { id: "f" } }));
    vi.spyOn(process, "cwd").mockReturnValue(root);
    const f = fixture(); const connect = vi.spyOn(transport, "connect").mockResolvedValue(f.client);
    vi.spyOn(endpoints, "resolveEndpoint").mockResolvedValue({ url: "https://example.test/mcp", description: { source: "env", origin: "https://example.test", pathname: "/mcp" } });
    expect((await runCommand(["tokens", "set", "Project", "radius", "--type", "borderRadius", "--value", "null"])).exitCode).toBe(1);
    expect(connect).not.toHaveBeenCalled();
    const report = await runCommand(["tokens", "add-set", "Project", "--apply"]);
    expect(report.exitCode).toBe(0); expect(f.sets[0]!.name).toBe("Project");
    const editArgs = ["tokens", "set", "Project", "radius", "--type", "borderRadius", "--value", '"8"', "--apply"];
    f.loseNextWrite();
    const lost = await runCommand(editArgs); expect(lost.exitCode).toBe(4);
    expect(lost.runId).toBeTruthy();
    expect((await runCommand([...editArgs, "--resume", lost.runId!])).exitCode).toBe(0);
  });
  it("rejects duplicates and malformed values while preserving structured token data", () => {
    expect(() => validateTokenEdit({ kind: "set", set: "P", token: { ...radius, type: "unknown" } })).toThrow(/type/);
    expect(() => validateTokenEdit({ kind: "promote", set: "P", to: "P" })).toThrow(/distinct/);
    expect(() => planTokenEdit({ sets: [{ name: "P", active: false, tokens: [radius, radius] }], themes: [], bindings: [] }, { kind: "remove", set: "P", name: "radius" })).toThrow(/Ambiguous/);
  });
});
