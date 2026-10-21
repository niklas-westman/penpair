import { runOperation, runOnPage, type Operation, type OperationOptions } from "./operation.js";
import type { PenpotToolClient } from "./client.js";
import { compiles, requirePage, snippet, type Snippet, type SnippetResult } from "./snippet.js";
import { archiveOperation } from "./operation.js";
import { audit, pages, tokensDump, tree } from "./snippets/read.js";

export type ParamType = "string" | "number" | "boolean" | "string[]" | "number[]";

export interface ParamSpec {
  name: string;
  type: ParamType;
  description?: string;
  required?: boolean;
  default?: unknown;
}

export type Params = Record<string, unknown>;
type Body = string | ((params: Params) => string);

interface DefinitionBase {
  /** Lowercase words joined by hyphens. Unique in the registry. */
  name: string;
  description: string;
  params?: ParamSpec[];
  /** The page the snippet works on. The runner opens it, and the snippet sees it as `CFG.page` and refuses to act on any other. */
  page?: string | ((params: Params) => string | undefined);
}

/** A snippet that only looks. The body is plugin code that returns an object with `ok: true`; parameters arrive as `CFG`. */
export interface ReadDefinition extends DefinitionBase {
  kind: "read";
  body: Body;
}

/**
 * A change done the safe way. `inspect` only looks and says what would change; `apply` changes once and must be safe to repeat;
 * `readback` looks again from scratch. `verify` compares them and returns the problems; by default the readback's
 * `problems` array is used (an empty or missing array means nothing is wrong).
 */
export interface WriteDefinition extends DefinitionBase {
  kind: "write";
  inspect: Body;
  apply: Body;
  readback: Body;
  verify?: Operation<Params>["verify"];
}

export type SnippetDefinition = ReadDefinition | WriteDefinition;

/** Declares a project snippet. Returns the definition unchanged, so a module can `export default defineSnippet({...})` with types checked. */
export const defineSnippet = <T extends SnippetDefinition>(definition: T): T => definition;

export class RegistryError extends Error {}

export interface ReadEntry {
  kind: "read";
  name: string;
  description: string;
  params: ParamSpec[];
  source: "built-in" | "project";
  page?: (params: Params) => string | undefined;
  build(params: Params): Snippet;
}

export interface WriteEntry {
  kind: "write";
  name: string;
  description: string;
  params: ParamSpec[];
  source: "built-in" | "project";
  operation: Operation<Params>;
}

export type Entry = ReadEntry | WriteEntry;

const namePattern = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const paramTypes: ParamType[] = ["string", "number", "boolean", "string[]", "number[]"];

const bodyOf = (body: Body, params: Params): string => (typeof body === "function" ? body(params) : body);
const pageOf = (page: DefinitionBase["page"]): ((params: Params) => string | undefined) | undefined =>
  page === undefined ? undefined : typeof page === "function" ? page : () => page;

/** Whatever page the definition names is handed to the snippet as CFG.page, with the guard in front of the body. */
function pageAware(def: DefinitionBase, params: Params): { cfg: Params; guard: string } {
  const page = pageOf(def.page)?.(params);
  return page === undefined ? { cfg: params, guard: "" } : { cfg: { ...params, page }, guard: `${requirePage}\n` };
}

