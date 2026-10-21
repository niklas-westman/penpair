import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { buildDesignSpec, checkDesignSpec, renderDesignSpec, validateDesignInspection, type ComponentMap } from "../src/design-spec.js";
import type { InspectionDocument } from "../src/inspection.js";
const load = async () => JSON.parse(await readFile(new URL("fixtures/spec/inspection.json", import.meta.url), "utf8")) as InspectionDocument;
const map: ComponentMap = { schemaVersion: 1, components: [{ libraryId: "library", componentId: "card-id", codeComponent: "Card", props: { tone: "neutral" }, textProps: { title: "title" } }] };
describe("derived design handoff", () => {
 it("renders recorded structure and literal hostile text with explicit mapping and unknown semantics", async () => {
   const source = await load(), spec = buildDesignSpec(source, map), markdown = renderDesignSpec(spec);
   expect(spec.nodes[0]!.hint).toEqual({ codeComponent: "Card", props: { tone: "neutral", title: "Revenue: <script>no()</script>\n```" } });
   expect(spec.unknowns.join(" ")).toMatch(/not inferred/);
   await expect(markdown).toMatchFileSnapshot("fixtures/spec/handoff.md");
   expect(checkDesignSpec(markdown, source, map).current).toBe(true);
   expect(checkDesignSpec(markdown + "manual edit", source, map).current).toBe(false);
   source.revision++;
   expect(checkDesignSpec(markdown, source, map).current).toBe(false);
 });
 it("refuses partial/missing/disconnected structure and ambiguous mappings", async () => {
   const source = await load();
   expect(() => buildDesignSpec({ ...source, complete: false }, map)).toThrow(/complete/);
   expect(() => buildDesignSpec({ ...source, nodes: source.nodes!.slice(0, 1) }, map)).toThrow(/hierarchy/);
   expect(() => buildDesignSpec(source, { ...map, components: [...map.components, ...map.components] })).toThrow(/Ambiguous/);
   const hostile = structuredClone(source); hostile.nodes![0]!.name = "\u202e";
   expect(renderDesignSpec(buildDesignSpec(hostile))).toContain('\\u202e');
   const cyclic = structuredClone(source); cyclic.nodes![1]!.childIds = ["title"]; cyclic.nodes![1]!.childrenTotal = 1;
   expect(() => validateDesignInspection(cyclic)).toThrow();
 });
 it("does not infer mappings from a familiar name or borrow another instance's text overrides", async () => {
   const source = await load();
   expect(buildDesignSpec(source).nodes[0]!.unknowns).toContain("unmapped-component");
   const explicit = { ...map, components: [{ ...map.components[0]!, textProps: { title: "frame" } }] };
   expect(buildDesignSpec(source, explicit).nodes[0]!.unknowns).toContain("unresolved-text-prop:title");
 });
});
