import { atomicWriteFile } from "./atomic-output.js";
import { resolveProjectOutput } from "./project-input.js";
import {
  planSkillInstructions,
  applySkillInstructions,
  type InstructionReport,
} from "./skill-instructions.js";
import { lstat, mkdir, readdir, readFile, symlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** The skills shipped inside the package (`skills/` next to `dist/`). */
export const bundledSkillsDirectory = (): string =>
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../skills");

/** Files a project fills in. They are written once and never replaced, not even with --force. */
const projectOwned = new Set([
  "references/project-facts.md",
  "PROJECT.md",
]);

export async function listBundledSkills(directory = bundledSkillsDirectory()): Promise<string[]> {
  const entries = await readdir(directory, {
    withFileTypes: true,
  });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function filesUnder(directory: string, prefix = ""): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(path.join(directory, prefix), {
    withFileTypes: true,
  })) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await filesUnder(directory, relative)));
    } else {
      out.push(relative);
    }
  }
  return out.sort();
}

async function readIfExists(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function exists(file: string): Promise<boolean> {
  try {
    await lstat(file);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

/** The skill's name and the first sentence of its description, from the frontmatter, for a row in a project's agent guide. */
export async function describeSkill(skillDirectory: string): Promise<{
  name: string;
  summary: string;
}> {
  const text = (await readIfExists(path.join(skillDirectory, "SKILL.md"))) ?? "";
  const name = /^name:\s*(.+)$/m.exec(text)?.[1]?.trim() ?? path.basename(skillDirectory);
  const description = /^description:\s*(.+)$/m.exec(text)?.[1]?.trim() ?? "";
  return {
    name,
    summary: description.split(/(?<=\.)\s/)[0] ?? description,
  };
}

export interface InstallOptions {
  agents?: string;
  dryRun?: boolean;
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
export const renamedSkills: Record<string, string> = {
  "penpot-design": "penpair-design",
};

export interface InstallReport {
  instructions?: InstructionReport;
  dryRun?: boolean;
  wouldInstall?: string[];
  wouldLink?: string[];
  /** The folder the skills went to, relative to the root. */
  to: string;
  installed: string[];
  unchanged: string[];
  /** Files that differ from the shipped ones and were left alone. */
  kept: string[];
  linked: string[];
  /** One line per skill for the project's AGENTS.md. */
  agentsRows: string[];
  /** Folders of skills that were renamed and are still in the project, and whether their project-facts file was carried over. */
  legacy: {
    folder: string;
    renamedTo: string;
    carriedFacts: boolean;
  }[];
}

/** Where the penpair skills already live in a project as real folders (not links), so a later install goes to the same place. */
export async function existingSkillsFolder(root: string): Promise<string | undefined> {
  for (const folder of [
    ".skills",
    ".claude/skills",
    ".agents/skills",
  ]) {
    for (const name of [
      "penpair-design",
      "penpair-setup",
      ...Object.keys(renamedSkills),
    ]) {
      const found = await lstat(path.join(root, folder, name)).catch(() => undefined);
      if (found?.isDirectory()) {
        return folder;
      }
    }
  }
  return undefined;
}

export async function installSkills(options: InstallOptions): Promise<InstallReport> {
  const source = options.source ?? bundledSkillsDirectory();
  const to = options.to ?? (await existingSkillsFolder(options.root)) ?? ".skills";
  await resolveProjectOutput(options.root, to);
  const names = await listBundledSkills(source);
  const chosen = options.only ?? names;
  for (const name of chosen) {
    if (!names.includes(name)) {
      throw new Error(`no skill named ${name}; shipped: ${names.join(", ")}`);
    }
  }
  const rows = await Promise.all(
    chosen.map(async (name) => {
      const { summary } = await describeSkill(path.join(source, name));
      const link = path.posix
        .join(to, name, "SKILL.md")
        .split("/")
        .map((part) =>
          encodeURIComponent(part).replace(
            /[()]/g,
            (character) => `%${character.charCodeAt(0).toString(16)}`,
          ),
        )
        .join("/");
      return `| [${name}](${link}) | ${summary.replace(/\|/g, "\\|")} |`;
    }),
  );
  const instructionPlan = await planSkillInstructions(options.root, rows, options.agents);
  const report: InstallReport = {
    to,
    installed: [],
    unchanged: [],
    kept: [],
    linked: [],
    agentsRows: rows,
    legacy: [],
    instructions: instructionPlan.report,
    ...(options.dryRun
      ? {
          dryRun: true,
          wouldInstall: [],
          wouldLink: [],
        }
      : {}),
  };
  const writes = new Map<
    string,
    {
      label: string;
      before?: string;
      content: string;
    }
  >();
  const links: {
    file: string;
    target: string;
    label: string;
  }[] = [];
  for (const name of chosen) {
    const from = path.join(source, name);
    for (const file of await filesUnder(from)) {
      const target = await resolveProjectOutput(options.root, path.join(to, name, file));
      const shipped = await readFile(path.join(from, file), "utf8");
      const present = await readIfExists(target);
      const label = path.posix.join(to, name, file);
      if (present === shipped) {
        report.unchanged.push(label);
      } else if (present === undefined || (options.force && !projectOwned.has(file))) {
        writes.set(target, {
          label,
          before: present,
          content: shipped,
        });
      } else {
        report.kept.push(label);
      }
    }
    if (options.links !== false) {
      for (const hub of [
        ".agents/skills",
        ".claude/skills",
      ]) {
        const link = path.join(options.root, hub, name);
        if (path.resolve(link) === path.resolve(options.root, to, name) || (await exists(link))) {
          continue;
        }
        const safe = await resolveProjectOutput(options.root, path.join(hub, name));
        const target = await resolveProjectOutput(options.root, path.join(to, name));
        if (safe === target) {
          continue;
        }
        links.push({
          file: safe,
          target: path.relative(path.dirname(safe), target),
          label: path.posix.join(hub, name),
        });
      }
    }
  }
  for (const [oldName, newName] of Object.entries(renamedSkills)) {
    if (!chosen.includes(newName) || !(await exists(path.join(options.root, to, oldName)))) {
      continue;
    }
    const oldFacts = await readIfExists(
      await resolveProjectOutput(
        options.root,
        path.join(to, oldName, "references/project-facts.md"),
      ),
    );
    const newFactsFile = await resolveProjectOutput(
      options.root,
      path.join(to, newName, "references/project-facts.md"),
    );
    const template = await readIfExists(path.join(source, newName, "references/project-facts.md"));
    const current = writes.get(newFactsFile)?.content ?? (await readIfExists(newFactsFile));
    const carriedFacts = oldFacts !== undefined && oldFacts !== template && current === template;
    if (carriedFacts) {
      writes.set(newFactsFile, {
        label: path.posix.join(to, newName, "references/project-facts.md"),
        before: await readIfExists(newFactsFile),
        content: oldFacts,
      });
    }
    report.legacy.push({
      folder: path.posix.join(to, oldName),
      renamedTo: newName,
      carriedFacts: carriedFacts && !options.dryRun,
    });
  }
  if (options.dryRun) {
    report.wouldInstall = [
      ...writes.values(),
    ].map((write) => write.label);
    report.wouldLink = links.map((link) => link.label);
    return report;
  }
  for (const [file, write] of writes) {
    if ((await readIfExists(file)) !== write.before) {
      throw new Error("A skill file changed after planning; nothing overwrote that file");
    }
    await mkdir(path.dirname(file), {
      recursive: true,
    });
    await atomicWriteFile(file, write.content, {
      replace: write.before !== undefined,
      mode: write.before === undefined ? 0o644 : (await lstat(file)).mode & 0o777,
    });
    report.installed.push(write.label);
  }
  for (const link of links) {
    await mkdir(path.dirname(link.file), {
      recursive: true,
    });
    await symlink(link.target, link.file);
    report.linked.push(link.label);
  }
  if (instructionPlan.report.path) {
    await mkdir(path.dirname(instructionPlan.report.path), {
      recursive: true,
    });
  }
  report.instructions = await applySkillInstructions(instructionPlan);
  return report;
}
