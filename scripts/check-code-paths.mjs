import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const codeRoots = /^(?:packages|scripts|examples|skills|docs\/conventions)\//;
const codeExtension = /\.(?:[cm]?[jt]s|tsx)$/;
const kebabCase = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Biome checks filenames; this also checks the directories that contain code.
 * @param {string[]} filePaths
 * @returns {string[]}
 */
export function findInvalidCodeDirectories(filePaths) {
  const invalidDirectories = new Set();

  for (const filePath of filePaths) {
    if (!codeRoots.test(filePath) || !codeExtension.test(filePath)) {
      continue;
    }

    const directories = filePath.split("/").slice(0, -1);

    for (const [index, directory] of directories.entries()) {
      if (!kebabCase.test(directory)) {
        invalidDirectories.add(directories.slice(0, index + 1).join("/"));
      }
    }
  }

  return [
    ...invalidDirectories,
  ].sort();
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const filePaths = execFileSync(
    "git",
    [
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "-z",
    ],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
    },
  ).split("\0");
  const invalidDirectories = findInvalidCodeDirectories(filePaths);

  if (invalidDirectories.length > 0) {
    console.error(`Code directories must use kebab-case:\n${invalidDirectories.join("\n")}`);
    process.exitCode = 1;
  } else {
    console.log("ok  code directories use kebab-case");
  }
}
