import { createHash } from "node:crypto";
import { mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { createJiti } from "jiti";
import { atomicWriteFile, parseCommandArgs, resolveProjectInput, resolveProjectOutput, type AdapterContext } from "@penpair/core";
import { computeExpectation } from "./commands.js";
import { canonical, toHexColor, type TokenSnapshot } from "./tokens.js";

export const componentProperties = ["width", "height", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "rowGap", "columnGap", "borderRadius", "borderWidth", "borderColor", "backgroundColor", "color", "fontFamily", "fontSize", "fontWeight", "lineHeight", "boxShadow"] as const;
export interface ComponentCase {
  id: string;
  component: "Button" | "Card" | "StatTile";
  theme: "light" | "dark";
  state: string;
  viewport: { width: number; height: number };
  selector: string;
}
export interface ComponentPilot {
  schemaVersion: 1;
  renderer: string;
  sources: string[];
  snapshot: string;
  cases: ComponentCase[];
}
export interface ComponentMeasurement {
  id: string;
  /** All declared anatomy selectors must be observed; null properties are explicit unknowns. */
  parts: Record<string, Record<string, string | null>>;
  environment: { browser: string; fontsReady: boolean };
}
export interface ComponentSnapshot {
  schemaVersion: 1;
  kind: "component-pilot";
  sourceHash: string;
  hash: string;
  marwesVersion: string;
  cases: Array<ComponentCase & { measurement: ComponentMeasurement; tokenCandidates: Record<string, Record<string, string[]>> }>;
  nativeLibrary: "gated-on-instance-override-proof";
}
export type ComponentRenderer = (cases: ComponentCase[]) => Promise<unknown>;
const digest = (v: unknown): string => createHash("sha256").update(canonical(v)).digest("hex");
const text = (v: unknown, label: string, max = 500): string => {
  if (typeof v !== "string" || !v.trim() || v.length > max || /[\x00-\x1f]/.test(v)) throw new Error(`Invalid component ${label}`);
  return v;
};
export function readComponentPilot(raw: Record<string, unknown>): ComponentPilot {
  const value = (raw.marwes as { components?: unknown } | undefined)?.components;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Configure marwes.components with a trusted renderer, sources and explicit pilot cases");
  const v = value as ComponentPilot;
  if (v.schemaVersion !== 1 || !Array.isArray(v.sources) || !v.sources.length || v.sources.length > 100 || !Array.isArray(v.cases) || !v.cases.length || v.cases.length > 60) throw new Error("Invalid schema-1 component pilot (max 100 sources, 60 cases)");
  const ids = new Set<string>();
  const cases = v.cases.map(c => {
    if (!c || !["Button", "Card", "StatTile"].includes(c.component) || !["light", "dark"].includes(c.theme)) throw new Error("Pilot supports Button/Card/StatTile and explicit light/dark themes");
    const id = text(c.id, "case id"); if (ids.has(id)) throw new Error("Duplicate component case id"); ids.add(id);
    if (![c.viewport?.width, c.viewport?.height].every(n => Number.isInteger(n) && n > 0 && n <= 8192)) throw new Error("Invalid component viewport");
    return { id, component: c.component, theme: c.theme, state: text(c.state, "state"), viewport: { ...c.viewport }, selector: text(c.selector, "selector") };
  });
  for (const component of ["Button", "Card", "StatTile"]) for (const theme of ["light", "dark"]) if (!cases.some(c => c.component === component && c.theme === theme)) throw new Error(`Pilot requires ${component} in ${theme}`);
  return { schemaVersion: 1, renderer: text(v.renderer, "renderer"), sources: v.sources.map(s => text(s, "source")), snapshot: text(v.snapshot, "snapshot"), cases };
}
async function boundedRead(root: string, relative: string): Promise<string> {
  const file = await resolveProjectInput(root, relative);
  if ((await stat(file)).size > 4 * 1024 * 1024) throw new Error("Component input exceeds 4 MiB");
  return readFile(file, "utf8");
}
/** Hash declared source bytes as well as effective tokens: comments and non-token anatomy changes invalidate cheap CI checks. */
export async function componentSourceHash(root: string, pilot: ComponentPilot, tokens: TokenSnapshot): Promise<string> {
  const files = [...new Set([pilot.renderer, ...pilot.sources])].sort();
  const sources = await Promise.all(files.map(async file => [file, digest(await boundedRead(root, file))]));
  return digest({ pilot, sources, tokens: tokens.hash, version: tokens.marwesVersion });
}
function validateMeasurement(raw: unknown, id: string): ComponentMeasurement {
  const v = raw as ComponentMeasurement;
  if (!v || v.id !== id || !v.parts || Array.isArray(v.parts) || typeof v.parts !== "object" || !Object.keys(v.parts).length || Object.keys(v.parts).length > 32 || !v.environment || typeof v.environment.fontsReady !== "boolean") throw new Error(`Incomplete component measurement: ${id}`);
  const parts: ComponentMeasurement["parts"] = Object.create(null);
  for (const [name, fields] of Object.entries(v.parts)) {
    text(name, "part", 100);
    if (!fields || typeof fields !== "object" || Array.isArray(fields) || Object.keys(fields).some(k => !componentProperties.includes(k as typeof componentProperties[number]))) throw new Error("Invalid measured anatomy properties");
    parts[name] = Object.fromEntries(componentProperties.map(key => {
      const value = fields[key];
      if (value !== null && (typeof value !== "string" || value.length > 2000)) throw new Error(`Missing/invalid ${id}/${name}/${key}; use null for unknown`);
      return [key, value];
    }));
  }
  return { id, parts, environment: { browser: text(v.environment.browser, "browser"), fontsReady: v.environment.fontsReady } };
}
/** Exact value candidates are evidence of equality only. Even one candidate is not a semantic binding. */
export function componentTokenCandidates(fields: Record<string, string | null>, tokens: TokenSnapshot, mode: "light" | "dark"): Record<string, string[]> {
  const selected = tokens.themes.find(t => t.group === "Mode" && t.name.toLowerCase() === mode);
  if (!selected) return {};
  const effective = new Map<string, { set: string; value: unknown; type: string }>();
  for (const setName of selected.sets) for (const token of tokens.sets.find(s => s.name === setName)?.tokens ?? []) effective.set(token.name, { set: setName, value: token.value, type: token.type });
  const result: Record<string, string[]> = Object.create(null);
  for (const [property, raw] of Object.entries(fields)) {
    if (raw === null) { result[property] = []; continue; }
    const color = ["color", "borderColor", "backgroundColor"].includes(property);
    const types = color ? ["color"] : property.startsWith("padding") || property.endsWith("Gap") ? ["spacing", "dimension"] : property === "borderRadius" ? ["borderRadius", "dimension"] : ["width", "height"].includes(property) ? ["sizing", "dimension"] : [];
    const normalize = (value: string): string => { try { return color ? toHexColor(value).toLowerCase() : value.replace(/^(-?[\d.]+)px$/, "$1"); } catch { return value; } };
    result[property] = [...effective].filter(([, t]) => types.includes(t.type) && typeof t.value === "string" && normalize(t.value) === normalize(raw)).map(([name, t]) => `${t.set}/${name}`).sort();
  }
  return result;
}
export async function measureComponentPilot(pilot: ComponentPilot, tokens: TokenSnapshot, sourceHash: string, renderer: ComponentRenderer): Promise<ComponentSnapshot> {
  const raw = await renderer(structuredClone(pilot.cases));
  if (!Array.isArray(raw) || raw.length !== pilot.cases.length || JSON.stringify(raw).length > 4 * 1024 * 1024) throw new Error("Renderer must return exactly one bounded observation per case");
  const byId = new Map(raw.map(v => [v?.id, v]));
  if (byId.size !== raw.length) throw new Error("Duplicate renderer case");
  const cases = pilot.cases.map(c => {
    const measurement = validateMeasurement(byId.get(c.id), c.id);
    return { ...c, measurement, tokenCandidates: Object.fromEntries(Object.entries(measurement.parts).map(([name, fields]) => [name, componentTokenCandidates(fields, tokens, c.theme)])) };
  });
  const body = { schemaVersion: 1 as const, kind: "component-pilot" as const, sourceHash, marwesVersion: tokens.marwesVersion, cases, nativeLibrary: "gated-on-instance-override-proof" as const };
  return { ...body, hash: digest(body) };
}
export function validateComponentSnapshot(raw: unknown): ComponentSnapshot {
  const v = raw as ComponentSnapshot;
  if (!v || v.schemaVersion !== 1 || v.kind !== "component-pilot" || v.nativeLibrary !== "gated-on-instance-override-proof" || !/^[a-f0-9]{64}$/.test(v.sourceHash) || !Array.isArray(v.cases) || v.cases.length > 60) throw new Error("Unsupported component snapshot");
  const { hash, ...body } = v; if (hash !== digest(body)) throw new Error("Component snapshot hash mismatch");
  const pilot = readComponentPilot({ marwes: { components: { schemaVersion: 1, renderer: "unused", sources: ["unused"], snapshot: "unused", cases: v.cases } } });
  for (const c of pilot.cases) validateMeasurement(v.cases.find(m => m.id === c.id)?.measurement, c.id);
  return v;
}
export function diffComponentSnapshots(before: ComponentSnapshot, after: ComponentSnapshot) {
  const changes: Array<{ id: string; before: unknown; after: unknown }> = [];
  const ids = new Set([...before.cases, ...after.cases].map(c => c.id));
  for (const id of ids) {
    const a = before.cases.find(c => c.id === id), b = after.cases.find(c => c.id === id);
    if (canonical(a ?? null) !== canonical(b ?? null)) changes.push({ id, before: a ?? null, after: b ?? null });
  }
  return { schemaVersion: 1, identical: before.hash === after.hash, sourceChanged: before.sourceHash !== after.sourceHash, changes, semanticBindings: "not-inferred", instanceOverrides: "not-tested" };
}
export async function componentsCommand(context: AdapterContext, args: string[]): Promise<number> {
  const [sub, ...rest] = args;
  const { values, positionals } = parseCommandArgs({ args: rest, allowPositionals: true, options: { write: { type: "boolean" }, measure: { type: "boolean" }, json: { type: "boolean" } } });
  if (!["snapshot", "check", "diff", "build"].includes(sub ?? "") || positionals.length || (values.write && sub !== "snapshot") || (values.measure && sub !== "check")) throw new Error("Usage: marwes components snapshot [--write] | check [--measure] | diff | build");
  if (sub === "build") throw new Error("Native library generation is gated: first prove preserved text/style instance overrides with the pinned Penpot API in an owner-authorized scratch file. No library was generated.");
  const pilot = readComponentPilot(context.rawConfig);
  const expectation = await computeExpectation(context.root, context.rawConfig, context.config.instance);
  if (expectation.problems.length) throw new Error(expectation.problems.join("; "));
  const sourceHash = await componentSourceHash(context.root, pilot, expectation.fresh);
  let prior: ComponentSnapshot | undefined;
  try { prior = validateComponentSnapshot(JSON.parse(await boundedRead(context.root, pilot.snapshot))); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  if (sub === "check" && !values.measure) {
    const current = prior?.sourceHash === sourceHash;
    const report = { schemaVersion: 1, current, kind: "source-freshness", anatomyMeasured: false, nativeLibrary: "gated-on-instance-override-proof" };
    context.output?.result(report); (context.output?.log ?? console.log)(JSON.stringify(report)); return current ? 0 : 2;
  }
  // Explicit component commands alone execute the project renderer. Like theme modules, this is trusted local code, not a sandbox.
  const file = await resolveProjectInput(context.root, pilot.renderer);
  const module = await createJiti(file, { interopDefault: true, moduleCache: false, tryNative: false }).evalModule(await boundedRead(context.root, pilot.renderer), { filename: file, async: true, forceTranspile: true }) as { measure?: ComponentRenderer };
  if (typeof module.measure !== "function") throw new Error("Component renderer must export async measure(cases); install its optional browser dependency in the project");
  const fresh = await measureComponentPilot(pilot, expectation.fresh, sourceHash, module.measure);
  if (await componentSourceHash(context.root, pilot, (await computeExpectation(context.root, context.rawConfig, context.config.instance)).fresh) !== sourceHash) throw new Error("Component source changed during measurement");
  const complete = fresh.cases.every(c => c.measurement.environment.fontsReady && Object.values(c.measurement.parts).every(fields => Object.values(fields).every(v => v !== null)));
  const report = { schemaVersion: 1, complete, current: prior?.hash === fresh.hash, comparison: prior ? diffComponentSnapshots(prior, fresh) : null, snapshot: fresh, written: false };
  if (sub === "snapshot" && values.write) {
    if (!complete) throw new Error("Incomplete measurements/fonts: previous component snapshot preserved");
    const data = JSON.stringify(fresh, null, 2) + "\n";
    if (context.redact && context.redact(data) !== data) throw new Error("Component evidence requires redaction; snapshot not published");
    const target = await resolveProjectOutput(context.root, pilot.snapshot); await mkdir(path.dirname(target), { recursive: true }); await atomicWriteFile(target, data, { replace: true }); report.written = true;
  }
  context.output?.result(report); (context.output?.log ?? console.log)(JSON.stringify(report, null, 2));
  return !complete ? 3 : report.written || report.current ? 0 : 2;
}
