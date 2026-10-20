import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The core is a framework: it must stay free of the projects and libraries that adopt it.
const forbidden = ["sourcer", "tradient", "marwes"];
const here = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = path.join(here, "../src");
const skillsRoot = path.join(here, "../skills");
const dockerRoot = path.join(here, "../../docker/src");

async function filesUnder(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const full = path.join(directory, entry.name);
      return entry.isDirectory() ? filesUnder(full) : Promise.resolve([full]);
    }),
  );
  return nested.flat();
}

export async function findForbidden(directory: string): Promise<string[]> {
  const hits: string[] = [];
  for (const file of await filesUnder(directory)) {
    const text = (await readFile(file, "utf8")).toLowerCase();
    for (const word of forbidden) if (text.includes(word)) hits.push(`${path.relative(directory, file)}: ${word}`);
  }
  return hits;
}

describe("core neutrality", () => {
  it("names no project or component library", async () => {
    expect(await findForbidden(sourceRoot)).toEqual([]);
  });

  it("holds for the Docker package too", async () => {
    expect(await findForbidden(dockerRoot)).toEqual([]);
  });

  it("keeps the shipped skills just as neutral", async () => {
    expect(await findForbidden(skillsRoot)).toEqual([]);
  });

  it("would notice one that slipped in", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "penpair-neutral-"));
    await writeFile(path.join(directory, "x.ts"), "// built for Tradient");
    expect(await findForbidden(directory)).toEqual(["x.ts: tradient"]);
  });
});
