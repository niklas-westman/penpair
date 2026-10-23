import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { parseSkillMetadata, parseSkillYaml } from "./skill-metadata.js";
import { readSkillFile } from "./skill-file.js";
import { resolveSkillLink, type SkillInstructionCheck } from "./skill-check-instructions.js";

export interface SkillDiagnostic {
  name: string;
  path: string;
  implicitInvocation: boolean | null;
  entrypoint: "current" | "modified" | "unavailable";
  problems: string[];
  warnings: string[];
}

interface EntryOptions {
  root: string;
  name: string;
  bundledDirectory: string;
  instructions: SkillInstructionCheck;
}

async function invocationAllowed(root: string, skillPath: string): Promise<boolean> {
  const relative = path.posix.join(path.posix.dirname(skillPath), "agents/openai.yaml");
  const present = await lstat(path.join(root, relative)).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") {
      throw error;
    }
    return undefined;
  });
  if (!present) {
    return true;
  }

  const metadata = parseSkillYaml(await readSkillFile(root, relative));
  if (metadata.policy === undefined) {
    return true;
  }
  if (!metadata.policy || typeof metadata.policy !== "object" || Array.isArray(metadata.policy)) {
    throw new Error("Invalid invocation policy");
  }

  const allowed = (metadata.policy as Record<string, unknown>).allow_implicit_invocation;
  if (allowed !== undefined && typeof allowed !== "boolean") {
    throw new Error("Invocation policy must use a boolean");
  }
  return allowed !== false;
}

export async function checkSkillEntry(options: EntryOptions): Promise<SkillDiagnostic> {
  const { root, name, bundledDirectory, instructions } = options;
  const skillPath = path.posix.join(".agents/skills", name, "SKILL.md");
  const report: SkillDiagnostic = {
    name,
    path: skillPath,
    implicitInvocation: null,
    entrypoint: "unavailable",
    problems: [],
    warnings: [],
  };

  try {
    const source = await readSkillFile(root, skillPath);
    parseSkillMetadata(source, name);
    const bundled = await readFile(path.join(bundledDirectory, name, "SKILL.md"), "utf8");
    report.entrypoint = source === bundled ? "current" : "modified";
    if (report.entrypoint === "modified") {
      report.warnings.push(
        "The discoverable entrypoint differs from the bundled skill; review intentional customization before refresh.",
      );
    }

    const localLinks = [
      ...source.matchAll(/\[[^\]]+\]\(([^)]+)\)/g),
    ]
      .map((match) => match[1]!)
      .filter(
        (target) => target && !target.startsWith("#") && !/^[a-z][a-z0-9+.-]*:/i.test(target),
      );
    if (localLinks.length > 100) {
      throw new Error("Too many local resource links");
    }
    for (const target of localLinks) {
      await resolveSkillLink(root, skillPath, target);
    }

    report.implicitInvocation = await invocationAllowed(root, skillPath);
    if (!report.implicitInvocation) {
      report.problems.push(
        "Implicit invocation is disabled in openai.yaml; explicit invocation remains available.",
      );
    }

    for (const folder of [
      ".skills",
      ".claude/skills",
    ]) {
      const otherPath = path.posix.join(folder, name, "SKILL.md");
      const other = await readSkillFile(root, otherPath).catch(() => undefined);
      if (other !== undefined && other !== source) {
        report.problems.push(
          "Codex and another installed skill copy differ; review the conflicting copies before refreshing.",
        );
      }
    }

    const routes = instructions.links[name] ?? [];
    if (!routes.length) {
      report.problems.push(
        "No generated task route links this skill from the selected instruction file.",
      );
    }
    const resolvedSkill = await realpath(path.join(root, skillPath));
    for (const target of routes) {
      if ((await resolveSkillLink(root, instructions.path, target)) !== resolvedSkill) {
        report.problems.push("An instruction route points to a different skill copy.");
      }
    }
  } catch {
    report.problems.push(
      "Skill discovery, frontmatter, local resources or UI policy is missing, invalid or resolves outside the project; inspect the local files and preview a skill refresh.",
    );
  }

  return report;
}
