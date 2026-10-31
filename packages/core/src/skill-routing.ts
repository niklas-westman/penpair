const tasksBySkill: Record<string, string> = {
  "penpair-journey-map": "Map user journeys, decisions and recovery paths in Penpot",
  "penpair-integration-map":
    "Connect reviewed journeys to routes, components and data responsibilities",
  "penpair-diagrams": "Draw or reconcile editable native Penpot diagrams",
  "penpair-release":
    "Plan, resume or assess a native Penpot product design release; not Penpair package publishing",
  "penpair-setup": "Install Penpair or repair a Penpot connection",
  "penpair-design": "Inspect, edit, audit or export a Penpot file",
  "penpair-construct": "Build a Penpot screen or derive a state variant from an approved frame",
  "design-judgment": "Choose or critique hierarchy, density and screen states",
  "penpair-handoff": "Implement a frontend from an approved Penpot design",
  "penpair-verify": "Compare a frontend with its approved design or recheck visual fixes",
};

/** Instruction links have already been made relative to their destination. */
export function renderSkillRouting(rows: string[]): string[] {
  const routes: string[] = [];

  for (const row of rows) {
    const match = /^\| \[([a-z0-9-]+)\]\(([^)]+)\) \|/.exec(row);
    if (!match) {
      continue;
    }

    const name = match[1]!;
    const task = tasksBySkill[name];
    if (task) {
      routes.push(`| ${task} | [${name}](${match[2]}) |`);
    }
  }

  if (!routes.length) {
    return [];
  }

  return [
    "Before working on a matching task, read the linked SKILL.md and follow its relevant workflow before running design or implementation tools.",
    "Briefly name the selected skill and its purpose when starting or changing workflow; report actual evidence separately from the intention to use a skill.",
    "Use the smallest applicable set of skills; follow a linked companion only when the task reaches that stage. Skill selection does not authorize additional writes or replace owner approval.",
    "",
    "| Task | Read first |",
    "| --- | --- |",
    ...routes,
    "",
  ];
}
