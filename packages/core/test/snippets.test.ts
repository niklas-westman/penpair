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

  it("refuses a snippet over the size limit", () => {
    expect(() => snippet("big", `return "${"x".repeat(maxSnippetBytes)}";`)).toThrow(/bytes/);
  });
});
