import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { resolveProjectOutput } from "./project-input.js";
import { atomicWriteFile } from "./atomic-output.js";
import { renderSkillRouting } from "./skill-routing.js";

const start = "<!-- penpair:skills:start -->";
const end = "<!-- penpair:skills:end -->";
export interface InstructionReport {
  path: string | null;
  status: "not-selected" | "choice-required" | "unchanged" | "preview" | "written";
  diff: string;
}
export interface InstructionPlan {
  report: InstructionReport;
  before?: string;
  after?: string;
  mode?: number;
}
async function exists(file: string): Promise<boolean> {
  try {
    await lstat(file);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}
export async function planSkillInstructions(
  root: string,
  rows: string[],
  destination?: string,
): Promise<InstructionPlan> {
  let selected = destination;
  if (!selected) {
    const candidates: string[] = [];
    for (const name of [
      "AGENTS.md",
      "CLAUDE.md",
    ]) {
      if (await exists(path.join(root, name))) {
        candidates.push(name);
      }
    }
    if (candidates.length !== 1) {
      return {
        report: {
          path: null,
          status: candidates.length ? "choice-required" : "not-selected",
          diff: "",
        },
      };
    }
    selected = candidates[0]!;
  }
  const canonicalRoot = await realpath(root);
  const file = await resolveProjectOutput(canonicalRoot, selected);
  let before: string | undefined;
  try {
    before = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
  const text = before ?? "";
  const starts = text.split(start).length - 1;
  const ends = text.split(end).length - 1;
  if (starts !== ends || starts > 1 || (starts === 1 && text.indexOf(start) > text.indexOf(end))) {
    throw new Error(
      "Malformed penpair skills markers; repair them before installation (no instruction text was changed)",
    );
  }
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const relativeRows = rows.map((row) =>
    row.replace(/\]\(([^)]+)\)/g, (_match, target: string) => {
      const relative = path
        .relative(path.dirname(file), path.resolve(canonicalRoot, decodeURIComponent(target)))
        .split(path.sep)
        .join("/");
      const link = relative
        .split("/")
        .map((part) =>
          encodeURIComponent(part).replace(
            /[()]/g,
            (character) => `%${character.charCodeAt(0).toString(16)}`,
          ),
        )
        .join("/");
      return `](${link})`;
    }),
  );
  const block = [
    start,
    ...renderSkillRouting(relativeRows),
    "| Skill | Purpose |",
    "| --- | --- |",
    ...relativeRows,
    end,
  ].join(newline);
  let after: string;
  if (starts === 1) {
    after = text.slice(0, text.indexOf(start)) + block + text.slice(text.indexOf(end) + end.length);
  } else {
    after =
      text +
      (text ? (text.endsWith(newline) ? newline : newline + newline) : "") +
      "## Penpair skills" +
      newline +
      newline +
      block +
      newline;
  }
  const changed = text !== after;
  // Diff only the owned region, never repeat unrelated instruction content in reports.
  const oldBlock = starts ? text.slice(text.indexOf(start), text.indexOf(end) + end.length) : "";
  const diff = changed
    ? [
        `--- ${file}`,
        `+++ ${file}`,
        "@@ penpair-owned skills block @@",
        ...oldBlock
          .split(/\r?\n/)
          .filter(Boolean)
          .map((line) => `-${line}`),
        ...(starts ? block : "## Penpair skills" + newline + newline + block)
          .split(/\r?\n/)
          .map((line) => `+${line}`),
      ].join("\n")
    : "";
  return {
    before,
    after,
    mode: before === undefined ? 0o644 : (await lstat(file)).mode & 0o777,
    report: {
      path: file,
      status: changed ? "preview" : "unchanged",
      diff,
    },
  };
}
export async function applySkillInstructions(plan: InstructionPlan): Promise<InstructionReport> {
  if (plan.report.status !== "preview" || !plan.report.path || plan.after === undefined) {
    return plan.report;
  }
  let current: string | undefined;
  try {
    current = await readFile(plan.report.path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
  if (current !== plan.before) {
    throw new Error("Instruction file changed after planning; nothing was overwritten");
  }
  await atomicWriteFile(plan.report.path, plan.after, {
    replace: plan.before !== undefined,
    mode: plan.mode,
  });
  return {
    ...plan.report,
    status: "written",
  };
}
