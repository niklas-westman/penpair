import { existsSync, readFileSync } from "node:fs";
import { createRequire, register } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { MarwesCore } from "./tokens.js";

export class MarwesError extends Error {}

export interface InstalledMarwes {
  core: MarwesCore;
  /** The version of @marwes-ui/core, which is the version the tokens come from. */
  version: string;
  /** Every @marwes-ui package found next to it, with its version. Marwes releases them together. */
  versions: Record<string, string>;
}

const familyNames = [
  "react",
  "vue",
  "svelte",
  "core",
  "presets",
];

function packageDirectory(entry: string): string {
  let directory = path.dirname(entry);
  while (!existsSync(path.join(directory, "package.json"))) {
    const parent = path.dirname(directory);
    if (parent === directory) {
      throw new MarwesError(`no package.json above ${entry}`);
    }
    directory = parent;
  }
  return directory;
}

const versionOf = (directory: string): string =>
  String(
    (
      JSON.parse(readFileSync(path.join(directory, "package.json"), "utf8")) as {
        version?: string;
      }
    ).version ?? "?",
  );

/**
 * Loads the Marwes core that the app itself resolves, so the tokens always describe the installed version. `projectDirectory` is
 * the folder of the package that depends on Marwes (a workspace package in a monorepo).
 */
export async function loadInstalledMarwes(projectDirectory: string): Promise<InstalledMarwes> {
  const fromProject = createRequire(path.join(projectDirectory, "package.json"));
  let componentEntry: string | undefined;
  let componentPackage = "";
  for (const candidate of [
    "react",
    "vue",
    "svelte",
  ]) {
    try {
      componentEntry = fromProject.resolve(`@marwes-ui/${candidate}`);
      componentPackage = candidate;
      break;
    } catch {
      // try the next framework
    }
  }
  if (!componentEntry) {
    throw new MarwesError(
      `No @marwes-ui/react, vue or svelte is installed for ${projectDirectory}. Set "marwes.project" in penpair.config.json to the folder of the package that uses Marwes.`,
    );
  }
  const fromComponent = createRequire(componentEntry);
  let coreEntry: string;
  try {
    coreEntry = fromComponent.resolve("@marwes-ui/core");
  } catch {
    throw new MarwesError(
      `@marwes-ui/${componentPackage} is installed but its @marwes-ui/core cannot be found; reinstall the dependencies.`,
    );
  }
  const versions: Record<string, string> = {
    [componentPackage]: versionOf(packageDirectory(componentEntry)),
  };
  versions.core = versionOf(packageDirectory(coreEntry));
  for (const name of familyNames) {
    if (versions[name]) {
      continue;
    }
    try {
      versions[name] = versionOf(packageDirectory(fromComponent.resolve(`@marwes-ui/${name}`)));
    } catch {
      // not installed, which is normal for the frameworks the app does not use
    }
  }
  const namespace = (await importWithStyleStub(pathToFileURL(coreEntry).href)) as MarwesCore & {
    default?: MarwesCore;
  };
  const core: MarwesCore =
    typeof namespace.resolveThemeInput === "function"
      ? namespace
      : (namespace.default as MarwesCore);
  for (const name of [
    "resolveThemeInput",
    "themeToCSSVars",
  ] as const) {
    if (typeof core?.[name] !== "function") {
      throw new MarwesError(
        `@marwes-ui/core ${versions.core} does not export ${name}; this adapter needs a Marwes that does. Update @penpair/marwes-ui or check the Marwes version.`,
      );
    }
  }
  if (!core.mwThemeVars?.spacing) {
    throw new MarwesError(
      `@marwes-ui/core ${versions.core} does not export mwThemeVars.spacing; this adapter needs a Marwes that does.`,
    );
  }
  return {
    core,
    version: versions.core,
    versions,
  };
}

/**
 * Some Marwes releases pull a `.css` file into their module graph, which plain Node refuses to load
 * (ERR_UNKNOWN_FILE_EXTENSION). Tokens never need the stylesheet, so on that one error a loader hook
 * answers every `.css` with an empty module and the import runs again. Any other failure is untouched.
 */
const STYLE_STUB_LOADER = `export async function load(url, context, nextLoad) {
  if (url.endsWith(".css")) {
    return { format: "module", source: "export default {};", shortCircuit: true };
  }
  return nextLoad(url, context);
}`;

let styleStubRegistered = false;

/** Makes plain Node load a `.css` import as an empty module; safe to call more than once. */
export function registerStyleStub(): void {
  if (!styleStubRegistered) {
    register(`data:text/javascript,${encodeURIComponent(STYLE_STUB_LOADER)}`);
    styleStubRegistered = true;
  }
}

export function isUnknownExtensionError(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === "ERR_UNKNOWN_FILE_EXTENSION";
}

async function importWithStyleStub(href: string): Promise<unknown> {
  try {
    return await import(href);
  } catch (error) {
    if (!isUnknownExtensionError(error)) {
      throw error;
    }
    registerStyleStub();
    // A cache-busting query makes Node load the graph again with the hook in place.
    return import(`${href}${href.includes("?") ? "&" : "?"}style-stub=1`);
  }
}

/** Marwes releases core, presets and the framework packages together; a mix means a half-finished upgrade. */
export function familyProblems(installed: InstalledMarwes): string[] {
  const distinct = new Set(Object.values(installed.versions));
  return distinct.size > 1
    ? [
        `the installed Marwes packages are at different versions (${Object.entries(
          installed.versions,
        )
          .map(([name, version]) => `${name} ${version}`)
          .join(", ")}); Marwes releases them together, so finish the upgrade`,
      ]
    : [];
}
