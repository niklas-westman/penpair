import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { checkReleaseGroup, pendingChangesets, syncSourceVersion } from "./lib/changesets.mjs";
import { checkVersions } from "./lib/versions.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
await checkReleaseGroup(root);
const before = await checkVersions(root);
if (!before.ok) throw new Error(before.problems.join("\n"));
if (!(await pendingChangesets(root)).length) throw new Error("No pending changesets; nothing to version");
execFileSync("pnpm", ["changeset", "version"], { cwd: root, stdio: "inherit" });
const version = await syncSourceVersion(root);
if (version === before.version) throw new Error("Changesets did not bump the package family");
if ((await pendingChangesets(root)).length) throw new Error("Unconsumed changesets remain after versioning");
execFileSync("pnpm", ["install", "--lockfile-only", "--ignore-scripts"], { cwd: root, stdio: "inherit" });
console.log(`Prepared every package and the CLI constant at ${version}. Review before merging; nothing was published.`);
