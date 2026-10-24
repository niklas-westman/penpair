import { lstat, mkdir, mkdtemp, readFile, readlink, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  describeSkill,
  installSkills,
  listBundledSkills,
  bundledSkillsDirectory,
} from "../src/skills.js";

const project = async (): Promise<string> => mkdtemp(path.join(os.tmpdir(), "penpair-skills-"));

describe("the shipped skills", () => {
  it("ship focused setup, operations, recipes, handoff, verification and judgment with self-identifying entrypoints", async () => {
    expect(await listBundledSkills()).toEqual([
      "design-judgment",
      "penpair-design",
      "penpair-design-release",
      "penpair-diagrams",
      "penpair-handoff",
      "penpair-integration-map",
      "penpair-journey-map",
      "penpair-recipes",
      "penpair-setup",
      "penpair-verify",
    ]);
    for (const name of await listBundledSkills()) {
      const { name: declared, summary } = await describeSkill(
        path.join(bundledSkillsDirectory(), name),
      );
      expect(declared).toBe(name);
      expect(summary.length).toBeGreaterThan(20);
    }
  });
});

describe("installing skills", () => {
  it("goes to the folder where the skills already are, not to a second one", async () => {
    const root = await project();
    await installSkills({
      root,
      to: ".claude/skills",
      links: false,
    });
    const again = await installSkills({
      root,
    });
    expect(again.to).toBe(".claude/skills");
    expect(again.installed).toEqual([]);
    await expect(readdir(path.join(root, ".skills"))).rejects.toThrow();
  });

  it("uses .skills in a project that has none yet", async () => {
    expect(
      (
        await installSkills({
          root: await project(),
        })
      ).to,
    ).toBe(".skills");
  });

  it("copies them, makes them discoverable with relative links, and gives a row for the agent guide", async () => {
    const root = await project();
    const report = await installSkills({
      root,
    });
    expect(report.installed.length).toBeGreaterThan(10);
    expect(report.linked).toEqual(
      expect.arrayContaining([
        ".agents/skills/penpair-design",
        ".claude/skills/design-judgment",
      ]),
    );
    expect(await readlink(path.join(root, ".claude/skills/penpair-design"))).toBe(
      path.join("..", "..", ".skills", "penpair-design"),
    );
    expect((await lstat(path.join(root, ".claude/skills/penpair-design"))).isSymbolicLink()).toBe(
      true,
    );
    expect(
      await readFile(path.join(root, ".claude/skills/penpair-design/SKILL.md"), "utf8"),
    ).toMatch(/^name: penpair-design/m);
    expect(report.agentsRows.join("\n")).toMatch(
      /\| \[penpair-design\]\(\.skills\/penpair-design\/SKILL\.md\) \|/,
    );
  });

  it("is safe to run again: nothing changes, and a file the project edited is kept", async () => {
    const root = await project();
    await installSkills({
      root,
    });
    const second = await installSkills({
      root,
    });
    expect(second.installed).toEqual([]);
    expect(second.linked).toEqual([]);
    const edited = path.join(root, ".skills/penpair-design/references/write-protocol.md");
    await writeFile(edited, "my changes");
    const third = await installSkills({
      root,
    });
    expect(third.kept).toEqual([
      ".skills/penpair-design/references/write-protocol.md",
    ]);
    expect(await readFile(edited, "utf8")).toBe("my changes");
    const forced = await installSkills({
      root,
      force: true,
    });
    expect(forced.installed).toEqual([
      ".skills/penpair-design/references/write-protocol.md",
    ]);
    expect(await readFile(edited, "utf8")).not.toBe("my changes");
  });

  it("never replaces the project's own facts file, not even with force", async () => {
    const root = await project();
    await installSkills({
      root,
    });
    const facts = path.join(root, ".skills/penpair-design/references/project-facts.md");
    await writeFile(facts, "# Mine\nfile: demo");
    const forced = await installSkills({
      root,
      force: true,
    });
    expect(forced.kept).toContain(".skills/penpair-design/references/project-facts.md");
    expect(await readFile(facts, "utf8")).toBe("# Mine\nfile: demo");
  });

  it("can install one skill, into another folder, without links", async () => {
    const root = await project();
    const report = await installSkills({
      root,
      only: [
        "design-judgment",
      ],
      to: "agent-skills",
      links: false,
    });
    expect(report.linked).toEqual([]);
    expect(await readdir(path.join(root, "agent-skills"))).toEqual([
      "design-judgment",
    ]);
    await expect(
      installSkills({
        root,
        only: [
          "nope",
        ],
      }),
    ).rejects.toThrow(/no skill named nope/);
  });

  it("does not replace an existing link or folder where a link would go", async () => {
    const root = await project();
    await mkdir(path.join(root, ".claude/skills/penpair-design"), {
      recursive: true,
    });
    const report = await installSkills({
      root,
    });
    expect(report.linked).not.toContain(".claude/skills/penpair-design");
  });
});

