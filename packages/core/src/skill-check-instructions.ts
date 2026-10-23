import path from "node:path";
import { readSkillFile } from "./skill-file.js";
import { skillInstructionMarkers } from "./skill-instructions.js";
import { resolveProjectInput } from "./project-input.js";

export interface SkillInstructionCheck {
  path: string;
  problems: string[];
  links: Record<string, string[]>;
}

export async function resolveSkillLink(
  root: string,
  from: string,
  target: string,
): Promise<string> {
  const decoded = decodeURIComponent(target.split("#")[0]!);
  if (!decoded || path.isAbsolute(decoded) || /^[a-z][a-z0-9+.-]*:/i.test(decoded)) {
    throw new Error("Skill resource link must resolve inside the project");
  }

  const relative = path.relative(root, path.resolve(root, path.dirname(from), decoded));
  return resolveProjectInput(root, relative);
}

export async function checkSkillInstructions(
  root: string,
  instructionFile: string,
): Promise<SkillInstructionCheck> {
  const report: SkillInstructionCheck = {
    path: instructionFile,
    problems: [],
    links: {},
  };

  try {
    const resolved = await resolveProjectInput(root, instructionFile);
    report.path = path.relative(root, resolved).split(path.sep).join("/");
    const source = await readSkillFile(root, report.path);
    const { start, end } = skillInstructionMarkers;
    if (
      source.split(start).length !== 2 ||
      source.split(end).length !== 2 ||
      source.indexOf(start) > source.indexOf(end)
    ) {
      throw new Error("Missing or malformed installer-owned skill routing block");
    }

    const block = source.slice(source.indexOf(start) + start.length, source.indexOf(end));
    const routing = block.split("| Skill | Purpose |")[0]!;
    for (const match of routing.matchAll(/\[([a-z0-9-]+)\]\(([^)]+)\)/g)) {
      (report.links[match[1]!] ??= []).push(match[2]!);
    }
  } catch {
    report.problems.push(
      "Project instructions are missing, unreadable or lack a valid owned routing block; preview skills install --agents with this destination.",
    );
  }

  return report;
}
