import { mkdir, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
/** Called only after the release entrypoint's complete preflight and owner confirmation. Injectable executor never prints env. */
export async function publishTrustedPackage({ root, packDirectory, package: pkg, run }) {
  const permission = {
    PENPAIR_RELEASE: "1",
  };
  if (
    (await run(
      process.execPath,
      [
        path.join(root, "scripts/guard-publish.mjs"),
      ],
      pkg.directory,
      permission,
    )) !== 0
  ) {
    throw new Error(`publish guard refused ${pkg.name}`);
  }
  const folder = path.join(packDirectory, pkg.folder);
  await mkdir(folder);
  if (
    (await run(
      "pnpm",
      [
        "pack",
        "--pack-destination",
        folder,
      ],
      pkg.directory,
    )) !== 0
  ) {
    throw new Error(`packing ${pkg.name} failed`);
  }
  const files = (await readdir(folder)).filter((file) => file.endsWith(".tgz"));
  if (files.length !== 1) {
    throw new Error(`packing ${pkg.name} did not produce exactly one tarball`);
  }
  const tarball = path.join(folder, files[0]);
  const info = await stat(tarball);
  if (!info.isFile() || info.size < 1 || info.size > 128 * 1024 * 1024) {
    throw new Error("Invalid packed release artifact");
  }
  const sha256 = createHash("sha256")
    .update(await readFile(tarball))
    .digest("hex");
  const code = await run(
    "npm",
    [
      "publish",
      tarball,
      "--access",
      "public",
      "--provenance",
    ],
    root,
    permission,
  );
  return {
    code,
    sha256,
    tarball,
  };
}
