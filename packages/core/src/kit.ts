import { createHash } from "node:crypto";
import { coreKitSource } from "./kit-source.js";
import { compiles, snippet } from "./snippet.js";
import { loadAdapters } from "./adapters.js";
import { loadOptionalConfig } from "./instance/config.js";

export interface RecipeInfo {
  name: string;
  description: string;
}
export interface BuildKit {
  include: string;
  source: string;
  recipes: RecipeInfo[];
  requires?: string[];
}
export const coreKit: BuildKit = {
  include: "@kit",
  source: coreKitSource,
  recipes: [
    {
      name: "hello-card",
      description: "A neutral text-in-board example, with explicit token styles",
    },
  ],
};
/** Plain JavaScript to concatenate into a reviewed plugin body; defines the pp namespace. */
export const kit = (): string => coreKitSource;
export function checkKits(kits: BuildKit[]): {
  valid: boolean;
  bytes: number;
  sources: {
    include: string;
    bytes: number;
    sha256: string;
  }[];
  problems: string[];
} {
  const problems: string[] = [];
  const names = new Set<string>();
  const recipeNames = new Set<string>();
  const sources = kits.map((value, index) => {
    if (
      !value ||
      typeof value !== "object" ||
      typeof value.include !== "string" ||
      typeof value.source !== "string"
    ) {
      problems.push("Malformed kit at index " + index);
      return {
        include: "invalid",
        bytes: 0,
        sha256: "",
      };
    }
    if (!/^@[a-z][a-z0-9-]*$/.test(value.include) || names.has(value.include)) {
      problems.push("Invalid or duplicate kit include: " + value.include);
    }
    if (
      value.requires !== undefined &&
      (!Array.isArray(value.requires) || value.requires.some((name) => typeof name !== "string"))
    ) {
      problems.push("Invalid kit dependencies: " + value.include);
    } else {
      for (const dependency of value.requires ?? []) {
        if (!names.has(dependency)) {
          problems.push(`${value.include} requires earlier include ${dependency}`);
        }
      }
    }
    names.add(value.include);
    if (!value.source.startsWith("// penpair: read\n")) {
      problems.push(`${value.include} must declare read-only top-level inclusion`);
    }
    const bytes = Buffer.byteLength(value.source);
    if (bytes > 32768) {
      problems.push(`${value.include} exceeds the 32 KiB source budget`);
    }
    const error = compiles(value.source);
    if (error) {
      problems.push(`${value.include}: ${error}`);
    }
    if (!Array.isArray(value.recipes)) {
      problems.push(`${value.include} has invalid recipe metadata`);
    } else {
      for (const recipe of value.recipes) {
        if (
          !recipe ||
          typeof recipe.name !== "string" ||
          !/^[a-z][a-z0-9-]*$/.test(recipe.name) ||
          typeof recipe.description !== "string"
        ) {
          problems.push(`${value.include} has invalid recipe metadata`);
        } else if (recipeNames.has(recipe.name)) {
          problems.push("Duplicate recipe: " + recipe.name);
        } else {
          recipeNames.add(recipe.name);
        }
      }
    }
    return {
      include: value.include,
      bytes,
      sha256: createHash("sha256").update(value.source).digest("hex"),
    };
  });
  let bytes = sources.reduce((sum, source) => sum + source.bytes, 0);
  try {
    const combined = snippet(
      "kit-check",
      kits
        .filter((value) => value && typeof value.source === "string")
        .map((value) => value.source)
        .join("\n") + "\nreturn {ok:true};",
    );
    bytes = Buffer.byteLength(combined.code);
    const error = compiles(combined.code);
    if (error) {
      problems.push(error);
    }
  } catch (error) {
    problems.push(String((error as Error).message));
  }
  if (bytes > 49152) {
    problems.push("Combined kit exceeds the 48 KiB budget reserved before project code");
  }
  return {
    valid: problems.length === 0,
    bytes,
    sources,
    problems,
  };
}

/** Adapter imports happen only when an explicitly requested alias cannot be supplied by the core. */
export async function loadKits(
  root: string,
  includes: string[] = [
    "@kit",
  ],
): Promise<BuildKit[]> {
  const config = await loadOptionalConfig(root);
  if (includes.length > 20 || new Set(includes).size !== includes.length) {
    throw new Error("Use at most 20 distinct kit includes");
  }
  const available = new Map<string, BuildKit>([
    [
      "@kit",
      coreKit,
    ],
  ]);
  if (includes.some((name) => name !== "@kit")) {
    const loaded = await loadAdapters(root, config?.adapters);
    for (const adapter of loaded.adapters) {
      if (adapter.kits !== undefined && !Array.isArray(adapter.kits)) {
        throw new Error("Adapter kits must be an array: " + adapter.name);
      }
      for (const value of adapter.kits ?? []) {
        if (!value || typeof value.include !== "string") {
          throw new Error("Malformed adapter kit: " + adapter.name);
        }
        if (available.has(value.include)) {
          throw new Error("Ambiguous kit alias: " + value.include);
        }
        available.set(value.include, value);
      }
    }
    for (const name of includes) {
      if (!available.has(name)) {
        throw new Error(
          `Unknown kit ${name}${loaded.problems.length ? ": " + loaded.problems.join("; ") : "; configure an adapter that supplies it"}`,
        );
      }
    }
  }
  const selected = includes.map((name) => {
    const value = available.get(name);
    if (!value) {
      throw new Error("Unknown kit: " + name);
    }
    return value;
  });
  const report = checkKits(selected);
  if (!report.valid) {
    throw new Error(report.problems.join("; "));
  }
  return selected;
}
