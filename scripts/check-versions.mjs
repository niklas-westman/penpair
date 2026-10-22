// Fails when the packages of this repository do not all have the same version. Part of `pnpm check`, so CI catches drift.
import { fileURLToPath } from "node:url";
import { checkVersions } from "./lib/versions.mjs";
import { checkReleaseGroup } from "./lib/changesets.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const result = await checkVersions(root);
await checkReleaseGroup(root);
if (result.ok) {
  console.log(
    `ok  ${result.packages.length} packages, all at ${result.version}: ${result.packages.map((p) => p.name).join(", ")}`,
  );
} else {
  for (const problem of result.problems) {
    console.error(`FAIL ${problem}`);
  }
  process.exitCode = 1;
}
