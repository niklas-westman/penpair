import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { checkReleaseCommit } from "./lib/release-pr.mjs";
import { sourceVersion } from "./lib/versions.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const base = process.env.PENPAIR_PR_BASE_SHA;
if (!/^[a-f0-9]{40}$/.test(base ?? "")) throw new Error("Exact PR base SHA required");
const git = args => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const files = git(["diff", "--name-only", `${base}...HEAD`]).split("\n");
const previous = JSON.parse(git(["show", `${base}:packages/core/package.json`])).version;
if (process.env.PENPAIR_PR_HEAD === "changeset-release/main") {
  await checkReleaseCommit(root, previous);
} else {
  if (await sourceVersion(root) !== previous) throw new Error("Only the reviewed Changesets version PR may bump versions");
  if (files.some(file => file.startsWith("packages/") || file.startsWith("scripts/"))) {
    const added = git(["diff", "--name-only", "--diff-filter=A", `${base}...HEAD`, "--", ".changeset/"]).split("\n");
    if (!added.some(file => /^\.changeset\/(?!README\.md$)[^/]+\.md$/.test(file))) {
      throw new Error("Package/script changes need a new release note: run pnpm changeset (an empty changeset can document no release impact)");
    }
  }
}
console.log("ok  PR release-note policy");
