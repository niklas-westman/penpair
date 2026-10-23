import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseSkillMetadata, parseSkillYaml } from "../src/skill-metadata.js";
import { bundledSkillsDirectory, listBundledSkills } from "../src/skills.js";

describe("skill metadata", () => {
  it("decodes quoted and folded descriptions instead of copying YAML syntax", () => {
    expect(
      parseSkillMetadata('---\nname: "example-skill"\ndescription: "Inspect: a design."\n---\n'),
    ).toEqual({
      name: "example-skill",
      description: "Inspect: a design.",
    });
    expect(
      parseSkillMetadata(
        "---\nname: example-skill\ndescription: >-\n  Inspect a design\n  before changing it.\n---\n",
      ).description,
    ).toBe("Inspect a design before changing it.");
  });

  it.each([
    "name: example-skill\ndescription: Missing delimiters",
    "---\nname: example-skill\nname: other\ndescription: Duplicate\n---\n",
    "---\nname: Wrong_Name\ndescription: Invalid name\n---\n",
    "---\nname: example-skill\ndescription: [not, text]\n---\n",
    "---\nname: example-skill\ndescription: ''\n---\n",
    "---\nname: example-skill\ndescription: !custom unsafe\n---\n",
  ])("rejects invalid metadata without reporting source values", (source) => {
    expect(() => parseSkillMetadata(source)).toThrow();
  });

  it("rejects mismatched identities, oversized files and YAML alias expansion", () => {
    const source = "---\nname: example-skill\ndescription: A task\n---\n";
    expect(() => parseSkillMetadata(source, "different-skill")).toThrow(/folder/);
    expect(() => parseSkillMetadata(source + "x".repeat(128 * 1024))).toThrow(/limit/);
    expect(() => parseSkillYaml("name: &identity example\ndescription: *identity")).toThrow(
      /aliases/,
    );
  });

  it("ships valid identities and resolvable relative resources for every skill", async () => {
    for (const name of await listBundledSkills()) {
      const directory = path.join(bundledSkillsDirectory(), name);
      const source = await readFile(path.join(directory, "SKILL.md"), "utf8");
      expect(parseSkillMetadata(source, name).name).toBe(name);
      const files = [
        "SKILL.md",
      ];

      async function collectResources(relative: string): Promise<void> {
        for (const entry of await readdir(path.join(directory, relative), {
          withFileTypes: true,
        })) {
          const resource = path.join(relative, entry.name);
          if (entry.isDirectory()) {
            await collectResources(resource);
          } else if (entry.name.endsWith(".md")) {
            files.push(resource);
          }
        }
      }

      await collectResources("references");
      for (const file of files) {
        const text = await readFile(path.join(directory, file), "utf8");
        for (const match of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
          const target = match[1]!.split("#")[0]!;
          if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) {
            continue;
          }
          await expect(
            access(path.resolve(directory, path.dirname(file), decodeURIComponent(target))),
          ).resolves.toBeUndefined();
        }
      }
    }
  });
});
