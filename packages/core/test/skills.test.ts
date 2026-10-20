import { lstat, mkdir, mkdtemp, readFile, readlink, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { describeSkill, installSkills, listBundledSkills, bundledSkillsDirectory } from "../src/skills.js";

const project = async (): Promise<string> => mkdtemp(path.join(os.tmpdir(), "penpair-skills-"));

describe("the shipped skills", () => {
  it("are setup, the Penpot skill and design judgment, each with a SKILL.md that names itself", async () => {
    expect(await listBundledSkills()).toEqual(["design-judgment", "penpair-setup", "penpot-design"]);
    for (const name of await listBundledSkills()) {
      const { name: declared, summary } = await describeSkill(path.join(bundledSkillsDirectory(), name));
      expect(declared).toBe(name);
      expect(summary.length).toBeGreaterThan(20);
    }
  });
});

describe("installing skills", () => {
  it("copies them, makes them discoverable with relative links, and gives a row for the agent guide", async () => {
    const root = await project();
    const report = await installSkills({ root });
    expect(report.installed.length).toBeGreaterThan(10);
    expect(report.linked).toEqual(expect.arrayContaining([".agents/skills/penpot-design", ".claude/skills/design-judgment"]));
    expect(await readlink(path.join(root, ".claude/skills/penpot-design"))).toBe(path.join("..", "..", ".skills", "penpot-design"));
    expect((await lstat(path.join(root, ".claude/skills/penpot-design"))).isSymbolicLink()).toBe(true);
    expect(await readFile(path.join(root, ".claude/skills/penpot-design/SKILL.md"), "utf8")).toMatch(/^name: penpot-design/m);
    expect(report.agentsRows.join("\n")).toMatch(/\| \[penpot-design\]\(\.skills\/penpot-design\/SKILL\.md\) \|/);
  });

  it("is safe to run again: nothing changes, and a file the project edited is kept", async () => {
    const root = await project();
    await installSkills({ root });
    const second = await installSkills({ root });
    expect(second.installed).toEqual([]);
    expect(second.linked).toEqual([]);
    const edited = path.join(root, ".skills/penpot-design/references/write-protocol.md");
    await writeFile(edited, "my changes");
    const third = await installSkills({ root });
    expect(third.kept).toEqual([".skills/penpot-design/references/write-protocol.md"]);
    expect(await readFile(edited, "utf8")).toBe("my changes");
    const forced = await installSkills({ root, force: true });
    expect(forced.installed).toEqual([".skills/penpot-design/references/write-protocol.md"]);
    expect(await readFile(edited, "utf8")).not.toBe("my changes");
  });

  it("never replaces the project's own facts file, not even with force", async () => {
    const root = await project();
    await installSkills({ root });
    const facts = path.join(root, ".skills/penpot-design/references/project-facts.md");
    await writeFile(facts, "# Mine\nfile: demo");
    const forced = await installSkills({ root, force: true });
    expect(forced.kept).toContain(".skills/penpot-design/references/project-facts.md");
    expect(await readFile(facts, "utf8")).toBe("# Mine\nfile: demo");
  });

  it("can install one skill, into another folder, without links", async () => {
    const root = await project();
    const report = await installSkills({ root, only: ["design-judgment"], to: "agent-skills", links: false });
    expect(report.linked).toEqual([]);
    expect(await readdir(path.join(root, "agent-skills"))).toEqual(["design-judgment"]);
    await expect(installSkills({ root, only: ["nope"] })).rejects.toThrow(/no skill named nope/);
  });

  it("does not replace an existing link or folder where a link would go", async () => {
    const root = await project();
    await mkdir(path.join(root, ".claude/skills/penpot-design"), { recursive: true });
    const report = await installSkills({ root });
    expect(report.linked).not.toContain(".claude/skills/penpot-design");
  });
});
