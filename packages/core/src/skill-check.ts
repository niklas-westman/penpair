import { lstat, realpath } from "node:fs/promises";
import path from "node:path";
import { bundledSkillsDirectory, listBundledSkills } from "./skills.js";
import { checkSkillEntry, type SkillDiagnostic } from "./skill-check-entry.js";
import { checkSkillInstructions, type SkillInstructionCheck } from "./skill-check-instructions.js";
import { skillHosts, validateSkillAgent, type SkillAgent } from "./skill-hosts.js";

export interface SkillCheckOptions {
  root: string;
  agent?: SkillAgent;
  agents?: string;
  only?: string[];
}

export interface SkillCheckReport {
  agent: SkillAgent;
  ready: boolean;
  legacy: string[];
  instructions: Pick<SkillInstructionCheck, "path" | "problems">;
  skills: SkillDiagnostic[];
  limitations: string[];
}

export async function checkSkills(options: SkillCheckOptions): Promise<SkillCheckReport> {
  const agent = validateSkillAgent(options.agent);
  const root = await realpath(options.root);
  const bundledDirectory = bundledSkillsDirectory();
  const names = await listBundledSkills(bundledDirectory);
  const selected = options.only ?? names;
  if (!selected.length || selected.some((name) => !names.includes(name))) {
    throw new Error("Select one or more bundled skill names; use penpair skills to list them");
  }

  const instructions = await checkSkillInstructions(
    root,
    options.agents ?? skillHosts[agent].instructions,
  );
  const skills = await Promise.all(
    [
      ...new Set(selected),
    ].map((name) =>
      checkSkillEntry({
        root,
        agent,
        name,
        bundledDirectory,
        instructions,
      }),
    ),
  );
  const legacy: string[] = [];
  if (selected.includes("penpair-setup")) {
    for (const folder of [
      ".skills",
      ".agents/skills",
      ".claude/skills",
      ".github/skills",
    ]) {
      const relative = path.posix.join(folder, "penpair-setup-guide");
      if (await lstat(path.join(root, relative)).catch(() => undefined)) {
        legacy.push(relative);
      }
    }
  }

  return {
    agent,
    ready:
      !legacy.length &&
      !instructions.problems.length &&
      skills.every((skill) => !skill.problems.length),
    legacy,
    instructions: {
      path: instructions.path,
      problems: instructions.problems,
    },
    skills,
    limitations: [
      "Offline project-file checks only; no connection, adapter/provider execution, credential reads or writes.",
      "Does not inspect global host settings, session skill catalogs, context budgets or UI selection badges.",
      "Checks the selected instruction file, not whether the running host loaded it; Copilot invocation policy is not evaluated.",
      "A valid install and allowed invocation policy do not prove model selection, correct workflow application, visual quality or owner approval.",
    ],
  };
}
