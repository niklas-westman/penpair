import { mkdtemp, readFile, readdir, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { runCli } from "../src/cli-main.js";
import { installSkills, listBundledSkills } from "../src/skills.js";
import { planSkillInstructions, applySkillInstructions } from "../src/skill-instructions.js";
const folder = () => mkdtemp(path.join(os.tmpdir(), "penpair-instructions-"));
afterEach(() => vi.restoreAllMocks());
const start = "<!-- penpair:skills:start -->";
const end = "<!-- penpair:skills:end -->";

it("creates an explicitly selected instruction file and a second run is a no-op", async () => {
  const root = await folder();
  const first = await installSkills({
    root,
    agents: "AGENTS.md",
  });
  expect(first.instructions).toMatchObject({
    status: "written",
    path: expect.stringMatching(/AGENTS\.md$/),
  });
  const text = await readFile(path.join(root, "AGENTS.md"), "utf8");
  expect(text).toContain(".skills/penpair-design/SKILL.md");
  // Every bundled skill needs a task-routing row. renderSkillRouting looks each name up in
  // tasksBySkill and silently skips a miss, so a rename without its routing key drops out.
  // Scoped to the "Task | Read first" table on purpose: the instruction file also carries an
  // unfiltered "Skill | Purpose" table, and matching the whole file would pass on that instead.
  const routingTable = text.slice(text.indexOf("| Task | Read first |")).split("\n\n")[0] ?? "";
  const unrouted = (await listBundledSkills()).filter(
    (name) => !routingTable.includes(`.skills/${name}/SKILL.md`),
  );
  expect(unrouted.join(", ")).toBe("");
  const second = await installSkills({
    root,
    agents: "AGENTS.md",
  });
  expect(second.instructions?.status).toBe("unchanged");
  expect(second.installed).toEqual([]);
  expect(await readFile(path.join(root, "AGENTS.md"), "utf8")).toBe(text);
});

it("preserves all bytes outside an owned region, including CRLF", async () => {
  const root = await folder();
  const prefix = "# Owner instructions\r\nKeep these exactly.\r\n\r\n";
  const suffix = "\r\n\r\n## Custom rules\r\nKeep these too.\r\n";
  await writeFile(path.join(root, "AGENTS.md"), prefix + start + "\r\nold rows\r\n" + end + suffix);
  await installSkills({
    root,
  });
  const text = await readFile(path.join(root, "AGENTS.md"), "utf8");
  expect(text.startsWith(prefix + start)).toBe(true);
  expect(text.endsWith(end + suffix)).toBe(true);
  expect(text).not.toContain("old rows");
});

it("routes only selected skills and keeps their nested instruction links resolvable", async () => {
  const root = await folder();
  await installSkills({
    root,
    agents: "docs/AGENTS.md",
    to: "agent skills",
    only: [
      "penpair-handoff",
      "design-judgment",
    ],
  });
  const text = await readFile(path.join(root, "docs/AGENTS.md"), "utf8");
  const links = [
    ...text.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g),
  ];

  expect(new Set(links.map((link) => link[1]))).toEqual(
    new Set([
      "penpair-handoff",
      "design-judgment",
    ]),
  );
  expect(links).toHaveLength(4);
  for (const link of links) {
    const target = path.resolve(root, "docs", decodeURIComponent(link[2]!));
    expect(await readFile(target, "utf8")).toContain(`name: ${link[1]}`);
  }
  expect(text).not.toContain("penpair-setup");
  expect(text).not.toContain("penpair-construct");

  const repeated = await installSkills({
    root,
    agents: "docs/AGENTS.md",
    to: "agent skills",
    only: [
      "penpair-handoff",
      "design-judgment",
    ],
  });
  expect(repeated.instructions?.status).toBe("unchanged");
});

it("appends to a single existing instruction file without a skills table", async () => {
  const root = await folder();
  await writeFile(path.join(root, "CLAUDE.md"), "# Existing\nDo this first.\n");
  expect(
    (
      await installSkills({
        root,
      })
    ).instructions?.status,
  ).toBe("written");
  expect(await readFile(path.join(root, "CLAUDE.md"), "utf8")).toMatch(
    /^# Existing\nDo this first\.\n\n## Penpair skills/,
  );
});

