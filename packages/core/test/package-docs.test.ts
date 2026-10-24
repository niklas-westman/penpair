import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const execute = promisify(execFile);
const source = fileURLToPath(new URL("../../../scripts/copy-package-docs.mjs", import.meta.url));

async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "penpair-package-docs-"));
  const files: Record<string, string> = {
    "README.md": "Public project README",
    "docs/guide.md": "Maintained guide",
    "docs/conventions/README.md": "Maintained conventions",
    "docs/assets/logo.svg": "Image omitted by the existing package contract",
    "docs/node_modules/cache/private.md": "Local dependency cache",
    "docs/.working-docs/private.md": "Private working notes",
    "examples/demo/README.md": "Public example",
    "examples/.working-docs/private.md": "Private example notes",
    "packages/web/docs/plans/obsolete.md": "Stale generated working plan",
    "packages/web/examples/.working-docs/obsolete.md": "Stale generated private example",
  };
  for (const [relative, contents] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, relative)), {
      recursive: true,
    });
    await writeFile(path.join(root, relative), contents);
  }
  await mkdir(path.join(root, "scripts"));
  await copyFile(source, path.join(root, "scripts/copy-package-docs.mjs"));
  return root;
}

it("refreshes generated docs without retaining old reports, private notes or dependency caches", async () => {
  const root = await fixture();
  const command = path.join(root, "scripts/copy-package-docs.mjs");
  await execute(process.execPath, [
    command,
    "web",
  ]);

  const docs = (
    await readdir(path.join(root, "packages/web/docs"), {
      recursive: true,
    })
  ).sort();
  expect(docs).toEqual([
    "conventions",
    path.join("conventions", "README.md"),
    "guide.md",
  ]);
  expect(await readFile(path.join(root, "packages/web/docs/guide.md"), "utf8")).toBe(
    "Maintained guide",
  );
  expect(await readdir(path.join(root, "packages/web/examples"))).toEqual([
    "demo",
  ]);
  expect(await readFile(path.join(root, "docs/.working-docs/private.md"), "utf8")).toBe(
    "Private working notes",
  );

  await execute(process.execPath, [
    command,
    "web",
  ]);
  expect(
    (
      await readdir(path.join(root, "packages/web/docs"), {
        recursive: true,
      })
    ).sort(),
  ).toEqual(docs);
});

it("refuses unknown package targets before replacing any output", async () => {
  const root = await fixture();
  await expect(
    execute(process.execPath, [
      path.join(root, "scripts/copy-package-docs.mjs"),
      "../..",
    ]),
  ).rejects.toThrow();
  expect(await readFile(path.join(root, "docs/guide.md"), "utf8")).toBe("Maintained guide");
  expect(await readFile(path.join(root, "packages/web/docs/plans/obsolete.md"), "utf8")).toBe(
    "Stale generated working plan",
  );
});
