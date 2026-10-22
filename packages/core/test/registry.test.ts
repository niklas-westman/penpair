import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { PenpotToolClient } from "../src/client.js";
import { checkProjectSnippets, loadProjectSnippets } from "../src/project-snippets.js";
import { builtInRegistry, coerceParams, defineSnippet, normalize, RegistryError, SnippetRegistry, type ParamSpec } from "../src/registry.js";
import { maxSnippetBytes } from "../src/client.js";

const reply = (result: unknown) => ({ text: JSON.stringify({ result, log: "" }), isError: false });
function editor(answer: (code: string) => unknown): PenpotToolClient & { codes: string[] } {
  const codes: string[] = [];
  return {
    codes,
    async callTool(_name, args) {
      codes.push(String(args.code));
      if (String(args.code).includes("const geometry = [], stack")) return reply({ok:true,fileId:"file",pageId:"page",native:true,geometry:[["root",0,0,10,10,null,0]],truncated:false});
      return reply(answer(String(args.code)));
    },
    async close() {},
  };
}

const readDef = defineSnippet({ kind: "read", name: "list-boards", description: "Lists boards", page: "Home", params: [{ name: "limit", type: "number", default: 5 }], body: "return { ok: true, names: penpot.currentPage.root.children.slice(0, CFG.limit).map((c) => c.name) };" });

describe("defining snippets", () => {
  it("accepts a read and a write definition", () => {
    expect(normalize(readDef, "project")).toMatchObject({ kind: "read", name: "list-boards", source: "project" });
    const write = normalize({ kind: "write", name: "rename-all", description: "x", inspect: "return {ok:true};", apply: "return {ok:true};", readback: "return {ok:true, problems: []};" }, "project");
    expect(write.kind).toBe("write");
  });

  it.each([
    [{ ...readDef, name: "Bad Name" }, /name must be/],
    [{ ...readDef, description: " " }, /description/],
    [{ ...readDef, params: [{ name: "a", type: "map" as never }] }, /unknown type/],
    [{ ...readDef, params: [{ name: "a", type: "string" as const }, { name: "a", type: "number" as const }] }, /twice/],
    [{ kind: "write", name: "x", description: "d", inspect: "1", apply: "1" } as never, /needs readback/],
    [{ kind: "other", name: "x", description: "d" } as never, /kind must be/],
  ])("rejects %#", (definition, message) => {
    expect(() => normalize(definition, "project")).toThrow(message);
  });
});

describe("parameters", () => {
  const specs: ParamSpec[] = [
    { name: "page", type: "string", required: true },
    { name: "depth", type: "number", default: 3 },
    { name: "flag", type: "boolean" },
    { name: "names", type: "string[]" },
    { name: "steps", type: "number[]" },
  ];
  it("are converted to their declared types, with defaults", () => {
    expect(coerceParams(specs, { page: "P", flag: "true", names: "a, b", steps: "0,4,8" })).toEqual({ page: "P", depth: 3, flag: true, names: ["a", "b"], steps: [0, 4, 8] });
  });
  it("refuse a missing required one, an unknown one and a wrong type", () => {
    expect(() => coerceParams(specs, {})).toThrow(/page is required/);
    expect(() => coerceParams(specs, { page: "P", extra: "1" })).toThrow(/unknown parameter extra/);
    expect(() => coerceParams(specs, { page: "P", depth: "deep" })).toThrow(/must be a number/);
    expect(() => coerceParams(specs, { page: "P", flag: "yes" })).toThrow(/true or false/);
  });
});

