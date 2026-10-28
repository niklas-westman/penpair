import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createLayoutSourceModule } from "./lib/layout-source.mjs";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));

/** Check without rewriting tracked state; generation is an explicit developer action. */
export async function updateLayoutSource({ sourcePath, outputPath, check = false }) {
  const generated = createLayoutSourceModule(await readFile(sourcePath, "utf8"));
  if (check) {
    const existing = await readFile(outputPath, "utf8").catch((error) => {
      if (error.code === "ENOENT") {
        return undefined;
      }
      throw error;
    });
    if (existing !== generated) {
      throw new Error("Sandbox source is missing or stale; run pnpm sandbox:generate");
    }
    return;
  }

  await writeFile(outputPath, generated);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== "--check")) {
    throw new Error("Usage: node scripts/generate-layout-source.mjs [--check]");
  }
  await updateLayoutSource({
    sourcePath: path.join(repositoryRoot, "packages/core/src/layout-settling.ts"),
    outputPath: path.join(repositoryRoot, "packages/core/src/generated/layout-settling-source.ts"),
    check: args[0] === "--check",
  });
  console.log(args[0] === "--check" ? "ok  sandbox source is current" : "generated sandbox source");
}
