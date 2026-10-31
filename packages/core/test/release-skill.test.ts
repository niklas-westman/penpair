import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkSkills } from "../src/skill-check.js";
import { installSkills } from "../src/skills.js";

const projects: string[] = [];
const selected = [
  "penpair-release",
];

async function project(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "penpair-release-skill-"));
  projects.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    projects.splice(0).map((root) =>
      rm(root, {
        recursive: true,
        force: true,
      }),
    ),
  );
});

describe("release skill discovery", () => {
  it.each([
    {
      agent: "codex",
      instructions: "AGENTS.md",
    },
    {
      agent: "claude",
      instructions: "CLAUDE.md",
    },
  ] as const)(
    "installs a discoverable release workflow for $agent while preserving instructions",
    async ({ agent, instructions }) => {
      const root = await project();
      const owned = "# Project instructions\n\nKeep the reviewed project release scope.\n";
      await writeFile(path.join(root, instructions), owned);

      await installSkills({
        root,
        only: selected,
        agents: instructions,
      });
      const report = await checkSkills({
        root,
        only: selected,
        agent,
        agents: instructions,
      });

      expect(report.ready).toBe(true);
      expect(report.skills[0]).toMatchObject({
        name: "penpair-release",
        entrypoint: "current",
        implicitInvocation: true,
        problems: [],
      });
      expect((await readFile(path.join(root, instructions), "utf8")).startsWith(owned)).toBe(true);

      const repeated = await installSkills({
        root,
        only: selected,
        agents: instructions,
      });
      expect(repeated.installed).toEqual([]);
      expect(repeated.instructions?.status).toBe("unchanged");
    },
  );

  it("reports a missing conditional workflow reference instead of claiming release-skill readiness", async () => {
    const root = await project();
    await installSkills({
      root,
      only: selected,
      agents: "AGENTS.md",
    });
    await rm(path.join(root, ".skills/penpair-release/references/status-and-recovery.md"));

    const report = await checkSkills({
      root,
      only: selected,
      agents: "AGENTS.md",
    });

    expect(report.ready).toBe(false);
    expect(report.skills[0]?.problems.length).toBeGreaterThan(0);
  });

  it("preserves a locally edited release entrypoint and surfaces the mismatch for review", async () => {
    const root = await project();
    await installSkills({
      root,
      only: selected,
      agents: "AGENTS.md",
    });
    const entrypoint = path.join(root, ".skills/penpair-release/SKILL.md");
    const customized = `${await readFile(entrypoint, "utf8")}\nProject-owned review rule.\n`;
    await writeFile(entrypoint, customized);

    const refresh = await installSkills({
      root,
      only: selected,
      agents: "AGENTS.md",
    });
    const report = await checkSkills({
      root,
      only: selected,
      agents: "AGENTS.md",
    });

    expect(refresh.kept).toContain(".skills/penpair-release/SKILL.md");
    expect(await readFile(entrypoint, "utf8")).toBe(customized);
    expect(report.skills[0]?.entrypoint).toBe("modified");
    expect(report.skills[0]?.warnings.length).toBeGreaterThan(0);
  });
});
