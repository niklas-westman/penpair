import { open, realpath } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import type { PenpotToolClient } from "./client.js";
import { maxSnippetBytes } from "./client.js";
import { resolveProjectInput } from "./project-input.js";
import { compiles, requirePage, snippet, type Snippet, type SnippetResult } from "./snippet.js";
import { normalize, type Params, type WriteEntry } from "./registry.js";
import { runOnPage, runOperation, type OperationOptions } from "./operation.js";

interface SourceFile {
  file: string;
  sha256: string;
  body: string;
  declaration: "read" | "write" | "unknown";
  idempotent: boolean;
}
export interface FileScriptOptions {
  include?: string[];
  page?: string;
  params?: Params;
  inspect?: string;
  readback?: string;
  virtualIncludes?: Record<string, string>;
}
export interface PreparedFileScript {
  kind: "read" | "write";
  source: {
    file: string;
    sha256: string;
  }[];
  params: Params;
  page?: string;
  read?: Snippet;
  operation?: WriteEntry["operation"];
}
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
async function sourceFile(root: string, entry: string): Promise<SourceFile> {
  if (!/\.m?js$/.test(entry)) {
    throw new Error(
      "Plugin bodies must be .js or .mjs files; host imports and TypeScript transpilation are not performed",
    );
  }
  const target = await resolveProjectInput(root, entry);
  const handle = await open(target, "r");
  let body: string;
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > maxSnippetBytes) {
      throw new Error("Script file exceeds the 90 KB input bound or is not a regular file");
    }
    body = (await handle.readFile("utf8")).replace(/^\uFEFF/, "");
  } finally {
    await handle.close();
  }
  if (body.includes("\0")) {
    throw new Error("Plugin script contains a NUL character");
  }
  const header = body.trimStart().split(/\r?\n/)[0]?.trim();
  const declaration =
    header === "// penpair: read" ? "read" : header === "// penpair: write" ? "write" : "unknown";
  // The idempotency assertion must be in the initial comment block, before executable source.
  const comments: string[] = [];
  for (const line of body.trimStart().split(/\r?\n/)) {
    if (!line.trim().startsWith("//")) {
      break;
    }
    comments.push(line.trim());
  }
  return {
    file: path
      .relative(await realpath(root), target)
      .split(path.sep)
      .join("/"),
    sha256: digest(body),
    body,
    declaration,
    idempotent: comments.includes("// penpair: idempotent"),
  };
}
function checked(value: Snippet): Snippet {
  const error = compiles(value.code);
  if (error) {
    throw new Error(`${value.name}: invalid plugin body: ${error}`);
  }
  return value;
}
/** Reads and compiles explicitly selected files without importing project modules on the host. */
export async function prepareFileScript(
  root: string,
  file: string,
  options: FileScriptOptions = {},
): Promise<PreparedFileScript> {
  const includes = options.include ?? [];
  if (includes.length > 20 || new Set(includes).size !== includes.length) {
    throw new Error("Use at most 20 distinct ordered includes");
  }
  const params = options.params ?? {};
  if (
    Object.keys(params).length > 100 ||
    Object.keys(params).some((key) => !/^[A-Za-z][A-Za-z0-9]*$/.test(key))
  ) {
    throw new Error("Use at most 100 named parameters (letters followed by letters/digits)");
  }
  if (options.page && Object.hasOwn(params, "page")) {
    throw new Error("--page owns CFG.page; do not also pass --param page");
  }
  if (Object.hasOwn(params, "inspection")) {
    throw new Error("CFG.inspection is reserved for the independently captured write inspection");
  }
  const helpers: SourceFile[] = [];
  for (const include of includes) {
    const virtual = options.virtualIncludes?.[include];
    const helper: SourceFile =
      virtual === undefined
        ? await sourceFile(root, include)
        : {
            file: include,
            body: virtual,
            sha256: digest(virtual),
            declaration: virtual.startsWith("// penpair: read\n") ? "read" : "unknown",
            idempotent: false,
          };
    if (helper.declaration !== "read") {
      throw new Error(
        `Include ${include} must declare // penpair: read for its top-level inclusion effects`,
      );
    }
    helpers.push(helper);
  }
  const main = await sourceFile(root, file);
  const prelude = helpers.map((helper) => `// Included helper\n${helper.body}\n`).join("\n");
  const cfg = {
    ...params,
    ...(options.page
      ? {
          page: options.page,
        }
      : {}),
  };
  const build = (
    label: string,
    body: string,
    effect: "read" | "write",
    inspected?: SnippetResult,
  ) =>
    checked(
      snippet(
        label,
        `${requirePage}\n${prelude}\n${body}`,
        {
          ...cfg,
          ...(effect === "write"
            ? {
                inspection: inspected ?? null,
              }
            : {}),
        },
        effect,
      ),
    );
  if (main.declaration === "read") {
    if (options.inspect || options.readback) {
      throw new Error("Read scripts do not take write inspect/readback phases");
    }
    return {
      kind: "read",
      source: [
        ...helpers,
        main,
      ].map(({ file, sha256 }) => ({
        file,
        sha256,
      })),
      params: cfg,
      page: options.page,
      read: build("run-file-read", main.body, "read"),
    };
  }
  if (main.declaration !== "write" || !main.idempotent || !options.inspect || !options.readback) {
    throw new Error(
      "Write script execution requires // penpair: write, // penpair: idempotent, and explicit --inspect/--readback files. Declarations are trusted code contracts, not a sandbox.",
    );
  }
  const inspect = await sourceFile(root, options.inspect);
  const readback = await sourceFile(root, options.readback);
  if (inspect.declaration !== "read" || readback.declaration !== "read") {
    throw new Error("Inspection and readback files must declare // penpair: read");
  }
  // Reuse the registry's positive evidence verifier; never equate an acknowledgment with a verified write.
  const normalized = normalize(
    {
      name: "run-file",
      description: "Explicitly selected reviewed file operation",
      kind: "write",
      inspect: inspect.body,
      apply: main.body,
      readback: readback.body,
    },
    "project",
  ) as WriteEntry;
  const operation: WriteEntry["operation"] = {
    ...normalized.operation,
    page: () => options.page,
    inspect: () => build("run-file-inspect", inspect.body, "read"),
    apply: (_params: Params, inspected?: SnippetResult) =>
      build("run-file-apply", main.body, "write", inspected),
    readback: () => build("run-file-readback", readback.body, "read"),
  };
  operation.inspect({});
  operation.apply({});
  operation.readback({});
  return {
    kind: "write",
    source: [
      ...helpers,
      main,
      inspect,
      readback,
    ].map(({ file, sha256 }) => ({
      file,
      sha256,
    })),
    params: cfg,
    page: options.page,
    operation,
  };
}
export async function runFileScript(
  client: PenpotToolClient,
  prepared: PreparedFileScript,
  options: OperationOptions = {},
): Promise<Record<string, unknown>> {
  if (prepared.kind === "read") {
    if (options.apply || options.journal) {
      throw new Error("Read files do not accept apply or write recovery options");
    }
    const result = await runOnPage(client, prepared.read!, prepared.page, {
      ...options,
      effect: "read",
      retries: 0,
    });
    if (result.ok !== true) {
      throw new Error("Read script returned no explicit ok acknowledgment");
    }
    return {
      phase: "read",
      kind: "declared-read",
      source: prepared.source,
      data: result,
    };
  }
  const report = await runOperation(
    client,
    prepared.operation!,
    {
      parameters: prepared.params,
      sourceFiles: prepared.source,
    },
    // A script's write is checked where it reports layoutRoots; the page sample is opt-in (--layout-scope page).
    options.layout === false
      ? options
      : {
          ...options,
          layout: {
            scope: "inspected",
            ...options.layout,
          },
        },
  );
  return {
    ...report,
    source: prepared.source,
  };
}
