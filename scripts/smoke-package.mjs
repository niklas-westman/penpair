// Packs both packages, installs the tarballs in an empty project, and runs what a new user would run, so that what is tested is what is published.
import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repo = fileURLToPath(new URL("../", import.meta.url));
const version = JSON.parse(await readFile(join(repo, "packages/core/package.json"), "utf8")).version;
const packDir = await mkdtemp(join(tmpdir(), "penpair-pack-"));
const consumer = await mkdtemp(join(tmpdir(), "penpair-consumer-"));

async function run(command, args, options = {}) {
  try {
    const { stdout } = await execFileAsync(command, args, { maxBuffer: 10 * 1024 * 1024, ...options });
    return stdout;
  } catch (error) {
    throw new Error(`${command} ${args.join(" ")} failed:\n${error.stdout ?? ""}\n${error.stderr ?? ""}`);
  }
}
const check = (ok, message) => {
  if (!ok) throw new Error(`smoke: ${message}`);
  console.log(`ok  ${message}`);
};

for (const directory of ["packages/core", "packages/penpair"]) await run("pnpm", ["pack", "--pack-destination", packDir], { cwd: join(repo, directory) });
const tarballs = (await readdir(packDir)).filter((file) => file.endsWith(".tgz"));
check(tarballs.length === 2, `two tarballs packed (${tarballs.join(", ")})`);

await writeFile(join(consumer, "package.json"), JSON.stringify({ name: "penpair-consumer-smoke", private: true, type: "module" }, null, 2));
// The wrapper depends on the core at this exact version; installing both tarballs together lets that be satisfied without a registry.
await run("npm", ["install", "--no-audit", "--no-fund", ...tarballs.map((file) => join(packDir, file))], { cwd: consumer });

check((await run("npx", ["--no-install", "penpair", "--version"], { cwd: consumer })).trim() === version, `npx penpair --version is ${version}`);
const skills = (await run("npx", ["--no-install", "penpair", "skills"], { cwd: consumer })).split("\n").filter(Boolean);
check(["design-judgment", "penpair-setup", "penpot-design"].every((name) => skills.includes(name)), `the three skills ship (${skills.join(", ")})`);
check(/penpair setup/.test(await run("npx", ["--no-install", "penpair", "--help"], { cwd: consumer })), "the help starts with setup");
const library = await run("node", ["--input-type=module", "-e", 'import { defineSnippet, version } from "@penpair/core"; console.log(typeof defineSnippet, version);'], { cwd: consumer });
check(library.trim() === `function ${version}`, "the library exports defineSnippet");
await run("npx", ["--no-install", "penpair", "skills", "install"], { cwd: consumer });
const installed = await readFile(join(consumer, ".skills/penpair-setup/SKILL.md"), "utf8");
check(/^name: penpair-setup/m.test(installed), "skills install writes the setup skill");
const readme = await readFile(join(consumer, "node_modules/@penpair/core/README.md"), "utf8");
check(/Quick start/.test(readme), "the npm README is the repository's");
check((await readdir(join(consumer, "node_modules/@penpair/core/docs"))).includes("getting-started.md"), "the docs ship");
console.log(`\npackages smoke-tested from ${packDir}`);
