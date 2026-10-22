import { resolveProjectInput } from "./project-input.js";
import { readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { checkEntry, SnippetRegistry, type SnippetDefinition } from "./registry.js";

export interface LoadReport {
  /** Files that were read, relative to the project. */
  files: string[];
  /** Everything that stopped a snippet from being registered, with the file it came from. */
  problems: string[];
}

async function filesOf(root: string, entry: string): Promise<string[]> {
  let absolute: string;
  let info;
  try {
    absolute = await resolveProjectInput(root, entry);
    info = await stat(absolute);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`${entry} does not exist`);
    }
    throw error;
  }
  if (!info.isDirectory()) {
    return [
      absolute,
    ];
  }
  return (await readdir(absolute))
    .filter(
      (name) =>
        /\.(mjs|js)$/.test(name) && !name.endsWith(".test.js") && !name.endsWith(".test.mjs"),
    )
    .sort()
    .map((name) => path.join(absolute, name));
}

/**
 * Loads a project's own snippets into the registry. Each file default-exports one definition or a list. A broken file is
 * reported and skipped; the rest still load, so one mistake does not hide the others.
 */
export async function loadProjectSnippets(
  root: string,
  entries: string[] | undefined,
  registry: SnippetRegistry,
): Promise<LoadReport> {
  const projectRoot = await realpath(root);
  const report: LoadReport = {
    files: [],
    problems: [],
  };
  for (const entry of entries ?? []) {
    let files: string[];
    try {
      files = await filesOf(projectRoot, entry);
    } catch (error) {
      report.problems.push(String((error as Error).message));
      continue;
    }
    for (const file of files) {
      const relative = path.relative(projectRoot, file);
      report.files.push(relative);
      let loaded: unknown;
      try {
        loaded = (
          (await import(pathToFileURL(await resolveProjectInput(projectRoot, relative)).href)) as {
            default?: unknown;
          }
        ).default;
      } catch (error) {
        report.problems.push(
          `${relative}: could not be loaded: ${String((error as Error).message).split("\n")[0]}`,
        );
        continue;
      }
      const definitions = Array.isArray(loaded)
        ? loaded
        : [
            loaded,
          ];
      if (loaded === undefined) {
        report.problems.push(
          `${relative}: has no default export (use \`export default defineSnippet({...})\`)`,
        );
      }
      for (const definition of definitions.filter((d) => d !== undefined)) {
        try {
          registry.register(definition as SnippetDefinition, "project");
        } catch (error) {
          report.problems.push(`${relative}: ${String((error as Error).message)}`);
        }
      }
    }
  }
  return report;
}

/** Everything wrong with the registered project snippets that can be found without a connection. */
export function checkProjectSnippets(registry: SnippetRegistry): string[] {
  return registry
    .list()
    .filter((entry) => entry.source === "project")
    .flatMap((entry) => checkEntry(entry).map((problem) => `${entry.name}: ${problem}`));
}