it("does not silently choose between AGENTS.md and CLAUDE.md or create a default absent file", async () => {
  const root = await folder();
  expect(
    (
      await installSkills({
        root,
      })
    ).instructions?.status,
  ).toBe("not-selected");
  await writeFile(path.join(root, "AGENTS.md"), "A");
  await writeFile(path.join(root, "CLAUDE.md"), "C");
  expect(
    (
      await installSkills({
        root,
      })
    ).instructions?.status,
  ).toBe("choice-required");
  expect(await readFile(path.join(root, "AGENTS.md"), "utf8")).toBe("A");
  expect(await readFile(path.join(root, "CLAUDE.md"), "utf8")).toBe("C");
});

it.each([
  start,
  end + "\n" + start,
  start + "\n" + end + "\n" + start + "\n" + end,
])("refuses malformed markers before any skill installation", async (text) => {
  const root = await folder();
  await writeFile(path.join(root, "AGENTS.md"), text);
  await expect(
    installSkills({
      root,
    }),
  ).rejects.toThrow(/Malformed/);
  expect(await readdir(root)).toEqual([
    "AGENTS.md",
  ]);
  expect(await readFile(path.join(root, "AGENTS.md"), "utf8")).toBe(text);
});

it("dry-run previews all outputs without creating files or links", async () => {
  const root = await folder();
  const report = await installSkills({
    root,
    agents: "docs/AGENTS.md",
    to: "agent skills",
    dryRun: true,
  });
  expect(report.instructions).toMatchObject({
    status: "preview",
    diff: expect.stringContaining("../agent%20skills/"),
  });
  expect(report.wouldInstall!.length).toBeGreaterThan(10);
  expect(report.wouldLink!.length).toBeGreaterThan(0);
  expect(report.installed).toEqual([]);
  expect(report.linked).toEqual([]);
  expect(await readdir(root)).toEqual([]);
});

it("preserves an instruction file edited after planning", async () => {
  const root = await folder();
  await writeFile(path.join(root, "AGENTS.md"), "Original");
  const plan = await planSkillInstructions(
    root,
    [
      "| skill | purpose |",
    ],
    "AGENTS.md",
  );
  await writeFile(path.join(root, "AGENTS.md"), "Owner changed it");
  await expect(applySkillInstructions(plan)).rejects.toThrow(/changed after planning/);
  expect(await readFile(path.join(root, "AGENTS.md"), "utf8")).toBe("Owner changed it");
});

it("refuses external and dangling instruction symlinks before installing anything", async () => {
  const root = await folder();
  const outside = await folder();
  await writeFile(path.join(outside, "shared.md"), "protected");
  await symlink(path.join(outside, "shared.md"), path.join(root, "AGENTS.md"));
  await expect(
    installSkills({
      root,
    }),
  ).rejects.toThrow(/outside/);
  expect(await readdir(root)).toEqual([
    "AGENTS.md",
  ]);
  const second = await folder();
  await symlink(path.join(outside, "absent.md"), path.join(second, "AGENTS.md"));
  await expect(
    installSkills({
      root: second,
    }),
  ).rejects.toThrow(/dangling/);
});

it("CLI dry-run returns the preview in one result without writing project files", async () => {
  const root = await folder();
  vi.spyOn(process, "cwd").mockReturnValue(root);
  const output = vi.spyOn(console, "log").mockImplementation(() => undefined);
  expect(
    await runCli([
      "skills",
      "install",
      "--agents",
      "AGENTS.md",
      "--dry-run",
      "--json",
    ]),
  ).toBe(0);
  expect(output).toHaveBeenCalledTimes(1);
  expect(JSON.parse(String(output.mock.calls[0]![0]))).toMatchObject({
    outcome: "success",
    data: {
      dryRun: true,
      instructions: {
        status: "preview",
      },
    },
  });
  expect(await readdir(root)).toEqual([]);
});

it("reports ambiguous instruction integration as incomplete in the CLI", async () => {
  const root = await folder();
  vi.spyOn(process, "cwd").mockReturnValue(root);
  await writeFile(path.join(root, "AGENTS.md"), "A");
  await writeFile(path.join(root, "CLAUDE.md"), "C");
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  const output = vi.spyOn(console, "log").mockImplementation(() => undefined);
  expect(
    await runCli([
      "skills",
      "install",
      "--json",
    ]),
  ).toBe(3);
  expect(JSON.parse(String(output.mock.calls[0]![0]))).toMatchObject({
    outcome: "incomplete",
    completeness: {
      complete: false,
    },
    data: {
      instructions: {
        status: "choice-required",
      },
    },
  });
});
