import { readCredential, type CredentialReference } from "../credentials.js";
import { chmod, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseEnvFileValue } from "../endpoint.js";
import {
  configFileName,
  isExternal,
  readProjectConfig,
  type ProjectConfig,
  type ProjectFile,
} from "./config.js";
import { ensureKeyFileIgnored } from "./gitignore.js";
import { endpointIsInstance } from "./connection.js";
import type { Runner } from "./runner.js";

export class ConnectError extends Error {}

/** Everything `connect` and `setup` need from the outside, so they can run in a test without a terminal, a browser or a Penpot. */
export interface ConnectIo {
  say(line: string): void;
  /** Reads a secret without showing it. */
  askHidden(question: string): Promise<string>;
  sleep(ms: number): Promise<void>;
  /** Looks for the editor tab and the plugin; throws until both are there. */
  openFile(url: string): Promise<{
    file: string;
    fileId?: string;
    pages: string[];
  }>;
  /** Optional for noninteractive hosts; a positive answer pins local config, never changes the design. */
  confirmFile?(file: ProjectFile): Promise<boolean>;
}

export const keyVariable = "PENPAIR_MCP_URL";

/** What was pasted, cleaned: surrounding quotes, a `PENPAIR_MCP_URL=` prefix and whitespace are tolerated. Never echoes the text in an error. */
export function parseMcpAddress(pasted: string): {
  url: string;
  origin: string;
} {
  let text = pasted.trim();
  const assignment = /^(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=\s*(.*)$/.exec(text);
  if (assignment) {
    text = (assignment[1] ?? "").trim();
  }
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    text = text.slice(1, -1).trim();
  }
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    throw new ConnectError(
      "That does not look like an address. Copy the whole line Penpot shows under Profile image, Your account, Integration; it starts with https:// (or http:// for Penpot on your computer).",
    );
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ConnectError("The address must start with https:// or http://.");
  }
  if (!parsed.pathname.includes("/mcp")) {
    throw new ConnectError(
      "That address has no /mcp part. Copy the MCP Server address, not the address of the Penpot page.",
    );
  }
  if (!parsed.searchParams.get("userToken")) {
    throw new ConnectError(
      "That address has no key (userToken=...). Copy the full address from Profile image, Your account, Integration.",
    );
  }
  return {
    url: text,
    origin: parsed.origin,
  };
}

/** Whether an MCP address belongs to the Penpot this project is configured for. */
export function belongsToProject(origin: string, config: ProjectConfig): boolean {
  if (isExternal(config)) {
    try {
      return new URL(origin).origin === new URL(config.profile.origin).origin;
    } catch {
      return false;
    }
  }
  return endpointIsInstance(origin, config);
}

export const penpotAddress = (config: ProjectConfig): string =>
  isExternal(config) ? config.profile.origin : `http://127.0.0.1:${config.ports.frontend}`;

/** Writes (or replaces) the key line in .env.local, readable by the owner only, and makes sure git ignores the file. */
export async function writeKeyFile(
  root: string,
  url: string,
): Promise<{
  created: boolean;
  ignoreAdded: boolean;
}> {
  const file = path.join(root, ".env.local");
  let text: string | undefined;
  try {
    text = await readFile(file, "utf8");
  } catch {
    text = undefined;
  }
  const line = `${keyVariable}=${url}`;
  const lines = (text ?? "").split(/\r?\n/);
  const at = lines.findIndex((l) => new RegExp(`^\\s*(?:export\\s+)?${keyVariable}\\s*=`).test(l));
  if (at >= 0) {
    lines[at] = line;
  } else {
    lines.push(line);
  }
  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  await writeFile(file, `${lines.join("\n")}\n`, {
    mode: 0o600,
  });
  await chmod(file, 0o600);
  // Ignored before anything else can happen: a key in an unignored file is one `git add .` from public.
  const ignoreAdded = await ensureKeyFileIgnored(root);
  return {
    created: text === undefined,
    ignoreAdded,
  };
}

export async function readKeyFile(root: string): Promise<string | undefined> {
  try {
    return parseEnvFileValue(await readFile(path.join(root, ".env.local"), "utf8"), keyVariable);
  } catch {
    return undefined;
  }
}

