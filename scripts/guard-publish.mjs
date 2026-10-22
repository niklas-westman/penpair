// Every package runs this as `prepublishOnly`. A package cannot be published on its own, or at a version that differs from the others:
// the only way through is `pnpm release`, which publishes the whole set.
import { fileURLToPath } from "node:url";
import { checkVersions } from "./lib/versions.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
if (process.env.PENPAIR_RELEASE !== "1") {
  console.error(
    "Refusing to publish a single package. All penpair packages are released together, at one version.\nRun `pnpm release` from the repository root (it checks, then publishes the whole set in order; add --publish to do it).",
  );
  process.exit(1);
}
const result = await checkVersions(root);
if (!result.ok) {
  for (const problem of result.problems) {
    console.error(`FAIL ${problem}`);
  }
  process.exit(1);
}
