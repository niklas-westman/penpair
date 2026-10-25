import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { readProjectBytes } from "../src/bounded-file.js";

const roots: string[] = [];

async function project(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "penpair-bounded-artifact-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) =>
      rm(root, {
        recursive: true,
        force: true,
      }),
    ),
  );
});

it("reads exact-bound and empty regular artifacts and refuses oversized inputs", async () => {
  const root = await project();
  await writeFile(path.join(root, "exact"), "1234");
  await writeFile(path.join(root, "empty"), "");
  expect((await readProjectBytes(root, "exact", 4)).toString()).toBe("1234");
  expect(await readProjectBytes(root, "empty", 4)).toEqual(Buffer.alloc(0));
  await expect(readProjectBytes(root, "exact", 3)).rejects.toThrow(/budget/);
});

it("rejects directories, invalid limits and paths escaping the project", async () => {
  const root = await project();
  const outside = await project();
  await mkdir(path.join(root, "directory"));
  await writeFile(path.join(outside, "private"), "outside");
  await symlink(path.join(outside, "private"), path.join(root, "escape"));
  await expect(readProjectBytes(root, "directory", 4)).rejects.toThrow(/regular file/);
  await expect(readProjectBytes(root, "escape", 64)).rejects.toThrow(/outside/);
  await expect(readProjectBytes(root, "../outside", 4)).rejects.toThrow(/relative path/);
  await expect(readProjectBytes(root, "directory", 0)).rejects.toThrow(/budget/);
});