describe("a renamed skill", () => {
  it("is reported when the old folder is still there, and the project's own facts move to the new one", async () => {
    const root = await project();
    const old = path.join(root, ".skills/penpot-design/references");
    await mkdir(old, {
      recursive: true,
    });
    await writeFile(path.join(old, "project-facts.md"), "# Facts\n- Penpot: hosted\n");
    const report = await installSkills({
      root,
    });
    expect(report.legacy).toEqual([
      {
        folder: ".skills/penpot-design",
        renamedTo: "penpair-design",
        carriedFacts: true,
      },
    ]);
    expect(
      await readFile(path.join(root, ".skills/penpair-design/references/project-facts.md"), "utf8"),
    ).toBe("# Facts\n- Penpot: hosted\n");
    // Run again: the new file is no longer the template, so nothing is overwritten.
    await writeFile(
      path.join(root, ".skills/penpair-design/references/project-facts.md"),
      "# Newer facts\n",
    );
    expect(
      (
        await installSkills({
          root,
        })
      ).legacy[0],
    ).toMatchObject({
      carriedFacts: false,
    });
    expect(
      await readFile(path.join(root, ".skills/penpair-design/references/project-facts.md"), "utf8"),
    ).toBe("# Newer facts\n");
  });

  it("says nothing when there is no old folder", async () => {
    expect(
      (
        await installSkills({
          root: await project(),
        })
      ).legacy,
    ).toEqual([]);
  });
});

it("reuses an existing Copilot skill folder instead of installing a second physical copy", async () => {
  const root = await project();
  await installSkills({
    root,
    to: ".github/skills",
    links: false,
  });
  const report = await installSkills({
    root,
  });
  expect(report.to).toBe(".github/skills");
  expect(report.installed).toEqual([]);
  await expect(readdir(path.join(root, ".skills"))).rejects.toThrow();
  expect(await readFile(path.join(root, ".agents/skills/penpair-setup/SKILL.md"), "utf8")).toBe(
    await readFile(path.join(root, ".github/skills/penpair-setup/SKILL.md"), "utf8"),
  );
});

it("prefers a canonical pack over a legacy setup guide in another host folder", async () => {
  const root = await project();
  await installSkills({
    root,
    to: ".github/skills",
    links: false,
  });
  const legacy = path.join(root, ".claude/skills/penpair-setup-guide");
  await mkdir(legacy, {
    recursive: true,
  });
  await writeFile(path.join(legacy, "SKILL.md"), "Customized old guide");
  const report = await installSkills({
    root,
  });
  expect(report.to).toBe(".github/skills");
  expect(report.installed).toEqual([]);
  expect((await lstat(path.join(root, ".claude/skills/penpair-setup"))).isSymbolicLink()).toBe(
    true,
  );
  expect(await readFile(path.join(legacy, "SKILL.md"), "utf8")).toBe("Customized old guide");
});
