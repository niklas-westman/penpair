import { createHash } from "node:crypto";
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runCommand } from "../src/cli-main.js";
import { checkSkills } from "../src/skill-check.js";
import { installSkills } from "../src/skills.js";

const folder = () => mkdtemp(path.join(os.tmpdir(), "penpair-skill-check-"));
const selected = [
  "penpair-design",
];

async function installed(): Promise<string> {
  const root = await folder();
  await installSkills({
    root,
    only: selected,
    agents: "AGENTS.md",
  });
  return root;
}

async function snapshot(root: string, relative = ""): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const name of await readdir(path.join(root, relative))) {
    const file = path.join(relative, name);
    const info = await lstat(path.join(root, file));
    if (info.isSymbolicLink()) {
      result[file] = await readlink(path.join(root, file));
    } else if (info.isDirectory()) {
      Object.assign(result, await snapshot(root, file));
    } else {
      result[file] = createHash("sha256")
        .update(await readFile(path.join(root, file)))
        .digest("hex");
    }
  }
  return result;
}

afterEach(() => vi.restoreAllMocks());

describe("offline Codex skill diagnostics", () => {
  it("checks all bundled skills through supported symlinks without changing files", async () => {
    const root = await folder();
    await installSkills({
      root,
      agents: "AGENTS.md",
    });
    const before = await snapshot(root);
    const report = await checkSkills({
      root,
    });

    expect(report.ready).toBe(true);
    expect(report.skills).toHaveLength(11);
    expect(
      report.skills.every(
        (skill) => skill.implicitInvocation === true && skill.entrypoint === "current",
      ),
    ).toBe(true);
    expect(await snapshot(root)).toEqual(before);
  });

  it("supports selected skills, encoded paths and nested instructions", async () => {
    const root = await folder();
    await installSkills({
      root,
      to: "agent skills",
      agents: "docs/AGENTS.md",
      only: selected,
    });
    expect(
      (
        await checkSkills({
          root,
          agents: "docs/AGENTS.md",
          only: selected,
        })
      ).ready,
    ).toBe(true);
    expect(
      (
        await checkSkills({
          root,
        })
      ).ready,
    ).toBe(false);
  });

  it("reports missing skills and instruction integration as incomplete", async () => {
    const report = await checkSkills({
      root: await folder(),
      only: selected,
    });
    expect(report.ready).toBe(false);
    expect(report.instructions.problems.length).toBeGreaterThan(0);
    expect(report.skills[0]?.entrypoint).toBe("unavailable");
  });

  it("resolves routes relative to an in-project instruction symlink's actual file", async () => {
    const root = await installed();
    await mkdir(path.join(root, "instructions"));
    await symlink("../AGENTS.md", path.join(root, "instructions/AGENTS.md"));
    const report = await checkSkills({
      root,
      agents: "instructions/AGENTS.md",
      only: selected,
    });
    expect(report.ready).toBe(true);
    expect(report.instructions.path).toBe("AGENTS.md");
  });

  it("does not echo instruction link contents into diagnostic output", async () => {
    const root = await installed();
    const file = path.join(root, "AGENTS.md");
    const source = await readFile(file, "utf8");
    await writeFile(
      file,
      source.replace(
        /\[penpair-design\]\([^)]+\)/,
        "[penpair-design](https://example.test/private-value)",
      ),
    );
    const report = await checkSkills({
      root,
      only: selected,
    });
    expect(report.ready).toBe(false);
    expect(JSON.stringify(report)).not.toContain("private-value");
  });

  it.each([
    "dangling",
    "external",
  ])("refuses %s discovery links", async (kind) => {
    const root = await installed();
    const outside = await folder();
    const target = path.join(outside, "skill");
    if (kind === "external") {
      await mkdir(target);
      await writeFile(path.join(target, "SKILL.md"), "must not be read as a skill");
    }
    const link = path.join(root, ".agents/skills/penpair-design");
    await unlink(link);
    await symlink(target, link);
    const report = await checkSkills({
      root,
      only: selected,
    });
    expect(report.ready).toBe(false);
    expect(report.skills[0]?.entrypoint).toBe("unavailable");
  });

  it("rejects malformed identities and oversized inputs", async () => {
    const root = await installed();
    const file = path.join(root, ".skills/penpair-design/SKILL.md");
    await writeFile(file, "---\nname: wrong-skill\ndescription: A task\n---\n");
    expect(
      (
        await checkSkills({
          root,
          only: selected,
        })
      ).ready,
    ).toBe(false);
    await writeFile(file, "x".repeat(128 * 1024 + 1));
    expect(
      (
        await checkSkills({
          root,
          only: selected,
        })
      ).ready,
    ).toBe(false);
  });

  it("preserves valid customizations while distinguishing changed entrypoints", async () => {
    const root = await installed();
    const file = path.join(root, ".skills/penpair-design/SKILL.md");
    await writeFile(file, (await readFile(file, "utf8")) + "\nProject-specific guidance.\n");
    const before = await readFile(file, "utf8");
    const report = await checkSkills({
      root,
      only: selected,
    });
    expect(report.ready).toBe(true);
    expect(report.skills[0]?.entrypoint).toBe("modified");
    expect(report.skills[0]?.warnings.length).toBeGreaterThan(0);
    expect(await readFile(file, "utf8")).toBe(before);
  });

  it("detects divergent discoverable and installed copies", async () => {
    const root = await installed();
    const link = path.join(root, ".agents/skills/penpair-design");
    const source = await readFile(path.join(link, "SKILL.md"), "utf8");
    await unlink(link);
    await cp(path.join(root, ".skills/penpair-design"), link, {
      recursive: true,
    });
    await writeFile(path.join(link, "SKILL.md"), source + "\nDivergent copy.\n");
    const report = await checkSkills({
      root,
      only: selected,
    });
    expect(report.ready).toBe(false);
    expect(report.skills[0]?.problems.join()).toMatch(/differ/);
  });

  it("distinguishes disabled implicit invocation from missing optional UI metadata", async () => {
    const root = await installed();
    const directory = path.join(root, ".skills/penpair-design/agents");
    await mkdir(directory, {
      recursive: true,
    });
    const file = path.join(directory, "openai.yaml");
    await writeFile(file, "policy:\n  allow_implicit_invocation: false\n");
    const disabled = await checkSkills({
      root,
      only: selected,
    });
    expect(disabled.ready).toBe(false);
    expect(disabled.skills[0]?.implicitInvocation).toBe(false);
    await writeFile(file, 'policy:\n  allow_implicit_invocation: "false"\n');
    expect(
      (
        await checkSkills({
          root,
          only: selected,
        })
      ).ready,
    ).toBe(false);
    await unlink(file);
    expect(
      (
        await checkSkills({
          root,
          only: selected,
        })
      ).skills[0]?.implicitInvocation,
    ).toBe(true);
  });

  it("detects missing resources and stale routes without treating the catalog as routing", async () => {
    const root = await installed();
    const instructionFile = path.join(root, "AGENTS.md");
    const instructions = await readFile(instructionFile, "utf8");
    await writeFile(instructionFile, instructions.replace(/\| Inspect, edit[^\n]+\n/, ""));
    expect(
      (
        await checkSkills({
          root,
          only: selected,
        })
      ).ready,
    ).toBe(false);
    await writeFile(instructionFile, instructions);
    await unlink(path.join(root, ".skills/penpair-design/references/write-protocol.md"));
    expect(
      (
        await checkSkills({
          root,
          only: selected,
        })
      ).ready,
    ).toBe(false);
  });

  it("returns versioned CLI readiness without loading trusted extensions or writing files", async () => {
    const root = await installed();
    await writeFile(path.join(root, "adapter.mjs"), 'throw new Error("adapter must not execute");');
    await writeFile(
      path.join(root, "penpair.config.json"),
      JSON.stringify({
        instance: "fixture",
        profile: {
          type: "external",
          origin: "https://example.test",
        },
        adapters: [
          "./adapter.mjs",
        ],
      }),
    );
    const before = await snapshot(root);
    vi.spyOn(process, "cwd").mockReturnValue(root);
    const report = await runCommand([
      "skills",
      "check",
      "--only",
      "penpair-design",
      "--json",
    ]);
    expect(report).toMatchObject({
      schemaVersion: 1,
      exitCode: 0,
      outcome: "success",
      data: {
        ready: true,
      },
    });
    const pending = await runCommand([
      "skills",
      "check",
      "--json",
    ]);
    expect(pending).toMatchObject({
      exitCode: 3,
      outcome: "incomplete",
      data: {
        ready: false,
      },
    });
    expect(await snapshot(root)).toEqual(before);
    expect(
      (
        await runCommand([
          "skills",
          "check",
          "--force",
        ])
      ).exitCode,
    ).toBe(1);
    expect(
      (
        await runCommand([
          "skills",
          "unknown",
        ])
      ).exitCode,
    ).toBe(1);
  });

  it("rejects unknown selection before inspecting arbitrary paths", async () => {
    await expect(
      checkSkills({
        root: await folder(),
        only: [
          "../../outside",
        ],
      }),
    ).rejects.toThrow(/bundled/);
  });
});

