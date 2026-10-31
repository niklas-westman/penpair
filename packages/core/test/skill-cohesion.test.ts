import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { bundledSkillsDirectory, listBundledSkills } from "../src/skills.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const skillsDirectory = bundledSkillsDirectory();
const preambleFixture = path.join(root, "packages/core/test/fixtures/skill-cli-preamble.txt");
const ownsHeading = "## What this owns";

/** Skills carrying the shared CLI-help preamble. Named rather than derived: "the penpair-operating skills" is not a rule a check can apply. */
const preambleCarriers = [
  "penpair-construct",
  "penpair-design",
  "penpair-handoff",
  "penpair-setup",
  "penpair-verify",
];

const compositionInstruction = "record a short composition decision";

const glossaryTerms = [
  "revision",
  "recipe",
  "verify",
  "contract",
  "design",
  "successor",
  "prerequisite",
];

/** Pages that must name skills to do their job: the generated index, and the glossary entry that says which skill owns which sense of a word. */
const enumerationExempt = new Set([
  "docs/skills.md",
  "docs/glossary.md",
]);

const setCountPattern =
  /\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|\d+)\s+(skills|entrypoints)\b/i;

const skillBody = async (name: string): Promise<string> =>
  readFile(path.join(skillsDirectory, name, "SKILL.md"), "utf8");

/** The section runs from its heading to the next heading of any level, or end of file. Without an end, every later line counts as inside it and the cross-reference rule matches nothing. */
const ownsSection = (
  lines: string[],
): {
  start: number;
  end: number;
} => {
  const start = lines.findIndex((line) => line.trim() === ownsHeading);
  if (start < 0) {
    return {
      start: -1,
      end: -1,
    };
  }
  const after = lines.findIndex((line, index) => index > start && /^#{1,6} /.test(line));
  return {
    start,
    end: after < 0 ? lines.length : after,
  };
};

const frontmatterEnd = (lines: string[]): number => {
  if (lines[0] !== "---") {
    return -1;
  }
  return lines.findIndex((line, index) => index > 0 && line === "---");
};

/** True when the name appears as a whole token outside a path. `penpair-design/references/auto-layout.md` cites a file the skill owns, which the record rules is not a skill edge. The token guard matters because a future `penpair-design-lite` would otherwise register as every reference to `penpair-design`. */
const namesBareSkill = (line: string, skill: string): boolean => {
  for (let at = line.indexOf(skill); at >= 0; at = line.indexOf(skill, at + 1)) {
    const before = line.slice(0, at);
    const after = line.slice(at + skill.length);
    if (before.endsWith("/") || after.startsWith("/")) {
      continue;
    }
    if (/[A-Za-z0-9-]$/.test(before) || /^[A-Za-z0-9-]/.test(after)) {
      continue;
    }
    return true;
  }
  return false;
};

const markdownFiles = async (directory: string): Promise<string[]> => {
  const found: string[] = [];
  for (const entry of await readdir(path.join(root, directory), {
    withFileTypes: true,
  })) {
    const relative = path.posix.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "designs") {
        found.push(...(await markdownFiles(relative)));
      }
    } else if (entry.name.endsWith(".md")) {
      found.push(relative);
    }
  }
  return found;
};