/** Turns a definition into what the registry runs. Throws a RegistryError that says what is wrong with the definition. */
export function normalize(def: SnippetDefinition, source: "built-in" | "project"): Entry {
  const fail = (message: string): never => {
    throw new RegistryError(`snippet ${JSON.stringify((def as { name?: unknown }).name)}: ${message}`);
  };
  if (typeof def !== "object" || def === null) return fail("a snippet must be an object");
  if (typeof def.name !== "string" || !namePattern.test(def.name)) fail("name must be lowercase words joined by hyphens");
  if (typeof def.description !== "string" || def.description.trim() === "") fail("a description is required");
  const params = def.params ?? [];
  const seen = new Set<string>();
  for (const spec of params) {
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(spec.name)) fail(`parameter name ${JSON.stringify(spec.name)} is not valid`);
    if (!paramTypes.includes(spec.type)) fail(`parameter ${spec.name} has an unknown type ${JSON.stringify(spec.type)}`);
    if (seen.has(spec.name)) fail(`parameter ${spec.name} is declared twice`);
    seen.add(spec.name);
  }
  const common = { name: def.name, description: def.description, params, source };
  if (def.kind === "read") {
    if (typeof def.body !== "string" && typeof def.body !== "function") fail("a read snippet needs a body");
    return {
      kind: "read",
      ...common,
      ...(def.page === undefined ? {} : { page: pageOf(def.page) }),
      build(p) {
        const { cfg, guard } = pageAware(def, p);
        return snippet(def.name, `${guard}${bodyOf(def.body, p)}`, cfg);
      },
    };
  }
  if (def.kind === "write") {
    for (const phase of ["inspect", "apply", "readback"] as const)
      if (typeof def[phase] !== "string" && typeof def[phase] !== "function") fail(`a write snippet needs ${phase}`);
    const phaseSnippet = (phase: "inspect" | "apply" | "readback") => (p: Params): Snippet => {
      const { cfg, guard } = pageAware(def, p);
      return snippet(`${def.name}-${phase}`, `${guard}${bodyOf(def[phase], p)}`, cfg);
    };
    return {
      kind: "write",
      ...common,
      operation: {
        name: def.name,
        page: (p) => pageOf(def.page)?.(p),
        inspect: phaseSnippet("inspect"),
        apply: phaseSnippet("apply"),
        readback: phaseSnippet("readback"),
        verify:
          def.verify ??
          (({ readback }) => (Array.isArray(readback.problems) ? (readback.problems as unknown[]).map(String) : [])),
      },
    };
  }
  return fail('kind must be "read" or "write"');
}

/** Checks that every phase of a snippet is valid plugin code and small enough, using only the declared defaults. No connection needed. */
export function checkEntry(entry: Entry): string[] {
  const sample: Params = {};
  for (const spec of entry.params) if (spec.default !== undefined) sample[spec.name] = spec.default;
  const problems: string[] = [];
  const snippets: Snippet[] = [];
  try {
    if (entry.kind === "read") snippets.push(entry.build(sample));
    else snippets.push(entry.operation.inspect(sample), entry.operation.apply(sample), entry.operation.readback(sample));
  } catch (error) {
    // A builder may need a real parameter to build at all; then only the rest of the checks apply.
    const message = String((error as Error).message);
    if (/bytes/.test(message)) problems.push(message);
  }
  for (const s of snippets) {
    const error = compiles(s.code);
    if (error) problems.push(`${s.name}: ${error}`);
  }
  return problems;
}

/** Converts what a person typed (all strings) to the declared types, applies defaults, and refuses anything unknown or missing. */
export function coerceParams(specs: ParamSpec[], raw: Record<string, string | string[]>): Params {
  const out: Params = {};
  const known = new Set(specs.map((s) => s.name));
  for (const key of Object.keys(raw)) if (!known.has(key)) throw new RegistryError(`unknown parameter ${key}; known: ${[...known].join(", ") || "none"}`);
  for (const spec of specs) {
    const value = raw[spec.name];
    if (value === undefined) {
      if (spec.default !== undefined) out[spec.name] = spec.default;
      else if (spec.required) throw new RegistryError(`parameter ${spec.name} is required`);
      continue;
    }
    const text = Array.isArray(value) ? value.join(",") : value;
    switch (spec.type) {
      case "string": out[spec.name] = text; break;
      case "number": {
        const n = Number(text);
        if (!Number.isFinite(n)) throw new RegistryError(`parameter ${spec.name} must be a number`);
        out[spec.name] = n;
        break;
      }
      case "boolean":
        if (!["true", "false"].includes(text)) throw new RegistryError(`parameter ${spec.name} must be true or false`);
        out[spec.name] = text === "true";
        break;
      case "string[]": out[spec.name] = text.split(",").map((v) => v.trim()).filter(Boolean); break;
      case "number[]": {
        const list = text.split(",").map((v) => Number(v.trim()));
        if (list.some((n) => !Number.isFinite(n))) throw new RegistryError(`parameter ${spec.name} must be numbers separated by commas`);
        out[spec.name] = list;
        break;
      }
    }
  }
  return out;
}

