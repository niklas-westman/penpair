// Packs the three packages, installs the tarballs in empty projects, and runs what a new user would run, so that what is tested
// is what is published. Two projects: the web way (core and the short name only) and the Docker way (plus @penpair/docker).
import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repo = fileURLToPath(new URL("../", import.meta.url));
const version = JSON.parse(await readFile(join(repo, "packages/core/package.json"), "utf8")).version;
const packDir = await mkdtemp(join(tmpdir(), "penpair-pack-"));

async function run(command, args, options = {}) {
  try {
    const { stdout } = await execFileAsync(command, args, { maxBuffer: 10 * 1024 * 1024, ...options });
    return stdout;
  } catch (error) {
    throw new Error(`${command} ${args.join(" ")} failed:\n${error.stdout ?? ""}\n${error.stderr ?? ""}`);
  }
}
/** Like run, but for a command that is expected to fail: returns what it said. */
async function runFailing(command, args, options = {}) {
  try {
    await execFileAsync(command, args, options);
  } catch (error) {
    return `${error.stdout ?? ""}${error.stderr ?? ""}`;
  }
  throw new Error(`${command} ${args.join(" ")} was expected to fail`);
}
const check = (ok, message) => {
  if (!ok) throw new Error(`smoke: ${message}`);
  console.log(`ok  ${message}`);
};

for (const directory of ["packages/core", "packages/web", "packages/docker", "packages/marwes-ui", "packages/penpair"]) await run("pnpm", ["pack", "--pack-destination", packDir], { cwd: join(repo, directory) });
const tarballs = (await readdir(packDir)).filter((file) => file.endsWith(".tgz"));
check(tarballs.length === 5, `five tarballs packed (${tarballs.join(", ")})`);
const tarball = (name) => join(packDir, tarballs.find((file) => file === name) ?? name);
const core = `penpair-core-${version}.tgz`;
const asFile = (name) => `file:${tarball(name)}`;

// A user installs ONE command package (the web one or the Docker one); the core comes with it as its dependency. The overrides point
// those dependencies at the packed tarballs, because the registry does not have this version yet.
async function consumer(label, packages, overrides = {}) {
  const directory = await mkdtemp(join(tmpdir(), `penpair-${label}-`));
  await writeFile(join(directory, "package.json"), JSON.stringify({ name: `penpair-${label}-smoke`, private: true, type: "module", ...(Object.keys(overrides).length ? { overrides } : {}) }, null, 2));
  await run("npm", ["install", "--no-audit", "--no-fund", ...packages.map(tarball)], { cwd: directory });
  return directory;
}
const penpair = (directory, ...args) => run("npx", ["--no-install", "penpair", ...args], { cwd: directory });

// 1. The core alone is a library: no command.
const library = await consumer("core", [core]);
check(!(await readdir(join(library, "node_modules/.bin"))).includes("penpair"), "the core has no command of its own");
check((await run("node", ["--input-type=module", "-e", 'import { defineSnippet, runCli, version } from "@penpair/core"; console.log(typeof defineSnippet, typeof runCli, version);'], { cwd: library })).trim() === `function function ${version}`, "but it is the library: defineSnippet and runCli");

