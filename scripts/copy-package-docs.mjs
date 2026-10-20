// Run by `prepack` in packages/core: npm shows the package's own README and `files` cannot reach outside the package,
// so the repository's README and docs are copied in for the tarball. The copies are git-ignored; the repository holds the one source.
import { cp, copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const core = `${root}packages/core/`;
await copyFile(`${root}README.md`, `${core}README.md`);
await mkdir(`${core}docs`, { recursive: true });
// The README links its logo by URL, so the images stay out of the tarball.
await cp(`${root}docs`, `${core}docs`, { recursive: true, filter: (source) => !/[\\/]assets([\\/]|$)/.test(source) });
console.log("copied README.md and docs/ into packages/core for packing");
