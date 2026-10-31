import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseSkillMetadata } from "../packages/core/dist/skill-metadata.js";
import { bundledSkillsDirectory, listBundledSkills } from "../packages/core/dist/skills.js";

const sourceUrl = "https://github.com/niklas-westman/penpair/blob/main/packages/core/skills";

const cell = (text) => text.replaceAll("|", "\\|");

export async function skillIndexMarkdown() {
  const directory = bundledSkillsDirectory();
  const names = await listBundledSkills(directory);
  const rows = [];
  for (const name of names) {
    const { description } = parseSkillMetadata(
      await readFile(path.join(directory, name, "SKILL.md"), "utf8"),
      name,
    );
    rows.push(`| [\`${name}\`](${sourceUrl}/${name}/SKILL.md) | ${cell(description)} |`);
  }
  return `# Skills

Generated from the bundled skill set. Regenerate with \`pnpm docs:generate\`; tests detect drift.

This page is the only maintained list of which skills exist. Other pages link here rather than repeating the set, so that a new or renamed skill cannot leave a stale list behind.

\`penpair skills install\` copies these ${names.length} skills into a project and writes a routing table into its instruction file. Each skill opens with a \`## What this owns\` section giving its purpose and naming the neighbour that owns the adjacent work; cross-references inside a skill are marked \`Next:\` (work flows there when this is done) or \`Requires:\` (read first, it produces this skill's input). See the [glossary](glossary.md) for the words those statements rely on.

| Skill | What it is for |
| --- | --- |
${rows.join("\n")}

Skills are listed alphabetically, which is the order \`penpair skills install\` reports them in. It is not a sequence to work through: read the one that matches the task, and follow its marked edges from there. [Check skill discovery and behavior](skill-validation.md) before relying on an installed set.
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await writeFile(new URL("../docs/skills.md", import.meta.url), await skillIndexMarkdown());
}