/** Warns when .env.local exists but git would commit it. Asks git itself, so global ignore rules count. */
export async function keyFileCheck(
  root: string,
  runner: Runner,
): Promise<
  | {
      check: string;
      ok: boolean;
      warning?: boolean;
      detail: string;
      remedy?: string;
    }
  | undefined
> {
  let info: Awaited<ReturnType<typeof stat>>;
  try {
    info = await stat(path.join(root, ".env.local"));
  } catch {
    return undefined;
  }
  if (process.platform !== "win32" && (info.mode & 0o077) !== 0) {
    return {
      check: "key file",
      ok: false,
      detail: ".env.local is group/world-readable",
      remedy:
        "Make the private connection file owner-readable only (0600) and verify repository exclusion.",
    };
  }
  const ignored = await runner.run("git", [
    "-C",
    root,
    "check-ignore",
    "-q",
    ".env.local",
  ]);
  if (ignored.code === 1) {
    return {
      check: "key file",
      ok: false,
      detail: ".env.local is tracked or not ignored",
      remedy:
        "Keep .env.local out of Git with .gitignore; if already tracked, coordinate removal and key rotation with the owner.",
    };
  }
  if (ignored.code !== 0) {
    return {
      check: "key file",
      ok: true,
      detail: ".env.local exists; this folder is not a git repository",
    };
  }
  const history = await runner.run("git", [
    "-C",
    root,
    "log",
    "--all",
    "-n",
    "1",
    "--format=%H",
    "--",
    ".env.local",
  ]);
  if (history.code === 0 && history.stdout.trim()) {
    return {
      check: "key file",
      ok: true,
      warning: true,
      detail: ".env.local is ignored now but appears in Git history",
      remedy:
        "Rotate any exposed key through the provider UI; let the owner decide whether history remediation is needed. No historical file contents were read.",
    };
  }
  return {
    check: "key file",
    ok: true,
    detail: ".env.local is private and kept out of git",
  };
}

export interface WaitOptions {
  timeoutMs?: number;
  intervalMs?: number;
  /** How often to repeat the instruction while waiting. */
  remindMs?: number;
}

/** Waits for the editor tab and the plugin, saying in plain words what to do, until `timeoutMs` has passed. */
export async function waitForEditor(
  url: string,
  io: ConnectIo,
  options: WaitOptions = {},
): Promise<
  | {
      file: string;
      fileId?: string;
      pages: string[];
    }
  | undefined
> {
  const timeout = options.timeoutMs ?? 5 * 60_000;
  const interval = options.intervalMs ?? 3_000;
  const remind = options.remindMs ?? 20_000;
  let waited = 0;
  let sinceReminder = remind;
  for (;;) {
    try {
      return await io.openFile(url);
    } catch (error) {
      if (sinceReminder >= remind) {
        const message = String((error as Error).message ?? error);
        const reason = /suspended|heartbeat/i.test(message)
          ? "the Penpot tab is asleep or the plugin is not connected"
          : /refused|ECONN|fetch failed|not found/i.test(message)
            ? "Penpot does not answer yet"
            : "the editor is not connected yet";
        io.say(`Waiting for Penpot (${reason}).`);
        io.say(
          "  In your browser: open a design file, choose File, then MCP Server, then Connect, and keep that tab in front.",
        );
        sinceReminder = 0;
      }
      if (waited >= timeout) {
        return undefined;
      }
      await io.sleep(interval);
      waited += interval;
      sinceReminder += interval;
    }
  }
}

export interface ConnectResult {
  keyWritten: boolean;
  file?: string;
  pages?: string[];
  fileId?: string;
  filePinned?: boolean;
}

/**
 * The connection step: take the personal key without showing it, check that it belongs to this project's Penpot, store it in
 * a git-ignored file, then wait for the editor and plugin and read the file's pages once. Safe to run again.
 */
