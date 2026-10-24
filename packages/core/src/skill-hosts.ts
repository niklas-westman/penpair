export const skillHosts = {
  codex: {
    folder: ".agents/skills",
    instructions: "AGENTS.md",
  },
  claude: {
    folder: ".claude/skills",
    instructions: "CLAUDE.md",
  },
  copilot: {
    folder: ".agents/skills",
    instructions: "AGENTS.md",
  },
} as const;

export type SkillAgent = keyof typeof skillHosts;

export function validateSkillAgent(value: string = "codex"): SkillAgent {
  if (value === "codex" || value === "claude" || value === "copilot") {
    return value;
  }

  throw new Error("Skill agent must be codex, claude or copilot");
}
