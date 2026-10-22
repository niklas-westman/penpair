import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";

/** Adds a line to the project's .gitignore unless it is already there; says whether it wrote. `directory` adds a trailing slash. */
export async function ensureGitignoreEntry(
  root: string,
  entry: string,
  options: {
    directory?: boolean;
    comment: string;
  },
): Promise<boolean> {
  const file = path.join(root, ".gitignore");
  let text = "";
  try {
    text = await readFile(file, "utf8");
  } catch {
    // no .gitignore yet
  }
  if (text.split(/\r?\n/).some((line) => line.trim() === entry || line.trim() === `${entry}/`)) {
    return false;
  }
  await appendFile(
    file,
    `${text.length > 0 && !text.endsWith("\n") ? "\n" : ""}# ${options.comment}\n${entry}${options.directory ? "/" : ""}\n`,
  );
  return true;
}

/** The MCP key goes in .env.local; whoever writes it makes sure git never sees it. */
export const ensureKeyFileIgnored = (root: string): Promise<boolean> =>
  ensureGitignoreEntry(root, ".env.local", {
    comment: "penpair: your personal Penpot MCP key",
  });