describe("the registry", () => {
  it("holds the built-in snippets and refuses a duplicate name", () => {
    const registry = builtInRegistry();
    expect(registry.list().map((e) => e.name)).toEqual(["archive", "audit", "pages", "tokens-dump", "tree"]);
    expect(() => registry.register({ ...readDef, name: "pages" })).toThrow(/already registered \(built-in\)/);
    expect(() => registry.get("nope")).toThrow(/Known: archive/);
  });

  it("runs a read snippet with its parameters and guards the page", async () => {
    const registry = new SnippetRegistry();
    registry.register(readDef);
    const client = editor(() => ({ ok: true, names: ["a"] }));
    const result = await registry.run(client, "list-boards", { limit: 2 });
    expect(result).toMatchObject({ ok: true });
    expect(client.codes[0]).toContain('"limit":2');
    expect(client.codes[0]).toContain('"page":"Home"');
    expect(client.codes[0]).toContain("wrongPage");
  });

  it("only looks at a write snippet unless told to apply, then compares explicit observations", async () => {
    const registry = new SnippetRegistry();
    registry.register({ kind: "write", name: "tidy", description: "d", inspect: "return {ok:true, willChange: 2};", apply: "return {ok:true, changed: 2};", readback: "return {ok:true, verification: { expected: {count:2}, actual: {count: penpot.currentPage.root.children.length} }};" });
    const calls = editor((code) => (code.includes("willChange") ? { ok: true, willChange: 2 } : code.includes("changed:") ? { ok: true, changed: 2 } : { ok: true, verification: { expected: { count: 2 }, actual: { count: 2 } } }));
    const inspected = (await registry.run(calls, "tidy", {}, { sleep: async () => undefined })) as { phase: string };
    expect(inspected.phase).toBe("inspected");
    expect(calls.codes).toHaveLength(1);
    const applied = (await registry.run(calls, "tidy", {}, { apply: true, settleMs: 0, sleep: async () => undefined })) as { phase: string; verified: boolean };
    expect(applied).toMatchObject({ phase: "applied", verified: true });
    const bad = editor((code) => (code.includes("changed:") ? { ok: true } : code.includes("willChange") ? { ok: true } : { ok: true, problems: ["still untidy"] }));
    const failed = (await registry.run(bad, "tidy", {}, { apply: true, settleMs: 0, sleep: async () => undefined })) as { verified: boolean; problems: string[] };
    expect(failed).toMatchObject({ verified: false, problems: ["still untidy"] });
  });
});

async function project(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "penpair-snippets-"));
  for (const [name, text] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await writeFile(path.join(root, name), text);
  }
  return root;
}
const good = `export default { kind: "read", name: "from-project", description: "mine", body: "return { ok: true };" };`;

describe("loading a project's snippets", () => {
  it("loads a file, a folder, and a list of definitions", async () => {
    const root = await project({
      "one.mjs": good,
      "dir/a.mjs": `export default [{ kind: "read", name: "a-one", description: "d", body: "return {ok:true};" }, { kind: "read", name: "a-two", description: "d", body: "return {ok:true};" }];`,
      "dir/notes.txt": "ignored",
    });
    const registry = builtInRegistry();
    const report = await loadProjectSnippets(root, ["one.mjs", "dir"], registry);
    expect(report.problems).toEqual([]);
    expect(report.files).toEqual(["one.mjs", path.join("dir", "a.mjs")]);
    expect(registry.list().filter((e) => e.source === "project").map((e) => e.name)).toEqual(["a-one", "a-two", "from-project"]);
  });

  it("reports a broken file and still loads the rest", async () => {
    const root = await project({
      "good.mjs": good,
      "syntax.mjs": "export default {",
      "none.mjs": "export const x = 1;",
      "dup.mjs": `export default { kind: "read", name: "pages", description: "d", body: "return {ok:true};" };`,
    });
    const registry = builtInRegistry();
    const report = await loadProjectSnippets(root, ["good.mjs", "syntax.mjs", "none.mjs", "dup.mjs", "missing.mjs"], registry);
    expect(report.problems.join("\n")).toMatch(/syntax\.mjs: could not be loaded/);
    expect(report.problems.join("\n")).toMatch(/none\.mjs: has no default export/);
    expect(report.problems.join("\n")).toMatch(/dup\.mjs: .*already registered/);
    expect(report.problems.join("\n")).toMatch(/missing\.mjs does not exist/);
    expect(registry.get("from-project").source).toBe("project");
  });
});

describe("checking project snippets without a connection", () => {
  it("finds code that does not parse and code that is too big, and passes good code", async () => {
    const root = await project({
      "ok.mjs": good,
      "typo.mjs": `export default { kind: "read", name: "typo", description: "d", body: "const x = ;" };`,
      "big.mjs": `export default { kind: "read", name: "big", description: "d", body: "return '" + "x".repeat(${maxSnippetBytes}) + "';" };`,
    });
    const registry = builtInRegistry();
    await loadProjectSnippets(root, ["ok.mjs", "typo.mjs", "big.mjs"], registry);
    const problems = checkProjectSnippets(registry).join("\n");
    expect(problems).toMatch(/typo: /);
    expect(problems).toMatch(/big: .*bytes/);
    expect(problems).not.toMatch(/from-project/);
  });
});
