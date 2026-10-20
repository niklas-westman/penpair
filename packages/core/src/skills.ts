import { lstat, mkdir, readdir, readFile, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** The skills shipped inside the package (`skills/` next to `dist/`). */
export const bundledSkillsDirectory = (): string => path.join(path.dirname(fileURLToPath(import.meta.url)), "../skills");

/** Files a project fills in. They are written once and never replaced, not even with --force. */
const projectOwned = new Set(["references/project-facts.md", "PROJECT.md"]);

export async function listBundledSkills(directory = bundledSkillsDirectory()): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

async function filesUnder(directory: string, prefix = ""): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(path.join(directory, prefix), { withFileTypes: true })) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) out.push(...(await filesUnder(directory, relative)));
    else out.push(relative);
  }
  return out.sort();
}

async function readIfExists(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, "utf8");
  } catch {
    return undefined;
  }
}

async function exists(file: string): Promise<boolean> {
  try {
    await lstat(file);
    return true;
  } catch {
    return false;
  }
}

/** The skill's name and the first sentence of its description, from the frontmatter, for a row in a project's agent guide. */
export async function describeSkill(skillDirectory: string): Promise<{ name: string; summary: string }> {
  const text = (await readIfExists(path.join(skillDirectory, "SKILL.md"))) ?? "";
  const name = /^name:\s*(.+)$/m.exec(text)?.[1]?.trim() ?? path.basename(skillDirectory);
  const description = /^description:\s*(.+)$/m.exec(text)?.[1]?.trim() ?? "";
  return { name, summary: description.split(/(?<=\.)\s/)[0] ?? description };
}

export interface InstallOptions {
  /** The project's root. */
  root: string;
  /** Where the skills go, relative to the root. */
  to?: string;
  /** Install only these. */
  only?: string[];
  /** Replace files that differ from the shipped ones (never the project-owned ones). */
  force?: boolean;
  /** Make the skills discoverable for Codex and Claude Code with relative links (default true). */
  links?: boolean;
  /** For tests. */
  source?: string;
}

/** Skills that changed name. Installing the new one leaves the old folder behind, which `installSkills` then reports. */
export const renamedSkills: Record<string, string> = { "penpot-design": "penpair-design" };

export interface InstallReport {
  installed: string[];
  unchanged: string[];
  /** Files that differ from the shipped ones and were left alone. */
  kept: string[];
  linked: string[];
  /** One line per skill for the project's AGENTS.md. */
  agentsRows: string[];
  /** Folders of skills that were renamed and are still in the project, and whether their project-facts file was carried over. */
  legacy: { folder: string; renamedTo: string; carriedFacts: boolean }[];
}

export async function installSkills(options: InstallOptions): Promise<InstallReport> {
  const source = options.source ?? bundledSkillsDirectory();
  const to = options.to ?? ".skills";
  const names = await listBundledSkills(source);
  const chosen = options.only ? options.only : names;
  for (const name of chosen) if (!names.includes(name)) throw new Error(`no skill named ${name}; shipped: ${names.join(", ")}`);
  const report: InstallReport = { installed: [], unchanged: [], kept: [], linked: [], agentsRows: [], legacy: [] };
  for (const name of chosen) {
    const from = path.join(source, name);
    for (const file of await filesUnder(from)) {
      const target = path.join(options.root, to, name, file);
      const shipped = await readFile(path.join(from, file), "utf8");
      const present = await readIfExists(target);
      const label = path.posix.join(to, name, file);
      if (present === undefined) {
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, shipped);
        report.installed.push(label);
      } else if (present === shipped) report.unchanged.push(label);
      else if (options.force && !projectOwned.has(file)) {
        await writeFile(target, shipped);
        report.installed.push(label);
      } else report.kept.push(label);
    }
    if (options.links !== false) {
      for (const hub of [".agents/skills", ".claude/skills"]) {
        const link = path.join(options.root, hub, name);
        if (await exists(link)) continue;
        await mkdir(path.dirname(link), { recursive: true });
        await symlink(path.relative(path.dirname(link), path.join(options.root, to, name)), link);
        report.linked.push(path.posix.join(hub, name));
      }
    }
    const { summary } = await describeSkill(from);
    report.agentsRows.push(`| [${name}](${path.posix.join(to, name, "SKILL.md")}) | ${summary} |`);
  }
  for (const [oldName, newName] of Object.entries(renamedSkills)) {
    if (!chosen.includes(newName) || !(await exists(path.join(options.root, to, oldName)))) continue;
    // The project-facts file is the project's own work: carry it over when the new copy is still the empty template.
    const oldFacts = await readIfExists(path.join(options.root, to, oldName, "references/project-facts.md"));
    const newFactsFile = path.join(options.root, to, newName, "references/project-facts.md");
    const template = await readIfExists(path.join(source, newName, "references/project-facts.md"));
    const current = await readIfExists(newFactsFile);
    const carriedFacts = oldFacts !== undefined && oldFacts !== template && current === template;
    if (carriedFacts) await writeFile(newFactsFile, oldFacts);
    report.legacy.push({ folder: path.posix.join(to, oldName), renamedTo: newName, carriedFacts });
  }
  return report;
}

