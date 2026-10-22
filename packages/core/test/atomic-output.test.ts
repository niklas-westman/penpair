import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { atomicWriteFile } from "../src/atomic-output.js";

it("publishes only one complete exclusive output and removes staging files", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "penpair-output-"));
  const destination = path.join(root, "archive.penpot");
  const values = [Buffer.alloc(10000, 1), Buffer.alloc(20000, 2)];
  const results = await Promise.allSettled(values.map((value) => atomicWriteFile(destination, value)));
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  const bytes = await readFile(destination);
  expect(values.some((value) => value.equals(bytes))).toBe(true);
  expect(await readdir(root)).toEqual(["archive.penpot"]);
});

it("preserves an existing archive and atomically replaces only when requested", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "penpair-output-"));
  const destination = path.join(root, "image.png");
  await writeFile(destination, "old");
  await expect(atomicWriteFile(destination, "new")).rejects.toMatchObject({ code: "EEXIST" });
  expect(await readFile(destination, "utf8")).toBe("old");
  await atomicWriteFile(destination, "complete new", { replace: true });
  expect(await readFile(destination, "utf8")).toBe("complete new");
  expect(await readdir(root)).toEqual(["image.png"]);
});
