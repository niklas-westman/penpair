import { realpath } from "node:fs/promises";
import { bundledSkillsDirectory, listBundledSkills } from "./skills.js";
import { checkSkillEntry, type SkillDiagnostic } from "./skill-check-entry.js";
import { checkSkillInstructions, type SkillInstructionCheck } from "./skill-check-instructions.js";

export interface SkillCheckOptions {
  root: string;
  agents?: string;
  only?: string[];
}

export interface SkillCheckReport {
  agent: "codex";
  ready: boolean;
  instructions: Pick<SkillInstructionCheck, "path" | "problems">;
  skills: SkillDiagnostic[];
  limitations: string[];
}

export async function checkSkills(options: SkillCheckOptions): Promise<SkillCheckReport> {
  const root = await realpath(options.root);
  const bundledDirectory = bundledSkillsDirectory();
  const names = await listBundledSkills(bundledDirectory);
  const selected = options.only ?? names;
  if (!selected.length || selected.some((name) => !names.includes(name))) {
    throw new Error("Select one or more bundled skill names; use penpair skills to list them");
  }

  const instructions = await checkSkillInstructions(root, options.agents ?? "AGENTS.md");
  const skills = await Promise.all(
    [
      ...new Set(selected),
    ].map((name) =>
      checkSkillEntry({
        root,
        name,
        bundledDirectory,
        instructions,
      }),
    ),
  );

  return {
    agent: "codex",
    ready: !instructions.problems.length && skills.every((skill) => !skill.problems.length),
    instructions: {
      path: instructions.path,
      problems: instructions.problems,
    },
    skills,
    limitations: [
      "Offline project-file checks only; no connection, adapter/provider execution, credential reads or writes.",
      "Does not inspect global Codex settings, session skill catalogs, context budgets or UI selection badges.",
      "A valid install and allowed invocation policy do not prove model selection, correct workflow application, visual quality or owner approval.",
    ],
  };
}