export async function connectProject(
  root: string,
  config: ProjectConfig,
  io: ConnectIo,
  options: {
    replace?: boolean;
    pasted?: string;
    wait?: WaitOptions;
    anyFile?: boolean;
    environment?: NodeJS.ProcessEnv;
  } = {},
): Promise<ConnectResult> {
  const environment = options.environment ?? process.env;
  let reference: CredentialReference | undefined = config.connection?.credential;
  if (!reference) {
    let text = "";
    try {
      text = await readFile(path.join(root, ".env.local"), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw new ConnectError("Project connection file could not be read");
      }
    }
    const file =
      environment.PENPAIR_MCP_URL_FILE?.trim() || parseEnvFileValue(text, "PENPAIR_MCP_URL_FILE");
    if (file) {
      reference = {
        type: "file",
        path: file,
      };
    } else if (
      environment.PENPAIR_MCP_URL_COMMAND ||
      parseEnvFileValue(text, "PENPAIR_MCP_URL_COMMAND")
    ) {
      throw new ConnectError(
        "Arbitrary credential commands are not enabled; configure a file or OS reference",
      );
    }
  }
  if (reference && options.replace) {
    throw new ConnectError(
      "Rotate the configured credential in its private storage, then reconnect; --replace is for the legacy pasted-URL flow",
    );
  }
  let url = reference
    ? await readCredential(reference, {
        root,
      })
    : options.replace
      ? undefined
      : await readKeyFile(root);
  let keyWritten = false;
  if (url) {
    let origin: string | undefined;
    try {
      origin = parseMcpAddress(url).origin;
    } catch {
      origin = undefined;
    }
    if (origin && belongsToProject(origin, config)) {
      io.say(
        reference
          ? "Using the configured private credential reference; its output stays private."
          : "The key in .env.local belongs to this Penpot, so I will use it. (Run `penpair connect --replace` to paste a new one.)",
      );
    } else if (reference) {
      throw new ConnectError(
        "Configured credential reference belongs to another or invalid Penpot origin; no fallback was used",
      );
    } else {
      url = undefined;
    }
  }
  if (!url) {
    io.say(
      `Open ${penpotAddress(config)}, log in, then click your profile image, choose Your account, then Integration. Toggle MCP to enabled and copy the URL shown on the page.`,
    );
    const pasted =
      options.pasted ??
      (await io.askHidden(
        "Paste the address here and press Enter (nothing is shown as you paste): ",
      ));
    const parsed = parseMcpAddress(pasted);
    if (!belongsToProject(parsed.origin, config)) {
      throw new ConnectError(
        `That address belongs to ${parsed.origin}, but this project uses ${penpotAddress(config)}. Copy the address from that Penpot instead.`,
      );
    }
    const written = await writeKeyFile(root, parsed.url);
    keyWritten = true;
    url = parsed.url;
    io.say(
      `Saved to .env.local${written.ignoreAdded ? " and added it to .gitignore" : ""}. It is only readable by you; never share it.`,
    );
  }
  const editor = await waitForEditor(url, io, options.wait);
  if (!editor) {
    throw new ConnectError(
      "I did not see the editor within five minutes. Open a design file in Penpot, choose File, MCP Server, Connect, keep the tab in front, then run `penpair connect` again.",
    );
  }
  if (config.file && config.file.id !== editor.fileId && !options.anyFile) {
    throw new ConnectError(
      `Expected file "${config.file.name ?? config.file.id}" (${config.file.id}), connected to "${editor.file}" (${editor.fileId ?? "unknown id"}). Open the expected file and reconnect.`,
    );
  }
  let filePinned = false;
  if (
    !config.file &&
    editor.fileId &&
    (await io.confirmFile?.({
      id: editor.fileId,
      name: editor.file,
    }))
  ) {
    const raw = await readProjectConfig(root);
    if (!raw || raw.file) {
      throw new ConnectError(
        "The project configuration changed while connecting. Inspect it and connect again; no file pin was replaced.",
      );
    }
    await writeFile(
      path.join(root, configFileName),
      `${JSON.stringify(
        {
          ...raw,
          file: {
            id: editor.fileId,
            name: editor.file,
          },
        },
        null,
        2,
      )}\n`,
    );
    filePinned = true;
    io.say("Pinned the design file ID in penpair.config.json. Commit that file for your team.");
  }
  if (!config.file && !filePinned) {
    io.say(
      "No file ID is pinned yet. Run `penpair connect --pin-file` to protect against a different file being open.",
    );
  }
  io.say(
    `Connected to the file "${editor.file}" (${editor.pages.length} page${editor.pages.length === 1 ? "" : "s"}: ${editor.pages.slice(0, 6).join(", ")}${editor.pages.length > 6 ? ", ..." : ""}).`,
  );
  return {
    keyWritten,
    file: editor.file,
    pages: editor.pages,
    fileId: editor.fileId,
    filePinned,
  };
}