describe("the ten skills read as one set", () => {
  it("states ownership and at least one exclusion in every skill", async () => {
    const problems: string[] = [];
    for (const name of await listBundledSkills()) {
      const lines = (await skillBody(name)).split("\n");
      const { start, end } = ownsSection(lines);
      if (start < 0) {
        problems.push(`${name}/SKILL.md has no "${ownsHeading}" section`);
        continue;
      }
      if (end === lines.length) {
        problems.push(
          `${name}/SKILL.md "${ownsHeading}" has no following heading, so the section never ends`,
        );
      }
      const markers = lines.slice(start, end).filter((line) => /^(Not here|Requires):/.test(line));
      if (!markers.length) {
        problems.push(
          `${name}/SKILL.md "${ownsHeading}" states no "Not here:" or "Requires:" line`,
        );
      }
    }
    expect(problems.join("\n")).toBe("");
  });

  it("marks every cross-reference as a successor or a prerequisite", async () => {
    const names = await listBundledSkills();
    const problems: string[] = [];
    for (const name of names) {
      const lines = (await skillBody(name)).split("\n");
      const { start, end } = ownsSection(lines);
      const metadataEnd = frontmatterEnd(lines);
      // An unbounded ownership section excludes every later line, so this check would pass
      // having examined nothing. Fail loudly instead of reporting a green that means silence.
      if (start >= 0 && end === lines.length) {
        problems.push(
          `${name}/SKILL.md "${ownsHeading}" has no following heading, so no line is outside it and this check examined nothing`,
        );
        continue;
      }
      const others = names.filter((other) => other !== name);
      lines.forEach((line, index) => {
        if (index <= metadataEnd || (index >= start && index < end) || /^\s*\|/.test(line)) {
          return;
        }
        const marked = /^(Next|Requires):/.test(line);
        const named = others.filter((other) => namesBareSkill(line, other));
        if (marked) {
          if (!named.length) {
            problems.push(`${name}/SKILL.md:${index + 1} is marked but names no skill`);
          }
          const next = lines[index + 1];
          if (next !== undefined && next.trim() && !/^(Next|Requires):|^#{1,6} /.test(next)) {
            problems.push(
              `${name}/SKILL.md:${index + 1} wraps or runs on; one edge is one line, then a blank line`,
            );
          }
          return;
        }
        if (named.length) {
          problems.push(
            `${name}/SKILL.md:${index + 1} names ${named.join(", ")} without "Next:" or "Requires:"`,
          );
        }
      });
    }
    expect(problems.join("\n")).toBe("");
  });

  it("keeps the work-order graph acyclic", async () => {
    const names = await listBundledSkills();
    const successors = new Map<string, string[]>(
      names.map((name) => [
        name,
        [],
      ]),
    );
    // Both markers describe the same arrow. `A Next: B` is A before B; `A Requires: B` is
    // B before A, so it contributes a reversed edge. Walking only `Next:` hides any cycle
    // that closes through a `Requires:`, which is how a two-skill cycle survived once.
    for (const name of names) {
      const lines = (await skillBody(name)).split("\n");
      const { start, end } = ownsSection(lines);
      const others = names.filter((other) => other !== name);
      lines.forEach((line, index) => {
        if (index >= start && index < end) {
          return;
        }
        const marker = /^(Next|Requires):/.exec(line);
        if (!marker) {
          return;
        }
        for (const other of others.filter((candidate) => namesBareSkill(line, candidate))) {
          const [from, to] =
            marker[1] === "Next"
              ? [
                  name,
                  other,
                ]
              : [
                  other,
                  name,
                ];
          successors.get(from)?.push(to);
        }
      });
    }
    const state = new Map<string, "open" | "done">();
    const cycles: string[] = [];
    const walk = (name: string, trail: string[]): void => {
      state.set(name, "open");
      for (const next of successors.get(name) ?? []) {
        if (state.get(next) === "open") {
          cycles.push(
            [
              ...trail,
              next,
            ].join(" -> "),
          );
        } else if (!state.has(next)) {
          walk(next, [
            ...trail,
            next,
          ]);
        }
      }
      state.set(name, "done");
    };
    for (const name of names) {
      if (!state.has(name)) {
        walk(name, [
          name,
        ]);
      }
    }
    // A redirect ("that work is not mine") has no direction and belongs in the ownership
    // section. Marked as a successor it closes a loop, which is how three were caught.
    expect(cycles.join("\n")).toBe("");
  });

  it("gives every conditional boundary a stopping rule instead of 'within scope'", async () => {
    // An exclusion says "never mine"; it cannot say "mine unless". Where a skill may act only
    // under conditions, the body must state them. "Within scope" names no condition, so an
    // agent reading it has nothing to stop on.
    const problems: string[] = [];
    for (const name of await listBundledSkills()) {
      (await skillBody(name)).split("\n").forEach((line, index) => {
        if (/\bwithin scope\b/i.test(line)) {
          problems.push(`${name}/SKILL.md:${index + 1} says "within scope" without defining it`);
        }
      });
    }
    const verify = await skillBody("penpair-verify");
    if (!/at most twice/.test(verify)) {
      problems.push("penpair-verify/SKILL.md states no recapture limit for its own repairs");
    }
    expect(problems.join("\n")).toBe("");
  });

  it("keeps the shared CLI preamble identical to its fixture, in exactly the skills that carry it", async () => {
    const preamble = await readFile(preambleFixture, "utf8");
    const carrying: string[] = [];
    for (const name of await listBundledSkills()) {
      if ((await skillBody(name)).includes(preamble)) {
        carrying.push(name);
      }
    }
    expect(carrying.join(", ")).toBe(preambleCarriers.join(", "));
  });

  it("states the composition instruction once, in the skill that owns it", async () => {
    const holders: string[] = [];
    let total = 0;
    for (const name of await listBundledSkills()) {
      const hits = (await skillBody(name)).split(compositionInstruction).length - 1;
      total += hits;
      if (hits) {
        holders.push(`${name} x${hits}`);
      }
    }
    expect(`${total} in ${holders.join(", ") || "no skill"}`).toBe("1 in design-judgment x1");
  });
});

describe("the documentation does not keep its own list of the skills", () => {
  it("never enumerates or counts the set in a prose page", async () => {
    const names = await listBundledSkills();
    const problems: string[] = [];
    for (const file of await markdownFiles("docs")) {
      if (enumerationExempt.has(file)) {
        continue;
      }
      const lines = (await readFile(path.join(root, file), "utf8")).split("\n");
      // A table row maps one thing to one skill; that is not a claim about which skills exist.
      const prose = lines.map((line) => (/^\s*\|/.test(line) ? "" : line));
      for (let index = 0; index < prose.length; index += 1) {
        const window = prose.slice(index, index + 10).join("\n");
        const named = names.filter((name) => window.includes(name));
        if (named.length >= 3) {
          problems.push(`${file}:${index + 1} lists ${named.join(", ")}; link to docs/skills.md`);
          index += 9;
        }
      }
      lines.forEach((line, index) => {
        const counted = setCountPattern.exec(line);
        if (counted) {
          problems.push(`${file}:${index + 1} counts the set ("${counted[0]}")`);
        }
      });
    }
    expect(problems.join("\n")).toBe("");
  });

  it("defines every ambiguous term in the glossary", async () => {
    const glossary = await readFile(path.join(root, "docs/glossary.md"), "utf8");
    const headings = [
      ...glossary.matchAll(/^## (.+)$/gm),
    ].map((found) => found[1]!.trim());
    const missing = glossaryTerms.filter((term) => !headings.includes(term));
    expect(missing.length ? `docs/glossary.md has no heading for: ${missing.join(", ")}` : "").toBe(
      "",
    );
  });
});