describe("cross-host skill discovery", () => {
  it.each([
    [
      "codex",
      "AGENTS.md",
      ".agents/skills",
    ],
    [
      "claude",
      "CLAUDE.md",
      ".claude/skills",
    ],
    [
      "copilot",
      "AGENTS.md",
      ".agents/skills",
    ],
  ] as const)(
    "checks %s using its project entrypoint without copying skills",
    async (agent, agents, hub) => {
      const root = await folder();
      await installSkills({
        root,
        agents,
      });
      const before = await snapshot(root);
      const report = await checkSkills({
        root,
        agent,
      });
      expect(report.agent).toBe(agent);
      expect(report.ready).toBe(true);
      expect(report.instructions.path).toBe(agents);
      expect(report.skills.every((skill) => skill.path.startsWith(hub))).toBe(true);
      expect(await snapshot(root)).toEqual(before);
    },
  );

  it("uses only the selected host's invocation policy", async () => {
    const root = await installed();
    await installSkills({
      root,
      only: selected,
      agents: "CLAUDE.md",
    });
    await writeFile(
      path.join(root, ".skills/penpair-design/agents/openai.yaml"),
      "policy:\n  allow_implicit_invocation: false\n",
    );
    expect(
      (
        await checkSkills({
          root,
          only: selected,
        })
      ).ready,
    ).toBe(false);
    expect(
      (
        await checkSkills({
          root,
          only: selected,
          agent: "claude",
        })
      ).ready,
    ).toBe(true);
    expect(
      (
        await checkSkills({
          root,
          only: selected,
          agent: "copilot",
        })
      ).ready,
    ).toBe(true);
    const file = path.join(root, ".skills/penpair-design/SKILL.md");
    await writeFile(
      file,
      (await readFile(file, "utf8")).replace("---\n", "---\ndisable-model-invocation: true\n"),
    );
    expect(
      (
        await checkSkills({
          root,
          only: selected,
          agent: "claude",
        })
      ).ready,
    ).toBe(false);
  });

  it("reports a duplicate old setup guide without deleting customizations", async () => {
    const root = await folder();
    const legacy = path.join(root, ".claude/skills/penpair-setup-guide");
    await mkdir(legacy, {
      recursive: true,
    });
    await writeFile(path.join(legacy, "SKILL.md"), "Owner's customized setup guide");
    const install = await installSkills({
      root,
      agents: "AGENTS.md",
    });
    expect(install.legacy).toContainEqual({
      folder: ".claude/skills/penpair-setup-guide",
      renamedTo: "penpair-setup",
      carriedFacts: false,
    });
    const report = await checkSkills({
      root,
    });
    expect(report.ready).toBe(false);
    expect(report.legacy).toContain(".claude/skills/penpair-setup-guide");
    expect(await readFile(path.join(legacy, "SKILL.md"), "utf8")).toBe(
      "Owner's customized setup guide",
    );
  });

  it("accepts a host selector in the CLI and refuses invalid or misplaced selectors", async () => {
    const root = await folder();
    await installSkills({
      root,
      only: selected,
      agents: "CLAUDE.md",
    });
    vi.spyOn(process, "cwd").mockReturnValue(root);
    const report = await runCommand([
      "skills",
      "check",
      "--agent",
      "claude",
      "--only",
      "penpair-design",
      "--json",
    ]);
    expect(report).toMatchObject({
      exitCode: 0,
      data: {
        agent: "claude",
        ready: true,
      },
    });
    expect(
      (
        await runCommand([
          "skills",
          "check",
          "--agent",
          "unknown",
        ])
      ).exitCode,
    ).toBe(1);
    expect(
      (
        await runCommand([
          "skills",
          "install",
          "--agent",
          "claude",
        ])
      ).exitCode,
    ).toBe(1);
  });
});

it("reports independent identical copies instead of treating them as shared discovery links", async () => {
  const root = await installed();
  const link = path.join(root, ".claude/skills/penpair-design");
  await unlink(link);
  await cp(path.join(root, ".skills/penpair-design"), link, {
    recursive: true,
  });
  const report = await checkSkills({
    root,
    only: selected,
  });
  expect(report.ready).toBe(false);
  expect(report.skills[0]?.problems.join()).toMatch(/Independent skill copies/);
});
