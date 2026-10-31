// Run by the command package prepack: npm shows the package's own README and `files` cannot reach outside the package,
// so the repository's README and docs are copied in for the tarball. The copies are git-ignored; the repository holds the one source.
import { access, cp, copyFile, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
// The README and docs go into the package named on the command line (default: the core). The web package is the one people land on.
const target = process.argv[2] ?? "core";
if (
  ![
    "core",
    "web",
    "docker",
    "penpair",
    "marwes-ui",
    "reflection-check",
  ].includes(target)
) {
  throw new Error("Select a known package directory for documentation generation");
}
const core = `${root}packages/${target}/`;
// A package that maintains its own README keeps it; only a package without one
// (the web command package, which people land on) receives the project README.
const ownReadme = await access(`${core}README.md`).then(
  () => true,
  () => false,
);
if (!ownReadme) {
  await copyFile(`${root}README.md`, `${core}README.md`);
}
// These are generated copies: overlaying would retain removed working documents.
await rm(`${core}docs`, {
  recursive: true,
  force: true,
});
await rm(`${core}examples`, {
  recursive: true,
  force: true,
});
await mkdir(`${core}docs`, {
  recursive: true,
});
// The README links its logo by URL, so the images stay out of the tarball.
// `designs` holds this repository's own design records: history for contributors,
// not documentation for someone installing the command.
await cp(`${root}docs`, `${core}docs`, {
  recursive: true,
  filter: (source) => !/[\\/](?:assets|designs|node_modules|\.working-docs)([\\/]|$)/.test(source),
});
await cp(`${root}examples`, `${core}examples`, {
  recursive: true,
  filter: (source) =>
    !/[\\/](?:node_modules|artifacts|\.penpair|\.working-docs)([\\/]|$)/.test(source),
});
console.log(`copied README.md, docs/ and examples/ into packages/${target} for packing`);