export class SnippetRegistry {
  private readonly entries = new Map<string, Entry>();

  register(def: SnippetDefinition | Entry, source: "built-in" | "project" = "project"): Entry {
    const entry = "build" in def || "operation" in def ? (def as Entry) : normalize(def as SnippetDefinition, source);
    if (this.entries.has(entry.name)) throw new RegistryError(`snippet ${entry.name} is already registered (${this.entries.get(entry.name)!.source})`);
    this.entries.set(entry.name, entry);
    return entry;
  }

  get(name: string): Entry {
    const entry = this.entries.get(name);
    if (!entry) throw new RegistryError(`no snippet named ${name}. Known: ${[...this.entries.keys()].sort().join(", ")}`);
    return entry;
  }

  list(): Entry[] {
    return [...this.entries.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Runs a snippet by name. A write snippet only looks unless `apply` is set. */
  async run(client: PenpotToolClient, name: string, params: Params, options: OperationOptions = {}): Promise<unknown> {
    const entry = this.get(name);
    if (entry.kind === "write") return runOperation(client, entry.operation, params, options);
    const record: SnippetResult = await runOnPage(client, entry.build(params), entry.page?.(params), { ...options, effect: "read" });
    return record;
  }
}

const readBuiltIn = (name: string, description: string, params: ParamSpec[], build: (p: Params) => Snippet): ReadEntry => ({
  kind: "read",
  name,
  description,
  params,
  source: "built-in",
  ...(params.some((p) => p.name === "page") ? { page: (p: Params) => p.page as string } : {}),
  build,
});

/** The registry with everything penpair ships. Project snippets are added to it. */
export function builtInRegistry(): SnippetRegistry {
  const registry = new SnippetRegistry();
  registry.register(readBuiltIn("pages", "The file, its revision, its pages and how many top-level shapes each has.", [], () => pages()), "built-in");
  registry.register(
    readBuiltIn(
      "tree",
      "One line per shape: type, name, size, position, layout and sizing, and the text it carries.",
      [
        { name: "page", type: "string", required: true, description: "Page to read" },
        { name: "depth", type: "number", default: 3, description: "How many levels down" },
        { name: "namePrefix", type: "string", description: "Only top-level shapes whose name starts with this" },
        { name: "limit", type: "number", default: 400, description: "Stop after this many lines" },
      ],
      (p) => tree(p as unknown as Parameters<typeof tree>[0]),
    ),
    "built-in",
  );
  registry.register(
    readBuiltIn(
      "audit",
      "Blank text, colours and strokes not bound to a token, children sticking out of their parent, gaps off the allowed steps.",
      [
        { name: "page", type: "string", required: true },
        { name: "framePrefix", type: "string", required: true, description: "Audit top-level frames whose names start with this" },
        { name: "spacingSteps", type: "number[]", description: "Allowed gap and padding values; leave out to skip that check" },
        { name: "ignoreUnbound", type: "string[]", description: "Names (starts) not reported as unbound" },
      ],
      (p) => audit(p as unknown as Parameters<typeof audit>[0]),
    ),
    "built-in",
  );
  registry.register(readBuiltIn("tokens-dump", "Token sets in order and themes, as JSON.", [], () => tokensDump()), "built-in");
  registry.register(
    {
      kind: "write",
      name: "archive",
      description: "Nest the frames that are not part of the live work into one archive board. Frames keep names, ids and component links.",
      params: [
        { name: "page", type: "string", required: true },
        { name: "archiveName", type: "string", required: true, description: "Name of the archive board" },
        { name: "keepPrefixes", type: "string[]", default: [], description: "Boards whose names start with one of these stay live" },
        { name: "partPrefixes", type: "string[]", default: [], description: "Library parts, never archived" },
        { name: "x", type: "number", default: 9000, description: "Where the archive board is placed" },
      ],
      source: "built-in",
      operation: archiveOperation as unknown as Operation<Params>,
    },
    "built-in",
  );
  return registry;
}

