// The rule for every package in this repository: one version, always, even for a package that did not change.
// `penpair`, `@penpair/core`, `@penpair/web`, `@penpair/docker` and anything added under packages/ are released together or not at all.
import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const dependencyFields = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];
export const guardScript = "node ../../scripts/guard-publish.mjs";

/** Every package under packages/, with its parsed package.json. */
export async function loadPackages(root) {
  const directory = join(root, "packages");
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    let json;
    try {
      json = JSON.parse(await readFile(join(directory, entry.name, "package.json"), "utf8"));
    } catch {
      continue;
    }
    found.push({ folder: entry.name, directory: join(directory, entry.name), name: json.name, version: json.version, json });
  }
  return found.sort((a, b) => a.name.localeCompare(b.name));
}

/** The version written in the library's own source, which the command prints. */
export async function sourceVersion(root) {
  const text = await readFile(join(root, "packages/core/src/version.ts"), "utf8");
  return /export const version = "([^"]+)"/.exec(text)?.[1];
}

/** Everything that would let two packages drift apart, as a list of plain sentences. Empty means the repository is consistent. */
export async function checkVersions(root) {
  const packages = await loadPackages(root);
  const problems = [];
  if (packages.length === 0) return { ok: false, version: undefined, packages, problems: ["no packages found under packages/"] };
  const versions = [...new Set(packages.map((p) => p.version))];
  const version = versions.length === 1 ? versions[0] : undefined;
  if (versions.length > 1) problems.push(`the packages have different versions: ${packages.map((p) => `${p.name}@${p.version}`).join(", ")}. Run \`pnpm bump <version>\` to set them all.`);
  for (const p of packages) {
    if (!/^\d+\.\d+\.\d+$/.test(String(p.version))) problems.push(`${p.name} has the version ${JSON.stringify(p.version)}, which is not x.y.z`);
    if (p.json.private) problems.push(`${p.name} is private; every package under packages/ is released with the others`);
    if (p.json.scripts?.prepublishOnly !== guardScript) problems.push(`${p.name} must have the script "prepublishOnly": ${JSON.stringify(guardScript)}, so it cannot be published on its own`);
  }
  // Conditions in `exports` are matched in order, so `types` must come first or TypeScript users never see the declarations.
  const typesFirst = (node, where) => {
    if (typeof node !== "object" || node === null) return;
    const keys = Object.keys(node);
    if (keys.includes("types") && keys[0] !== "types") problems.push(`${where}: "types" must be the first condition in exports (it is after "${keys[0]}"), or TypeScript never uses it`);
    for (const key of keys) typesFirst(node[key], `${where}.${key}`);
  };
  for (const p of packages) typesFirst(p.json.exports, `${p.name} exports`);
  const fromSource = await sourceVersion(root);
  if (version !== undefined && fromSource !== version) problems.push(`packages/core/src/version.ts says ${fromSource} but the packages say ${version}`);
  const names = new Set(packages.map((p) => p.name));
  for (const p of packages)
    for (const field of dependencyFields)
      for (const [dependency, range] of Object.entries(p.json[field] ?? {}))
        if (names.has(dependency) && range !== "workspace:*") problems.push(`${p.name} lists ${dependency} as ${JSON.stringify(range)} in ${field}; between packages of this repository it must be "workspace:*", which is published as the exact same version`);
  return { ok: problems.length === 0, version, packages, problems };
}

/** The order to publish in: a package after everything of this repository that it depends on. */
export function publishOrder(packages) {
  const byName = new Map(packages.map((p) => [p.name, p]));
  const ordered = [];
  const state = new Map();
  const visit = (p) => {
    if (state.get(p.name) === "done") return;
    if (state.get(p.name) === "visiting") throw new Error(`${p.name} depends on itself through a cycle`);
    state.set(p.name, "visiting");
    for (const field of ["dependencies", "optionalDependencies", "peerDependencies"])
      for (const dependency of Object.keys(p.json[field] ?? {})) if (byName.has(dependency)) visit(byName.get(dependency));
    state.set(p.name, "done");
    ordered.push(p);
  };
  for (const p of packages) visit(p);
  return ordered;
}

/** Whether `name@version` is on the npm registry. Anything other than a plain "not found" is an error, never a guess. */
export async function isPublished(name, version) {
  try {
    const { stdout } = await execFileAsync("npm", ["view", `${name}@${version}`, "version", "--json"]);
    return stdout.includes(version);
  } catch (error) {
    if (/E404|404 Not Found|is not in this registry/.test(`${error.stdout ?? ""}${error.stderr ?? ""}`)) return false;
    throw new Error(`could not ask npm about ${name}@${version}: ${String(error.stderr ?? error.message).split("\n")[0]}`);
  }
}