// 2. The web way: @penpair/web only (the core arrives with it).
const web = await consumer("web", [`penpair-web-${version}.tgz`], { "@penpair/core": asFile(core) });
check((await readdir(join(web, "node_modules/@penpair"))).sort().join(",") === "core,web", "installing only @penpair/web brings the core with it");
check((await penpair(web, "--version")).trim() === version, `penpair --version is ${version}`);
const skills = (await penpair(web, "skills")).split("\n").filter(Boolean);
check(["design-judgment", "penpair-setup", "penpair-design"].every((name) => skills.includes(name)), `the three skills ship (${skills.join(", ")})`);
const help = await penpair(web, "--help");
check(/penpair setup/.test(help) && /not part of this install/.test(help), "the help starts with setup and says where Docker comes from");
check((await run("node", ["--input-type=module", "-e", 'import { defineSnippet } from "@penpair/web"; console.log(typeof defineSnippet);'], { cwd: web })).trim() === "function", "@penpair/web exports everything the core has");
await penpair(web, "init", "--external", "https://design.penpot.app", "--gitignore");
check(/profile/.test(await readFile(join(web, "penpair.config.json"), "utf8")), "init --external writes the config");
await penpair(web, "skills", "install");
check(/^name: penpair-setup/m.test(await readFile(join(web, ".skills/penpair-setup/SKILL.md"), "utf8")), "skills install writes the setup skill");
check(/Quick start/.test(await readFile(join(web, "node_modules/@penpair/web/README.md"), "utf8")), "the npm page's README is the repository's");
check((await readdir(join(web, "node_modules/@penpair/web/docs"))).includes("getting-started.md"), "the docs ship");
// In a fresh project folder (no config yet), run the installed command by its path.
const bin = join(web, "node_modules/.bin/penpair");
for (const args of [["init"], ["setup", "--docker"]]) {
  const fresh = await mkdtemp(join(tmpdir(), "penpair-fresh-"));
  const message = await runFailing("node", [bin, ...args], { cwd: fresh });
  check(/npm i -D @penpair\/docker/.test(message), `without the Docker package, \`penpair ${args.join(" ")}\` says where it comes from`);
}
const docker0 = await mkdtemp(join(tmpdir(), "penpair-fresh-"));
await writeFile(join(docker0, "penpair.config.json"), JSON.stringify({ instance: "x", penpotVersion: "2.18.3", ports: { frontend: 9777, mail: 1080 }, directory: ".penpair" }));
check(/npm i -D @penpair\/docker/.test(await runFailing("node", [bin, "up"], { cwd: docker0 })), "and so does `penpair up` in a Docker project");

// 3. The short name runs the web command.
const short = await consumer("short", [`penpair-${version}.tgz`], { "@penpair/web": asFile(`penpair-web-${version}.tgz`), "@penpair/core": asFile(core) });
check((await penpair(short, "--version")).trim() === version, "the short name `penpair` runs the web command");

// 4. The Docker way: @penpair/docker only, the same command with the Docker commands added.
const docker = await consumer("docker", [`penpair-docker-${version}.tgz`], { "@penpair/core": asFile(core) });
check((await readdir(join(docker, "node_modules/@penpair"))).sort().join(",") === "core,docker", "installing only @penpair/docker brings the core with it");
check((await penpair(docker, "--version")).trim() === version, "its penpair command runs");
check(/penpair up \| down \| status/.test(await penpair(docker, "--help")), "and lists the Docker commands");
await penpair(docker, "init", "--gitignore", "--port", "9777");
check(/127\.0\.0\.1:9777:8080/.test(await readFile(join(docker, ".penpair/docker-compose.yaml"), "utf8")), "init writes the compose file on the chosen port");
check(((await stat(join(docker, ".penpair/.env"))).mode & 0o777) === 0o600, "and a secrets file only the owner can read");
const ignore = await readFile(join(docker, ".gitignore"), "utf8");
check(/\.penpair\//.test(ignore) && /\.env\.local/.test(ignore), "and keeps both out of git");
check((await run("node", ["--input-type=module", "-e", 'import { defineSnippet, dockerProfile } from "@penpair/docker"; console.log(typeof defineSnippet, typeof dockerProfile.up);'], { cwd: docker })).trim() === "function function", "@penpair/docker exports everything the core has, plus the Docker profile");

// 5. The Marwes adapter: installed beside the web command, loaded from the project's configuration, offline.
const marwes = await consumer("marwes", [`penpair-web-${version}.tgz`, `penpair-marwes-ui-${version}.tgz`], { "@penpair/core": asFile(core) });
await writeFile(join(marwes, "penpair.config.json"), JSON.stringify({ instance: "demo", profile: { type: "external", origin: "https://design.penpot.app" }, adapters: ["@penpair/marwes-ui"], marwes: { project: "." } }));
check(/penpair marwes tokens check/.test(await penpair(marwes, "--help")), "the help lists the adapter's commands once it is listed in the configuration");
const noMarwes = await runFailing("npx", ["--no-install", "penpair", "marwes", "tokens", "check"], { cwd: marwes });
check(/No @marwes-ui\/react, vue or svelte is installed/.test(noMarwes), "and its commands run, saying plainly when Marwes is not installed in the project");
console.log(`\npackages smoke-tested from ${packDir}`);
