import { publishTrustedPackage } from "./lib/trusted-package.mjs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { confirmReleaseVersion, trustedPublishingContext } from "./lib/release-auth.mjs";
// The only way to publish. All packages of this repository are released together, at one version, in dependency order.
//   pnpm release                      checks everything and prints the plan; publishes nothing
//   pnpm release --publish            does it (npm asks for your one-time code; or pass --otp <code>)
//   pnpm release --publish --continue finishes a release that stopped half way: publishes only what is missing at this version
//   pnpm release --publish --except penpair   leaves one package out on purpose (for example while npm has not allowed its name).
//                                     The release is then reported as INCOMPLETE and the command exits with 3.
import { execFile, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { checkVersions, isPublished, publishOrder } from "./lib/versions.mjs";

const execFileAsync = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const publish = flag("--publish");
const resume = flag("--continue");
const excepted = args.flatMap((arg, i) => (arg === "--except" ? [args[i + 1]] : []));
const otp = option("--otp");
const trusted = flag("--trusted-publishing");
const confirmedVersion = option("--confirm-version");
if (trusted && (otp || excepted.length)) throw new Error("Trusted publishing uses OIDC and the complete package family; OTP/except options belong to the local recovery path");

const say = (message) => console.log(message);
const stop = (message, code = 1) => {
  console.error(`\nSTOP ${message}`);
  process.exit(code);
};
const sh = async (command, commandArgs) => {
  try {
    return (await execFileAsync(command, commandArgs, { cwd: root, maxBuffer: 20 * 1024 * 1024 })).stdout.trim();
  } catch (error) {
    throw new Error(`${command} ${commandArgs.join(" ")} failed:\n${error.stdout ?? ""}${error.stderr ?? ""}`);
  }
};
const inherit = (command, commandArgs, cwd, env = {}) =>
  new Promise((resolve) => {
    const child = spawn(command, commandArgs, { cwd, stdio: "inherit", env: { ...process.env, ...env } });
    child.on("close", (code) => resolve(code ?? 1));
  });

// 1. One version everywhere.
const versions = await checkVersions(root);
if (!versions.ok) stop(`the packages are not consistent:\n${versions.problems.map((p) => `  - ${p}`).join("\n")}`);
const { version } = versions;
const order = publishOrder(versions.packages);
for (const name of excepted) if (!order.some((p) => p.name === name)) stop(`--except ${name}: there is no such package (${order.map((p) => p.name).join(", ")})`);
say(`ok  ${order.length} packages, all at ${version}`);

// 2. Released from what is on GitHub: main, clean, pushed.
const branch = await sh("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
if (branch !== "main") stop(`release from main, not ${branch}`);
if ((await sh("git", ["status", "--porcelain"])) !== "") stop("the working tree has uncommitted changes; commit them first");
await sh("git", ["fetch", "origin", "main"]);
if ((await sh("git", ["rev-parse", "HEAD"])) !== (await sh("git", ["rev-parse", "origin/main"]))) stop("main is not the same as origin/main; push (or pull) first, so what is published is what is on GitHub");
say("ok  main is clean and equal to origin/main");

// 3. What npm already has at this version: all or nothing, unless this continues an interrupted release.
const state = [];
for (const p of order) state.push({ ...p, published: await isPublished(p.name, version) });
const already = state.filter((p) => p.published);
if (already.length === state.length) stop(`every package is already published at ${version}; bump the version (\`pnpm bump patch\`)`);
if (already.length > 0 && !resume) stop(`${already.map((p) => p.name).join(", ")} ${already.length === 1 ? "is" : "are"} already published at ${version} but the others are not. That is an interrupted release: run again with --continue to publish only what is missing.`);
if (already.length === 0 && resume) stop(`--continue, but nothing is published at ${version} yet; run without it`);
const todo = state.filter((p) => !p.published && !excepted.includes(p.name));
say(`ok  npm has ${already.length} of ${state.length} at ${version}; to publish: ${todo.map((p) => p.name).join(" -> ") || "nothing"}`);

// 4. The checks.
say("\n... pnpm check");
if ((await inherit("pnpm", ["check"], root)) !== 0) stop("pnpm check failed");
say("\n... pnpm smoke:package");
if ((await inherit("pnpm", ["smoke:package"], root)) !== 0) stop("pnpm smoke:package failed");

if (!publish) {
  say(`\nDry run: nothing was published. Everything is consistent at ${version}. To release, run:\n  pnpm release --publish${resume ? " --continue" : ""}`);
  if (excepted.length > 0) say(`  (with --except ${excepted.join(" --except ")}: the release will be reported as incomplete)`);
  process.exit(0);
}

// 5. Publish, in order, each with the guard's permission, and look each one up afterwards.
let confirmation = confirmedVersion;
if (!confirmation && process.stdin.isTTY) {
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try { confirmation = await prompt.question(`Type ${version} to publish this checked package family: `); } finally { prompt.close(); }
}
try { confirmReleaseVersion(version, confirmation); } catch (error) { stop(error.message); }
let packDirectory;
if (trusted) {
  try { trustedPublishingContext(process.env, { node: process.version, npm: await sh("npm", ["--version"]) }); } catch (error) { stop(error.message); }
  packDirectory = await mkdtemp(path.join(tmpdir(), "penpair-trusted-release-"));
  say("Publishing with owner-configured OIDC and provenance; registry identity is verified by npm.");
} else {
  const login = await sh("npm", ["whoami"]).catch(() => "");
  if (!login) stop("you are not logged in to npm; run `npm login`");
  say(`\nPublishing as ${login}`);
}
for (const p of todo) {
  say(`\n=== ${p.name}@${version}`);
  let code;
  if (trusted) {
    const artifact = await publishTrustedPackage({ root, packDirectory, package: p, run: inherit }).catch(error => stop(error.message));
    say(`packed ${p.name}: sha256 ${artifact.sha256}`);
    code = artifact.code;
  } else code = await inherit("pnpm", ["publish", "--access", "public", ...(otp ? ["--otp", otp] : [])], p.directory, { PENPAIR_RELEASE: "1" });
  if (code !== 0) stop(`publishing ${p.name} failed. Nothing after it was published. Fix the cause, then run \`pnpm release --publish --continue\`.`, 2);
  let seen = false;
  for (let attempt = 0; attempt < 12 && !seen; attempt++) {
    seen = await isPublished(p.name, version);
    if (!seen) await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  if (!seen) stop(`${p.name}@${version} was published but npm does not show it yet. Wait a minute and run \`pnpm release --publish --continue\`.`, 2);
}

// 6. Verify the whole set.
const final = [];
for (const p of order) final.push({ name: p.name, published: await isPublished(p.name, version) });
say("");
for (const p of final) say(`${p.published ? "ok  " : "MISSING"} ${p.name}@${version}`);
if (final.some((p) => !p.published)) {
  console.error(`\nINCOMPLETE: not every penpair package is at ${version} on npm. They must all be; finish with \`pnpm release --publish --continue\` once the cause is gone.`);
  process.exit(3);
}
say(`\nAll ${final.length} packages are published at ${version}. Tag it if you want one: git tag v${version} && git push origin v${version}`);
