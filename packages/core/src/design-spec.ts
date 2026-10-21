import { mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import type { InspectionDocument } from "./inspection.js";
import { designDataBlock, resolveProjectInput, resolveProjectOutput } from "./project-input.js";
import { atomicWriteFile } from "./atomic-output.js";
import { observationHash } from "./journal.js";

export interface ComponentMapEntry { libraryId: string; componentId: string; codeComponent: string; props?: Record<string, string | number | boolean | null>; textProps?: Record<string, string> }
export interface ComponentMap { schemaVersion: 1; components: ComponentMapEntry[] }
export interface DesignSpec {
  schemaVersion: 1; kind: "design-spec"; source: { fileId: string; pageId: string; revision: number; frameId: string; sha256: string };
  mappingHash: string; nodes: Array<{ id: string; evidence: Record<string, unknown>; hint: { codeComponent: string; props: Record<string, unknown> } | null; unknowns: string[] }>;
  unknowns: string[];
}
export const emptyComponentMap: ComponentMap = { schemaVersion: 1, components: [] };
export async function readDesignJson(root: string, file: string, maxBytes = 16 * 1024 * 1024): Promise<unknown> {
  const input = await resolveProjectInput(root, file);
  if ((await stat(input)).size > maxBytes) throw new Error("Design artifact exceeds the input byte budget");
  return JSON.parse(await readFile(input, "utf8"));
}
export function validateComponentMap(raw: unknown): ComponentMap {
  const v = raw as ComponentMap;
  if (!v || v.schemaVersion !== 1 || !Array.isArray(v.components) || v.components.length > 1000) throw new Error("Unsupported component-map schema");
  const seen = new Set<string>();
  for (const c of v.components) {
    if (!c || typeof c.libraryId !== "string" || !c.libraryId || typeof c.componentId !== "string" || !c.componentId || !/^[A-Z][A-Za-z0-9]*(?:\.[A-Z][A-Za-z0-9]*)*$/.test(c.codeComponent)) throw new Error("Mappings require explicit library/component IDs and an identifier codeComponent");
    const id = JSON.stringify([c.libraryId, c.componentId]); if (seen.has(id)) throw new Error("Ambiguous component mapping"); seen.add(id);
    for (const [key, value] of Object.entries(c.props ?? {})) if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(key) || !["string", "number", "boolean"].includes(typeof value) && value !== null || typeof value === "number" && !Number.isFinite(value)) throw new Error("Mapping props must be literal scalar data");
    for (const [key, value] of Object.entries(c.textProps ?? {})) if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(key) || typeof value !== "string" || !value) throw new Error("textProps map prop names to explicit descendant node IDs");
  }
  return structuredClone(v);
}
/** A complete single-root tree is required; no missing descendant may quietly disappear from the handoff. */
export function validateDesignInspection(raw: unknown): InspectionDocument & { nodes: Record<string, unknown>[] } {
  const v = raw as InspectionDocument;
  if (!v || v.schemaVersion !== 1 || v.kind !== "shape-inspection" || v.complete !== true || v.redacted === true || typeof v.fileId !== "string" || !v.fileId || typeof v.pageId !== "string" || !v.pageId || !Number.isInteger(v.revision) || !Array.isArray(v.nodes) || !v.nodes.length || v.nodes.length > 50000 || !Array.isArray(v.reasons) || v.reasons.length) throw new Error("A complete unredacted schema-1 shape inspection is required");
  const nodes = v.nodes;
  const byId = new Map(nodes.map(n => [n.id, n]));
  if (byId.size !== nodes.length) throw new Error("Duplicate design node identity");
  let roots = 0;
  for (const n of nodes) {
    if (typeof n.id !== "string" || !n.id || !Array.isArray(n.childIds) || n.childIds.length !== n.childrenTotal || !Number.isInteger(n.index) || Number(n.index) < 0) throw new Error("Invalid design node identity/hierarchy");
    if (n.parentId === null) roots++; else if (typeof n.parentId !== "string" || !byId.has(n.parentId)) throw new Error("Missing design parent");
    for (const [index, childId] of n.childIds.entries()) { const child = byId.get(childId); if (!child || child.parentId !== n.id || child.index !== index) throw new Error("Incomplete or inconsistent design hierarchy"); }
    if (n.parentId !== null && (byId.get(n.parentId)?.childIds as unknown[])[Number(n.index)] !== n.id) throw new Error("Unlinked design node");
  }
  if (roots !== 1) throw new Error("Design capture must have one root");
  const seen = new Set<unknown>(), stack = [nodes.find(n => n.parentId === null)!];
  while (stack.length) { const n = stack.pop()!; if (seen.has(n.id)) throw new Error("Design hierarchy cycle"); seen.add(n.id); stack.push(...(n.childIds as string[]).map(id => byId.get(id)!)); }
  if (seen.size !== nodes.length) throw new Error("Disconnected design nodes");
  return v as InspectionDocument & { nodes: Record<string, unknown>[] };
}
export function designSource(inspection: InspectionDocument) {
  const v = validateDesignInspection(inspection);
  const nodes = [...v.nodes].sort((a, b) => String(a.id).localeCompare(String(b.id), "en"));
  return { fileId: v.fileId, pageId: v.pageId!, revision: v.revision, frameId: String(nodes.find(n => n.parentId === null)!.id), sha256: observationHash({ fileId: v.fileId, pageId: v.pageId, revision: v.revision, scope: v.scope ?? null, nodes }) };
}
export function buildDesignSpec(raw: InspectionDocument, mapping: ComponentMap = emptyComponentMap): DesignSpec {
  const capture = validateDesignInspection(raw), map = validateComponentMap(mapping);
  let traversalBudget = 1_000_000;
  const byId = new Map(capture.nodes.map(row => [row.id, row]));
  const nodes = capture.nodes.map(n => {
    const source = (n.component as { source?: { id?: string; libraryId?: string } } | null)?.source;
    const matches = map.components.filter(c => c.libraryId === source?.libraryId && c.componentId === source?.id);
    let hint: DesignSpec["nodes"][number]["hint"] = null;
    const unknowns = Array.isArray(n.unknowns) ? n.unknowns.map(String) : ["inspection-field-availability"];
    for (const field of ["geometry", "text", "layout", "component", "tokens", "style", "metadata"]) if (!(field in n)) unknowns.push(`uninspected:${field}`);
    if (matches.length === 1) {
      const match = matches[0]!, props: Record<string, unknown> = { ...match.props };
      // Restrict overrides to descendants of this instance, not similarly named text elsewhere in the page.
      const descendants = new Set<unknown>(), pending = [...(n.childIds as string[])];
      while (pending.length) { if (--traversalBudget < 0) throw new Error("Component override traversal budget exceeded"); const id = pending.pop()!, row = byId.get(id)!; descendants.add(id); pending.push(...row.childIds as string[]); }
      for (const [prop, id] of Object.entries(match.textProps ?? {})) {
        const text = byId.get(id)?.text as { characters?: unknown } | null;
        if (!descendants.has(id) || typeof text?.characters !== "string") unknowns.push(`unresolved-text-prop:${prop}`); else props[prop] = text.characters;
      }
      hint = { codeComponent: match.codeComponent, props };
    } else if (source) unknowns.push("unmapped-component");
    return { id: String(n.id), evidence: structuredClone(n), hint, unknowns };
  });
  return { schemaVersion: 1, kind: "design-spec", source: designSource(capture), mappingHash: observationHash(map), nodes,
    unknowns: ["Interaction behavior and application state require an explicit implementation contract.", "Accessibility roles, focus order, keyboard behavior and responsive rules are not inferred from appearance.", "Pixel dimensions describe this captured state only; implementation component hints are owner-declared data, not executable JSX."] };
}
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
export function renderDesignSpec(spec: DesignSpec): string {
  const body = "# Derived design handoff\n\nGenerated evidence; review unknowns with the design owner before implementation.\n\n" + designDataBlock(spec);
  const record = { schemaVersion: 1, kind: "design-spec-record", source: spec.source, mappingHash: spec.mappingHash, bodyHash: sha(body) };
  return `<!-- penpair-spec:${JSON.stringify(record)} -->\n${body}`;
}
export function checkDesignSpec(markdown: string, inspection: InspectionDocument, mapping: ComponentMap = emptyComponentMap): { current: boolean; reason: string } {
  // Exact regeneration detects both changed provenance and manual edits, without executing any embedded design content.
  const current = markdown === renderDesignSpec(buildDesignSpec(inspection, mapping));
  return { current, reason: current ? "Matches supplied inspection and explicit mappings; live freshness is not assessed offline" : "Source, mapping or generated document changed" };
}
export async function writeDesignSpec(root: string, out: string, markdown: string, redact?: (text: string) => string): Promise<void> {
  if (redact && redact(markdown) !== markdown) throw new Error("Design handoff requires redaction; prior output preserved");
  const target = await resolveProjectOutput(root, out); await mkdir(path.dirname(target), { recursive: true }); await atomicWriteFile(target, markdown, { replace: true });
}
