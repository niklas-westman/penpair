import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { checkVersions, loadPackages } from "./versions.mjs";

export async function checkReleaseGroup(root) {
  const config = JSON.parse(await readFile(join(root, ".changeset/config.json"), "utf8"));
  const names = (await loadPackages(root)).map((p) => p.name).sort();
  const members = config.fixed?.[0];
  if (
    config.fixed?.length !== 1 ||
    !Array.isArray(members) ||
    JSON.stringify(
      [
        ...members,
      ].sort(),
    ) !== JSON.stringify(names) ||
    config.linked?.length !== 0 ||
    config.ignore?.length !== 0 ||
    config.baseBranch !== "main" ||
    config.access !== "public"
  ) {
    throw new Error(
      "Changesets must have one explicit fixed group containing every package exactly once, no linked/ignored packages, public access and main as base",
    );
  }
  return names;
}

export async function pendingChangesets(root) {
  return (await readdir(join(root, ".changeset"))).filter(
    (name) => name.endsWith(".md") && name !== "README.md",
  );
}

// Changesets owns package versions. Synchronize the CLI constant only after its
// fixed-group result is consistent; never repair an incomplete release plan here.
export async function syncSourceVersion(root) {
  await checkReleaseGroup(root);
  const packages = await loadPackages(root);
  const versions = new Set(packages.map((p) => p.version));
  if (versions.size !== 1) {
    throw new Error("Changesets produced different package versions; refusing to synchronize");
  }
  const version = packages[0].version;
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error("Only stable x.y.z family releases are supported");
  }
  const file = join(root, "packages/core/src/version.ts");
  const source = await readFile(file, "utf8");
  if ((source.match(/export const version = "[^"]+"/g) ?? []).length !== 1) {
    throw new Error("Cannot locate the single source version constant");
  }
  await writeFile(
    file,
    source.replace(/export const version = "[^"]+"/, `export const version = "${version}"`),
  );
  const result = await checkVersions(root);
  if (!result.ok) {
    throw new Error(result.problems.join("\n"));
  }
  return version;
}
