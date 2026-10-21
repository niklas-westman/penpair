import { projectConfigSchema } from "./instance/config-schema.js";
import { validateProjectConfig } from "./instance/config.js";
import { commandResultSchema } from "./command-result.js";
const string = { type: "string" }, array = { type: "array" };
const schema = (name: string, version: number, kind: string | undefined, properties: Record<string, unknown>, required = Object.keys(properties)) => ({ $schema: "https://json-schema.org/draft/2020-12/schema", $id: `urn:penpair:schema:v${version}:${name}`, title: `${name} v${version}`, type: "object", required: ["schemaVersion", ...(kind ? ["kind"] : []), ...required], properties: { schemaVersion: { const: version }, ...(kind ? { kind: { const: kind } } : {}), ...properties }, additionalProperties: true });
/** Public envelope schemas; runtime validators additionally enforce hashes, identities, hierarchy and budgets. */
export const artifactSchemas: Record<string, unknown> = {
 "project-config": { ...projectConfigSchema, $id: "urn:penpair:schema:v1:project-config" },
 "command-result": { $schema: "https://json-schema.org/draft/2020-12/schema", $id: "urn:penpair:schema:v1:command-result", ...commandResultSchema },
 "inspection": schema("inspection", 1, undefined, { kind: { enum: ["shape-inspection", "token-inspection"] }, fileId: string, pageId: { type: ["string", "null"] }, revision: { type: "integer", minimum: 0 }, complete: { type: "boolean" }, counts: { type: "object" }, reasons: array, producer: { type: "object" } }),
 "component-map": schema("component-map", 1, undefined, { components: { type: "array", maxItems: 1000, items: { type: "object", required: ["libraryId", "componentId", "codeComponent"], properties: { libraryId: string, componentId: string, codeComponent: string, props: { type: "object" }, textProps: { type: "object", additionalProperties: string } } } } }),
 "design-spec": schema("design-spec", 1, "design-spec", { source: { type: "object" }, mappingHash: string, nodes: array, unknowns: array }),
 "approvals": schema("approvals", 1, "design-approvals", { records: { type: "array", maxItems: 10000 } }),
 "structural-manifest": schema("structural-manifest", 1, "structural-snapshot-manifest", { fileId: string, revision: { type: "integer" }, producer: string, fidelity: { const: "review-only" }, pages: { type: "array", minItems: 1, maxItems: 100 }, tokens: { type: "object" }, hash: string }),
 "baseline-manifest": schema("baseline-manifest", 2, undefined, { complete: { type: "boolean" }, fileId: string, pageId: string, captureId: string, frames: { type: "array", maxItems: 1000 } }),
 "portable-tokens": schema("portable-tokens", 1, "portable-tokens", { format: { const: "dtcg-2025.10-subset" }, tokens: { type: "array", minItems: 1, maxItems: 10000, items: { type: "object", required: ["path", "type", "value"], properties: { path: { type: "array", minItems: 1, maxItems: 32, items: string }, type: { enum: ["color", "dimension", "number", "fontFamily", "fontWeight", "typography"] }, value: {}, description: string, extensions: { type: "object" } } } }, groups: { type: "object" }, losses: { type: "array", maxItems: 0 } }),
};
/** Legacy unversioned config is v1; preserve every extension block and require explicit new output for persistence. */
export function migrateProjectConfig(raw: unknown): Record<string, unknown> {
 if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Config migration requires a JSON object");
 const v = raw as Record<string, unknown>;
 if (v.schemaVersion !== undefined && v.schemaVersion !== 1) throw new Error("Unsupported project config major version; use the producer's documented migration before opening it");
 const migrated = { ...structuredClone(v), schemaVersion: 1 }; validateProjectConfig(migrated); return migrated;
}
