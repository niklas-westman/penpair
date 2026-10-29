import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import ts from "typescript";
import { expect, it } from "vitest";
import type { HelpTopic } from "../src/help/catalog.js";
import { coreHelpTopics } from "../src/help/catalog.js";

it.each([
  "marwes-ui",
  "reflection-check",
])("%s ships static help covering its executable parser vocabulary", async (name) => {
  const folder = fileURLToPath(new URL(`../../${name}/`, import.meta.url));
  const metadata = JSON.parse(await readFile(path.join(folder, "package.json"), "utf8"));
  expect(metadata.penpair.help).toBe("./help.json");
  expect(metadata.files).toContain("help.json");
  const manifest = JSON.parse(await readFile(path.join(folder, "help.json"), "utf8")) as {
    schemaVersion: number;
    topics: HelpTopic[];
  };
  expect(manifest.schemaVersion).toBe(1);
  const root = manifest.topics[0]!;
  const ids = manifest.topics.map((topic) => topic.id);
  expect(new Set(ids).size).toBe(ids.length);
  const availableIds = new Set([
    ...ids,
    ...coreHelpTopics(false).map((topic) => topic.id),
  ]);
  for (const topic of manifest.topics) {
    expect(topic.id === root.id || topic.id.startsWith(`${root.id}.`)).toBe(true);
    for (const related of topic.related) {
      expect(availableIds.has(related)).toBe(true);
    }
    for (const usage of topic.usages) {
      expect(usage.startsWith(`penpair ${root.id} `)).toBe(true);
    }
  }
  const flags = new Map<string, string>();
  const usages = new Set<string>();
  for (const file of (await readdir(path.join(folder, "src"))).filter((file) =>
    file.endsWith(".ts"),
  )) {
    const source = ts.createSourceFile(
      file,
      await readFile(path.join(folder, "src", file), "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    const visit = (node: ts.Node): void => {
      if (ts.isStringLiteral(node) && node.text.startsWith(`penpair ${root.id} `)) {
        usages.add(node.text);
      }
      if (
        ts.isPropertyAssignment(node) &&
        node.name.getText(source) === "options" &&
        ts.isObjectLiteralExpression(node.initializer)
      ) {
        for (const property of node.initializer.properties) {
          if (
            !ts.isPropertyAssignment(property) ||
            !ts.isObjectLiteralExpression(property.initializer)
          ) {
            continue;
          }
          const type = property.initializer.properties.find(
            (entry) => ts.isPropertyAssignment(entry) && entry.name.getText(source) === "type",
          ) as ts.PropertyAssignment | undefined;
          if (type && ts.isStringLiteral(type.initializer)) {
            flags.set(
              property.name.getText(source).replaceAll('"', "").replaceAll("'", ""),
              type.initializer.text,
            );
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  expect(
    new Map(
      root.flags.map((flag) => [
        flag.name,
        flag.type,
      ]),
    ),
  ).toEqual(flags);
  for (const usage of usages) {
    expect(root.usages).toContain(usage);
  }
  for (const topic of manifest.topics) {
    expect(topic.usages.length).toBeGreaterThan(0);
    for (const flag of topic.flags) {
      expect(flags.get(flag.name)).toBe(flag.type);
    }
  }
});
