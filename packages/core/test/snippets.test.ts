import { describe, expect, it } from "vitest";
import { maxSnippetBytes } from "../src/client.js";
import { compiles, snippet, wrap } from "../src/snippet.js";
import { archiveApply, archiveInspect, archiveReadback } from "../src/snippets/archive.js";
import { audit, pages, switchPage, tokensDump, tree } from "../src/snippets/read.js";

const archiveParams = {
  page: "P",
  archiveName: "Archive",
  keepPrefixes: [
    "Live / ",
  ],
  partPrefixes: [
    "Part / ",
  ],
  x: 9000,
};
const all = [
  pages(),
  switchPage("P"),
  tree({
    page: "P",
    depth: 2,
  }),
  audit({
    page: "P",
    framePrefix: "F",
    spacingSteps: [
      0,
      4,
      8,
    ],
    ignoreUnbound: [
      "Part / Divider",
    ],
  }),
  tokensDump(),
  archiveInspect(archiveParams),
  archiveApply(archiveParams),
  archiveReadback(archiveParams),
];

describe("built-in snippets", () => {
  it.each(
    all.map(
      (s) =>
        [
          s.name,
          s,
        ] as const,
    ),
  )("%s is valid plugin code and small enough", (_name, s) => {
    expect(compiles(s.code)).toBeUndefined();
    expect(Buffer.byteLength(s.code)).toBeLessThan(maxSnippetBytes);
  });

  it("names no project or component library", () => {
    for (const s of all) {
      expect(s.code.toLowerCase()).not.toMatch(/sourcer|tradient|marwes/);
    }
  });
});

describe("wrapping", () => {
  it("injects the parameters as CFG and turns an error into a result", () => {
    const code = wrap("return { ok: true, n: CFG.n };", {
      n: 3,
    });
    expect(code).toContain('const CFG = {"n":3};');
    expect(code).toContain("catch (error)");
  });

  it("notices a typo before anything is sent", () => {
    expect(compiles("const x = ;")).toBeDefined();
  });

  it("accepts async function bodies with await and return", () => {
    expect(compiles("const result = await penpot.read(); return result;")).toBeUndefined();
    expect(compiles("return { ok: true }; // trailing comment")).toBeUndefined();
  });

  it("validates source without executing side effects", () => {
    const sentinel = "__penpairSnippetValidationExecuted";

    expect(
      compiles(`globalThis.${sentinel} = true; throw new Error('must not execute');`),
    ).toBeUndefined();
    expect(Reflect.has(globalThis, sentinel)).toBe(false);
  });

  it("rejects syntax outside the async function body", () => {
    expect(compiles("import value from 'module';")).toBeDefined();
    expect(compiles("await ;")).toBeDefined();
    expect(compiles("} function other(){")).toBeDefined();
    expect(compiles("}, async function(){")).toBeDefined();
    expect(
      compiles("}); globalThis.__penpairSnippetValidationExecuted = true; (async function(){"),
    ).toBeDefined();
    expect(Reflect.has(globalThis, "__penpairSnippetValidationExecuted")).toBe(false);
  });

  it("refuses a snippet over the size limit", () => {
    expect(() => snippet("big", `return "${"x".repeat(maxSnippetBytes)}";`)).toThrow(/bytes/);
  });
});
