// This wrapper is invoked only by the owner-enabled protected workflow. It never changes versions/tags or prints credentials.
import { spawn } from "node:child_process";
import { appendFileSync } from "node:fs";
import { releaseExclusions } from "./lib/release-exclusions.mjs";
const version = process.env.PENPAIR_EXPECTED_VERSION;
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error("Supply the exact checked release version");
}
const resume = process.env.PENPAIR_CONTINUE_RELEASE;
if (resume !== "true" && resume !== "false") {
  throw new Error("Explicit continue-release boolean required");
}
const excluded = releaseExclusions(process.env.PENPAIR_RELEASE_EXCLUDE_PENPAIR);
if (excluded.length && process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `## Temporary publishing exception\n\nVersion: ${version}. **penpair is intentionally excluded from npm publishing.** Every other package is required and must pass independent registry verification; see the job result. All repository package versions still move together.\n\nRemove or set PENPAIR_RELEASE_EXCLUDE_PENPAIR=false to restore full-family publishing; catch up the current missing wrapper with explicit continuation.\n`,
  );
}
const args = [
  "release",
  "--publish",
  "--trusted-publishing",
  "--confirm-version",
  version,
  ...(resume === "true"
    ? [
        "--continue",
      ]
    : []),
];
const child = spawn("pnpm", args, {
  stdio: "inherit",
  env: process.env,
});
child.on("error", () => {
  process.exitCode = 1;
});
child.on("close", (code) => {
  process.exitCode = code ?? 1;
  if (excluded.length && process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `\n**Result:** ${code === 0 ? "All required packages verified; penpair remains intentionally excluded." : "Release failed; do not assume required packages are complete. Inspect logs before explicit recovery."}\n`,
    );
  }
});
