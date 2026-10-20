import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = path.join(import.meta.dirname, "../src");

/** The files a module imports statically, by relative path (type-only imports included: they are still coupling). */
async function importsOf(file: string): Promise<string[]> {
  const text = await readFile(file, "utf8");
  const out: string[] = [];
  for (const match of text.matchAll(/(?:^|\n)\s*(?:import|export)\s[^;]*?from\s+"(\.[^"]+)"/g)) out.push(path.resolve(path.dirname(file), (match[1] ?? "").replace(/\.js$/, ".ts")));
  return out;
}

async function reachable(entry: string): Promise<Set<string>> {
  const seen = new Set<string>();
  const queue = [path.join(src, entry)];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    queue.push(...(await importsOf(file)));
  }
  return seen;
}

// The Docker way of running Penpot is one profile among others and is meant to become its own package later (@penpair/docker).
// Whatever the connection, the library and the web path need must not depend on it, so that move stays a move.
describe("the Docker code is separate from the connection", () => {
  it.each(["index.ts", "instance/connection.ts", "instance/connect.ts", "instance/config.ts", "instance/runner.ts", "endpoint.ts", "client.ts", "probe.ts", "registry.ts", "skills.ts"])("%s does not reach src/docker", async (entry) => {
    const docker = [...(await reachable(entry))].filter((file) => file.startsWith(path.join(src, "docker")));
    expect(docker).toEqual([]);
  });
});

describe("the version", () => {
  it("is the one in package.json, for both packages", async () => {
    const core = JSON.parse(await readFile(path.join(src, "../package.json"), "utf8")) as { version: string };
    const wrapper = JSON.parse(await readFile(path.join(src, "../../penpair/package.json"), "utf8")) as { version: string; dependencies: Record<string, string> };
    const { version } = await import("../src/index.js");
    expect(version).toBe(core.version);
    expect(wrapper.version).toBe(core.version);
    expect(wrapper.dependencies["@penpair/core"]).toMatch(/^workspace:/);
  });
});
