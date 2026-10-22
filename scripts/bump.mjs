// Sets the version of every package, and of packages/core/src/version.ts, in one step, so they cannot drift.
//   pnpm bump patch | minor | major | x.y.z
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPackages } from "./lib/versions.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const argument = process.argv[2];
const packages = await loadPackages(root);
const current = [
  ...new Set(packages.map((p) => p.version)),
];
if (!argument) {
  console.error("usage: pnpm bump patch | minor | major | x.y.z");
  process.exit(1);
}
// Start from the highest version that exists, so that bumping after a drift never goes backwards.
const compare = (a, b) =>
  a
    .split(".")
    .map(Number)
    .reduce((r, n, i) => r || n - Number(b.split(".")[i]), 0);
const base = current.sort(compare).at(-1);
const [major, minor, patch] = base.split(".").map(Number);
const next =
  argument === "patch"
    ? `${major}.${minor}.${patch + 1}`
    : argument === "minor"
      ? `${major}.${minor + 1}.0`
      : argument === "major"
        ? `${major + 1}.0.0`
        : argument;
if (!/^\d+\.\d+\.\d+$/.test(next)) {
  console.error(`${JSON.stringify(argument)} is not patch, minor, major or x.y.z`);
  process.exit(1);
}
if (compare(next, base) <= 0) {
  console.error(`${next} is not higher than ${base}`);
  process.exit(1);
}
for (const p of packages) {
  await writeFile(
    join(p.directory, "package.json"),
    `${JSON.stringify(
      {
        ...p.json,
        version: next,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`${p.name}  ${p.version} -> ${next}`);
}
const file = join(root, "packages/core/src/version.ts");
const text = await readFile(file, "utf8");
await writeFile(
  file,
  text.replace(/export const version = "[^"]+"/, `export const version = "${next}"`),
);
console.log(`packages/core/src/version.ts  -> ${next}`);
console.log(
  `\nAll packages are at ${next}. Add a section to CHANGELOG.md, then \`pnpm check\`, commit, push, and \`pnpm release\`.`,
);
