import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolveProjectInput } from "@penpair/core";
import { createJiti } from "jiti";

export interface ThemeReference {
  /** The file, relative to the project, that exports the theme (TypeScript is fine). */
  module: string;
  /** The name of the export that is a Marwes ThemeInput. */
  export: string;
}

/** Loads a theme the project already has, as the app itself would: the same file, the same export. */
export async function loadThemeInput(
  root: string,
  reference: ThemeReference,
): Promise<{
  input: Record<string, unknown>;
  fileHash: string;
}> {
  let file: string;
  let source: Buffer;
  try {
    file = await resolveProjectInput(root, reference.module);
    source = await readFile(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        `The theme file ${reference.module} does not exist (marwes.themes in penpair.config.json).`,
      );
    }
    throw error;
  }
  const jiti = createJiti(file, {
    interopDefault: true,
    moduleCache: false,
  });
  const loaded = (await jiti.import(file)) as Record<string, unknown>;
  const input = loaded[reference.export];
  if (typeof input !== "object" || input === null) {
    throw new Error(`${reference.module} has no object export named ${reference.export}.`);
  }
  return {
    input: input as Record<string, unknown>,
    fileHash: createHash("sha256").update(source).digest("hex").slice(0, 12),
  };
}
