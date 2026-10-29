import { readFile, realpath, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import type { HelpTopic } from "./catalog.js";

async function staticJson(file: string): Promise<unknown> {
  if ((await stat(file)).size > 256_000) {
    throw new Error("Help input exceeds its byte budget");
  }
  return JSON.parse(await readFile(file, "utf8"));
}

/** Static, bounded JSON only. Discovery never imports an adapter's executable entrypoint. */
export async function adapterHelp(
  root: string,
  configured?: string[],
): Promise<{
  topics: HelpTopic[];
  notices: string[];
}> {
  const topics: HelpTopic[] = [];
  const notices: string[] = [];
  let names = configured;
  if (!names) {
    try {
      const config = (await staticJson(path.join(root, "penpair.config.json"))) as {
        adapters?: unknown;
      };
      names = Array.isArray(config.adapters)
        ? config.adapters.filter((name: unknown) => typeof name === "string")
        : [];
    } catch {
      notices.push(
        "Project configuration unavailable; core help remains complete. Adapter metadata may be unavailable.",
      );
    }
  }
  for (const name of names ?? []) {
    try {
      if (!/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(name)) {
        throw new Error("Package metadata unavailable for project module");
      }
      const require = createRequire(path.join(root, "package.json"));
      const packageFile = require.resolve(`${name}/package.json`);
      const metadata = (await staticJson(packageFile)) as {
        penpair?: {
          help?: unknown;
        };
      };
      const relative = metadata.penpair?.help;
      if (
        typeof relative !== "string" ||
        !relative.startsWith("./") ||
        relative.split(/[\\/]/).includes("..")
      ) {
        throw new Error("No static penpair.help manifest");
      }
      const folder = await realpath(path.dirname(packageFile));
      const file = await realpath(path.resolve(folder, relative));
      if (!file.startsWith(`${folder}${path.sep}`) || (await stat(file)).size > 256_000) {
        throw new Error("Invalid help manifest location or size");
      }
      const manifest = (await staticJson(file)) as {
        schemaVersion?: unknown;
        topics?: unknown[];
      };
      if (
        manifest.schemaVersion !== 1 ||
        !Array.isArray(manifest.topics) ||
        manifest.topics.length > 200
      ) {
        throw new Error("Unsupported help manifest");
      }
      const validated: HelpTopic[] = manifest.topics.map((topic: unknown) => {
        const value = topic as HelpTopic;
        if (
          !value ||
          !/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*$/.test(value.id) ||
          typeof value.summary !== "string" ||
          ![
            value.usages,
            value.instructions,
            value.related,
          ].every(
            (items) => Array.isArray(items) && items.every((item) => typeof item === "string"),
          ) ||
          !Array.isArray(value.flags) ||
          !value.flags.every(
            (flag) =>
              typeof flag.name === "string" &&
              /^[a-z][a-z0-9-]*$/.test(flag.name) &&
              (flag.description === undefined || typeof flag.description === "string") &&
              (flag.multiple === undefined || typeof flag.multiple === "boolean") &&
              [
                "boolean",
                "string",
              ].includes(flag.type),
          )
        ) {
          throw new Error("Invalid help topic");
        }
        return {
          ...value,
          group: `Adapter ${name}`,
        };
      });
      topics.push(...validated);
    } catch {
      notices.push(
        `Adapter ${JSON.stringify(name)}: static help metadata unavailable; command coverage is unknown. Read its package documentation.`,
      );
    }
  }
  return {
    topics,
    notices,
  };
}
