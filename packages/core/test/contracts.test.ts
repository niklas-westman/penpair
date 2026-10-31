import { readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repository = path.join(import.meta.dirname, "../../..");

/** Where code lives. Mirrors the roots `scripts/check-code-paths.mjs` gates. */
const roots = [
  "packages",
  "scripts",
  "examples",
  "skills",
  "docs/conventions",
];
const codeExtension = /\.(?:[cm]?[jt]s|tsx)$/;
/** Generated output, dependencies, and directories holding only tests or fixtures. */
const skipped = new Set([
  "node_modules",
  "dist",
  "test",
  "tests",
  "testdata",
  "fixture",
  "fixtures",
  "helpers",
  ".penpair",
  ".working-docs",
]);

interface Directory {
  relative: string;
  hasCode: boolean;
  hasContract: boolean;
  children: Directory[];
}

async function walk(relative: string): Promise<Directory> {
  const entries = await readdir(path.join(repository, relative), {
    withFileTypes: true,
  });
  const children: Directory[] = [];
  let hasCode = false;
  let hasContract = false;
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (skipped.has(entry.name)) {
        continue;
      }
      children.push(await walk(path.posix.join(relative, entry.name)));
      continue;
    }
    if (entry.name === "EGM.md") {
      hasContract = true;
    }
    // A test file does not make a directory a code boundary of its own.
    if (codeExtension.test(entry.name) && !/\.test\.[cm]?[jt]sx?$/.test(entry.name)) {
      hasCode = true;
    }
  }
  return {
    relative,
    hasCode,
    hasContract,
    children,
  };
}

function flatten(directory: Directory): Directory[] {
  return [
    directory,
    ...directory.children.flatMap(flatten),
  ];
}

describe("architectural contracts", () => {
  it("gives every directory that holds code an EGM.md, and every parent of one a blueprint", async () => {
    const found = (await Promise.all(roots.map((root) => walk(root)))).flatMap(flatten);
    const carriesCode = (directory: Directory): boolean =>
      directory.hasCode || flatten(directory).some((child) => child.hasCode);
    const missing = found
      .filter((directory) => carriesCode(directory) && !directory.hasContract)
      .map((directory) => directory.relative)
      .sort();
    expect(missing).toEqual([]);
  });

  it("states an interface, invariants and side effects in each contract", async () => {
    const found = (await Promise.all(roots.map((root) => walk(root)))).flatMap(flatten);
    const { readFile } = await import("node:fs/promises");
    const incomplete: string[] = [];
    for (const directory of found.filter((entry) => entry.hasContract)) {
      const text = await readFile(path.join(repository, directory.relative, "EGM.md"), "utf8");
      // A component package states Interface/Invariants/Side Effects; a blueprint
      // states Subdirectories plus the Global variants of the latter two.
      const sections =
        /^## (?:[\w &]*Interface|[\w ]*Invariants|[\w ]*Side Effects|Subdirectories)/gm;
      if ((text.match(sections) ?? []).length < 3) {
        incomplete.push(directory.relative);
      }
    }
    expect(incomplete).toEqual([]);
  });
});
